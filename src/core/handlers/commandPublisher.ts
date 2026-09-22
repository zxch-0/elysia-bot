import { REST, Routes } from 'discord.js';
import type { ElysiaClient } from '../client';
import { loadConfig, type CommandsScope } from '../config';
import { logger } from '../logger';

const log = logger.child('publisher');

/** Portée réellement utilisée après résolution de `COMMANDS_SCOPE`. */
export type ResolvedScope = 'guild' | 'global';

/** Commande telle que renvoyée par l'API Discord (champs utiles seulement). */
export interface ScopeCommand {
  id: string;
  name: string;
}

/** État des commandes publiées, portée par portée. */
export interface ScopeInspection {
  global: ScopeCommand[];
  guilds: Array<{ guildId: string; commands: ScopeCommand[] }>;
  /** Noms présents à la fois en global et sur au moins un serveur → doublons visibles. */
  duplicates: string[];
}

export interface PublishReport {
  scope: ResolvedScope;
  /** Nombre de commandes publiées dans la portée conservée. */
  published: number;
  /** Noms dupliqués détectés dans le catalogue local (ne devrait jamais arriver). */
  duplicates: string[];
  /** Commandes supprimées pour éviter les doublons. */
  cleaned: { global: number; guilds: Array<{ guildId: string; removed: number }> };
}

/**
 * Détermine la portée de publication.
 *
 *  • `guild`  → uniquement sur `DEV_GUILD_ID` (publication instantanée, idéal débutant).
 *  • `global` → partout (propagation jusqu'à 1 h).
 *  • `both`   → renvoie `global` : c'est {@link publishCommands} qui publie
 *               réellement les deux portées (⚠️ Discord affiche alors CHAQUE
 *               commande en double sur le serveur de développement).
 *  • `auto`   → `guild` si `DEV_GUILD_ID` est défini et que le bot n'est présent
 *               que sur ce serveur ; sinon `global` (pour ne jamais priver les
 *               autres serveurs de leurs commandes).
 */
export function resolveCommandsScope(input: { commandsScope: CommandsScope; devGuildId?: string; guildCount?: number }): ResolvedScope {
  const guildCount = input.guildCount ?? 1;

  if (input.commandsScope === 'guild') return input.devGuildId ? 'guild' : 'global';
  if (input.commandsScope === 'global') return 'global';
  if (input.commandsScope === 'both') return 'global';

  // auto
  if (input.devGuildId && guildCount <= 1) return 'guild';
  return 'global';
}

/**
 * Dédoublonne le catalogue par nom avant l'envoi à Discord.
 * Discord refuse une liste contenant deux fois le même nom (400 Bad Request) :
 * mieux vaut ignorer le second et prévenir que faire échouer toute la publication.
 */
export function dedupeCommandBody<T extends { data: { name: string; toJSON(): unknown } }>(
  commands: T[],
): { body: unknown[]; duplicates: string[] } {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const body: unknown[] = [];

  for (const command of commands) {
    const name = command.data.name;
    if (seen.has(name)) {
      duplicates.push(name);
      continue;
    }
    seen.add(name);
    body.push(command.data.toJSON());
  }

  return { body, duplicates };
}

async function resolveApplicationId(client: ElysiaClient): Promise<string> {
  const config = loadConfig();

  // Après ClientReady, client.application est garanti d'être renseigné.
  const appFromClient = client.user?.id ?? client.application?.id ?? null;

  if (config.clientId) {
    // Vérification de cohérence : si CLIENT_ID ne correspond pas au token utilisé,
    // les commandes seraient publiées sur la MAUVAISE application → « commande inconnue ».
    if (appFromClient && config.clientId !== appFromClient) {
      throw new Error(
        `CLIENT_ID (${config.clientId}) ne correspond PAS à l'ID du bot connecté (${appFromClient}). ` +
          "CLÉS INCOHÉRENTES : les commandes seraient publiées sur une autre application et Discord répondrait « commande inconnue ». " +
          "Corrigez CLIENT_ID : il doit s'agir de l'Application ID de la MÊME application que DISCORD_TOKEN.",
      );
    }
    return config.clientId;
  }

  if (appFromClient) return appFromClient;
  throw new Error(
    'CLIENT_ID introuvable : renseignez-le dans .env (Developer Portal → General Information → Application ID). ' +
      'Sans lui, les slash-commands ne peuvent pas être publiées, et les utilisateurs verront « Cette commande n’est pas disponible ».',
  );
}

function scopeRoute(applicationId: string, guildId?: string): `/${string}` {
  return (guildId ? Routes.applicationGuildCommands(applicationId, guildId) : Routes.applicationCommands(applicationId)) as `/${string}`;
}

/** Liste les commandes réellement enregistrées auprès de Discord pour une portée. */
async function listScope(rest: REST, applicationId: string, guildId?: string): Promise<ScopeCommand[]> {
  const data = (await rest.get(scopeRoute(applicationId, guildId))) as Array<{ id: string; name: string }>;
  return data.map((entry) => ({ id: entry.id, name: entry.name }));
}

