import { REST, Routes } from 'discord.js';
import type { ElysiaClient } from '../client';
import { loadConfig } from '../config';
import { logger } from '../logger';

const log = logger.child('publisher');

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

/**
 * Publie toutes les commandes chargées auprès de Discord.
 * `DEV_GUILD_ID` → publication instantanée sur ce serveur ; sinon publication globale.
 */
export async function publishCommands(client: ElysiaClient, options: { clear?: boolean } = {}): Promise<number> {
  const config = loadConfig();
  const token = config.token;
  if (!token) throw new Error('DISCORD_TOKEN manquant : impossible de publier les commandes.');

  const rest = new REST({ version: '10' }).setToken(token);
  const applicationId = await resolveApplicationId(client);
  const body = [...client.commands.values()].map((command) => command.data.toJSON());

  if (options.clear) {
    log.info('Suppression des commandes existantes…');
    await rest.put(Routes.applicationCommands(applicationId), { body: [] });
    if (config.devGuildId) await rest.put(Routes.applicationGuildCommands(applicationId, config.devGuildId), { body: [] });
  }

  if (config.devGuildId) {
    try {
      await rest.put(Routes.applicationGuildCommands(applicationId, config.devGuildId), { body });
      log.success(`${body.length} commande(s) publiée(s) sur le serveur de développement ${config.devGuildId}`);
    } catch (error) {
      // 403 « Missing Access » : le serveur DEV_GUILD_ID est inaccessible pour
      // l'application. On n'abandonne pas : la publication globale continue.
      log.warn(
        `Publication sur le serveur de développement ${config.devGuildId} impossible — poursuite avec la publication globale`,
        error as Error,
      );
      log.warn('➜ Vérifiez que le bot est bien PRÉSENT sur ce serveur (DEV_GUILD_ID correct ?)');
      log.warn('➜ Vérifiez qu’il a été invité avec le scope « applications.commands » (OAuth2 → URL Generator : bot + applications.commands)');
      log.warn('➜ Vérifiez que CLIENT_ID correspond à l’Application ID de la même application que DISCORD_TOKEN');
    }
    // On publie aussi en global pour que le bot fonctionne partout.
    await rest.put(Routes.applicationCommands(applicationId), { body });
    log.success(`${body.length} commande(s) publiée(s) globalement`);
  } else {
    await rest.put(Routes.applicationCommands(applicationId), { body });
    log.success(`${body.length} commande(s) publiée(s) globalement (propagation ≈ 1 h)`);
  }

  return body.length;
}

/** Publie les commandes à partir des fichiers, sans client connecté (script CLI). */
export async function publishFromFiles(commands: unknown[], options: { guildId?: string; clear?: boolean } = {}): Promise<number> {
  const config = loadConfig();
  if (!config.token) throw new Error('DISCORD_TOKEN manquant.');
  if (!config.clientId) throw new Error('CLIENT_ID manquant.');

  const rest = new REST({ version: '10' }).setToken(config.token);
  const body = (commands as Array<{ data: { toJSON(): unknown } }>).map((command) => command.data.toJSON());

  if (options.clear) await rest.put(Routes.applicationCommands(config.clientId), { body: [] });

  if (options.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, options.guildId), { body });
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
  }
  return body.length;
}