async function overwriteScope(rest: REST, applicationId: string, body: unknown[], guildId?: string): Promise<void> {
  await rest.put(scopeRoute(applicationId, guildId), { body });
}

/** Identifiants de serveurs à inspecter : le serveur de dev + tous ceux du cache. */
function guildsToInspect(client: ElysiaClient): string[] {
  const ids = new Set<string>();
  const devGuildId = loadConfig().devGuildId;
  if (devGuildId) ids.add(devGuildId);
  for (const guild of client.guilds.cache.values()) ids.add(guild.id);
  return [...ids];
}

/**
 * Compare les commandes globales et celles publiées sur chaque serveur :
 * une commande présente dans les deux portées apparaît **deux fois** dans le
 * sélecteur Discord de ce serveur.
 */
export async function inspectCommandScopes(client: ElysiaClient): Promise<ScopeInspection> {
  const config = loadConfig();
  if (!config.token) throw new Error('DISCORD_TOKEN manquant : impossible d’inspecter les commandes.');

  const rest = new REST({ version: '10' }).setToken(config.token);
  const applicationId = await resolveApplicationId(client);

  const global = await listScope(rest, applicationId);
  const guilds: ScopeInspection['guilds'] = [];
  const duplicates = new Set<string>();

  for (const guildId of guildsToInspect(client)) {
    let commands: ScopeCommand[] = [];
    try {
      commands = await listScope(rest, applicationId, guildId);
    } catch (error) {
      // 403 « Missing Access » : le bot n'est pas (ou plus) sur ce serveur.
      log.debug(`Inspection impossible pour le serveur ${guildId}`, error as Error);
      continue;
    }
    guilds.push({ guildId, commands });
    const globalNames = new Set(global.map((entry) => entry.name));
    for (const command of commands) if (globalNames.has(command.name)) duplicates.add(command.name);
  }

  return { global, guilds, duplicates: [...duplicates].sort() };
}

/**
 * Supprime les commandes de la portée NON conservée, pour qu'une commande
 * n'apparaisse jamais deux fois (serveur + global).
 * Renvoie le nombre de commandes supprimées par portée.
 */
async function cleanOtherScope(
  client: ElysiaClient,
  rest: REST,
  applicationId: string,
  keep: ResolvedScope,
): Promise<PublishReport['cleaned']> {
  const cleaned: PublishReport['cleaned'] = { global: 0, guilds: [] };

  if (keep === 'guild') {
    const existing = await listScope(rest, applicationId).catch(() => [] as ScopeCommand[]);
    if (existing.length > 0) {
      await overwriteScope(rest, applicationId, []);
      cleaned.global = existing.length;
    }
    return cleaned;
  }

  // keep === 'global' : on purge les commandes de serveur (aucune n'est publiée
  // volontairement par Elysia dans cette portée).
  for (const guildId of guildsToInspect(client)) {
    try {
      const existing = await listScope(rest, applicationId, guildId);
      if (existing.length === 0) continue;
      await overwriteScope(rest, applicationId, [], guildId);
      cleaned.guilds.push({ guildId, removed: existing.length });
    } catch (error) {
      log.debug(`Nettoyage impossible pour le serveur ${guildId}`, error as Error);
    }
  }

  return cleaned;
}

/**
 * Publie toutes les commandes chargées auprès de Discord — **dans une seule
 * portée** afin d'éviter les doublons dans le sélecteur de commandes.
 *
 *  • `COMMANDS_SCOPE=guild`  → publication instantanée sur `DEV_GUILD_ID`.
 *  • `COMMANDS_SCOPE=global` → publication globale (propagation jusqu'à 1 h).
 *  • `COMMANDS_SCOPE=both`   → les deux (doublons assumés, déconseillé).
 *  • `COMMANDS_SCOPE=auto`   → voir {@link resolveCommandsScope}.
 *
 * L'ancienne portée est nettoyée après une publication réussie : un bot qui
 * était publié en global ET sur un serveur n'affiche plus chaque commande en
 * double au prochain démarrage.
 */
export async function publishCommands(client: ElysiaClient, options: { clear?: boolean } = {}): Promise<PublishReport> {
  const config = loadConfig();
  const token = config.token;
  if (!token) throw new Error('DISCORD_TOKEN manquant : impossible de publier les commandes.');

  const rest = new REST({ version: '10' }).setToken(token);
  const applicationId = await resolveApplicationId(client);
  const requested = config.commandsScope;
  const scope = resolveCommandsScope({ commandsScope: requested, devGuildId: config.devGuildId, guildCount: client.guilds.cache.size });
  const both = requested === 'both' && Boolean(config.devGuildId);

  const { body, duplicates } = dedupeCommandBody([...client.commands.values()]);
  if (duplicates.length > 0) {
    log.warn(`Commandes dupliquées dans le catalogue local (ignorées) : ${duplicates.join(', ')}`);
  }

  const cleaned: PublishReport['cleaned'] = { global: 0, guilds: [] };

  if (options.clear) {
    log.info('Suppression des commandes existantes…');
    await overwriteScope(rest, applicationId, []);
    if (config.devGuildId) await overwriteScope(rest, applicationId, [], config.devGuildId).catch(() => undefined);
  }

  if (both && config.devGuildId) {
    // Mode historique : les deux portées (Discord affichera des doublons).
    log.warn(
      'COMMANDS_SCOPE=both : chaque commande sera visible DEUX FOIS sur le serveur ' +
        `${config.devGuildId} (section « Commandes de serveur » + section globale). Utilisez « auto » pour éviter les doublons.`,
    );
    await overwriteScope(rest, applicationId, body, config.devGuildId);
    await overwriteScope(rest, applicationId, body);
    log.success(`${body.length} commande(s) publiée(s) sur le serveur ${config.devGuildId} ET en global`);
    return { scope, published: body.length, duplicates, cleaned };
  }

  if (scope === 'guild' && config.devGuildId) {
    try {
      await overwriteScope(rest, applicationId, body, config.devGuildId);
      log.success(`${body.length} commande(s) publiée(s) sur le serveur de développement ${config.devGuildId} (publication instantanée)`);
    } catch (error) {
      // 403 « Missing Access » : le serveur DEV_GUILD_ID est inaccessible pour
      // l'application. On bascule sur la publication globale pour ne pas laisser
      // le bot sans aucune commande.
      log.warn(`Publication sur le serveur de développement ${config.devGuildId} impossible — bascule en publication globale`, error as Error);
      log.warn('➜ Vérifiez que le bot est bien PRÉSENT sur ce serveur (DEV_GUILD_ID correct ?)');
      log.warn('➜ Vérifiez qu’il a été invité avec le scope « applications.commands » (OAuth2 → URL Generator : bot + applications.commands)');
      log.warn('➜ Vérifiez que CLIENT_ID correspond à l’Application ID de la même application que DISCORD_TOKEN');
      await overwriteScope(rest, applicationId, body);
      log.success(`${body.length} commande(s) publiée(s) globalement`);
      return { scope: 'global', published: body.length, duplicates, cleaned };
    }
  } else {
    await overwriteScope(rest, applicationId, body);
    log.success(`${body.length} commande(s) publiée(s) globalement (propagation ≈ 1 h)`);
  }

  // La publication a réussi : on retire les commandes de l'autre portée pour
  // qu'aucune commande ne soit jamais proposée deux fois.
  Object.assign(cleaned, await cleanOtherScope(client, rest, applicationId, scope));

  if (cleaned.global > 0) {
    log.info(`${cleaned.global} commande(s) globale(s) supprimée(s) : elles faisaient doublon avec la portée « serveur ».`);
  }
  for (const guild of cleaned.guilds) {
    log.info(`${guild.removed} commande(s) de serveur supprimée(s) sur ${guild.guildId} : elles faisaient doublon avec la portée globale.`);
  }

  return { scope, published: body.length, duplicates, cleaned };
}

/**
 * Supprime les doublons constatés *a posteriori* (par exemple après un passage
 * en `COMMANDS_SCOPE=both`) sans changer la portée conservée.
 * Utilisé par `/owner commandes`.
 */
export async function removeDuplicateCommands(client: ElysiaClient): Promise<{ inspection: ScopeInspection; removed: number }> {
  const config = loadConfig();
  if (!config.token) throw new Error('DISCORD_TOKEN manquant : impossible de corriger les commandes.');

  const rest = new REST({ version: '10' }).setToken(config.token);
  const applicationId = await resolveApplicationId(client);
  const inspection = await inspectCommandScopes(client);
  if (inspection.duplicates.length === 0) return { inspection, removed: 0 };

  const scope = resolveCommandsScope({ commandsScope: config.commandsScope, devGuildId: config.devGuildId, guildCount: client.guilds.cache.size });
  const duplicates = new Set(inspection.duplicates);
  let removed = 0;

  // Les commandes locales servent de source de vérité : une commande publiée
  // qui n'existe plus dans le code (renommée, supprimée) est simplement retirée.
  const rebuild = (commands: ScopeCommand[]): unknown[] => {
    const body: unknown[] = [];
    for (const command of commands) {
      if (duplicates.has(command.name)) continue;
      const local = client.commands.get(command.name);
      if (!local) continue;
      body.push(local.data.toJSON());
    }
    return body;
  };

  if (scope === 'global') {
    for (const guild of inspection.guilds) {
      const body = rebuild(guild.commands);
      if (body.length === guild.commands.length) continue;
      await overwriteScope(rest, applicationId, body, guild.guildId);
      removed += guild.commands.length - body.length;
    }
  } else {
    const body = rebuild(inspection.global);
    await overwriteScope(rest, applicationId, body);
    removed += inspection.global.length - body.length;
  }

  return { inspection, removed };
}
