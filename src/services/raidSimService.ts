import { ChannelType, type CategoryChannel, type Guild, type TextChannel } from 'discord.js';
import { loadConfig } from '../core/config';
import { logger } from '../core/logger';
import type { ElysiaClient } from '../core/client';

const log = logger.child('raid-sim');

/**
 * 🧪 Simulateur de raid — **outil de test uniquement**.
 *
 * Objectif : vérifier concrètement la robustesse d'un serveur (et de
 * l'anti-raid) face à une vague de messages et de salons, sans jamais toucher
 * aux salons existants.
 *
 * Garde-fous (tous appliqués côté serveur, jamais côté navigateur) :
 *  1. le serveur visé doit figurer dans `RAID_SIM_GUILD_IDS` — sinon 403.
 *     Sans cette variable, la fonctionnalité est totalement désactivée ;
 *  2. le simulateur crée son **propre** salon vocal/catégorie temporaire
 *     `sim-raid-*` : il n'écrit jamais dans les salons existants ;
 *  3. plafonds durs : 60 messages, 10 salons, 1 salle, 2 minutes ;
 *  4. les mentions sont neutralisées (`parse: []`) : aucun ping réel ;
 *  5. nettoyage garanti : les salons créés sont supprimés à la fin (et à
 *     l'arrêt d'urgence) — en cas de redémarrage du bot, ils sont repérés par
 *     leur préfixe et peuvent être supprimés depuis le panneau ;
 *  6. le bot est un membre de confiance pour l'anti-raid : la simulation ne
 *     déclenche donc jamais le verrouillage automatique.
 */

/** Plafonds non contournables (le navigateur ne peut pas les dépasser). */
export const RAID_SIM_LIMITS = {
  maxMessages: 60,
  maxChannels: 10,
  minMessageIntervalMs: 1_100,
  minChannelIntervalMs: 900,
  maxDurationMs: 120_000,
  /** Délai d'affichage avant nettoyage automatique. */
  cleanupDelayMs: 5_000,
  /** Préfixe des salons créés par le simulateur. */
  channelPrefix: 'sim-raid-',
} as const;

export interface RaidSimRequest {
  guildId: string;
  messages: number;
  messageIntervalMs: number;
  channels: number;
  channelIntervalMs: number;
  text: string;
}

export interface RaidSimLogLine {
  at: number;
  level: 'info' | 'ok' | 'warn' | 'error';
  message: string;
}

export interface RaidSimProgress {
  status: 'idle' | 'running' | 'stopping' | 'cleaning' | 'done' | 'error';
  guildId: string | null;
  guildName: string | null;
  startedAt: number;
  endedAt: number;
  messagesSent: number;
  messagesPlanned: number;
  channelsCreated: number;
  channelsPlanned: number;
  cleanedChannels: number;
  dryRun: boolean;
  error: string | null;
  logs: RaidSimLogLine[];
}

const IDLE: RaidSimProgress = {
  status: 'idle',
  guildId: null,
  guildName: null,
  startedAt: 0,
  endedAt: 0,
  messagesSent: 0,
  messagesPlanned: 0,
  channelsCreated: 0,
  channelsPlanned: 0,
  cleanedChannels: 0,
  dryRun: false,
  error: null,
  logs: [],
};

/** Neutralise les mentions pour qu'une simulation ne déclenche aucun ping. */
export function neutralizeMentions(text: string): string {
  return text
    .replace(/@everyone/gi, '@ everyone')
    .replace(/@here/gi, '@ here')
    .replace(/<@[!&]?\d{17,20}>/g, '[mention]')
    .replace(/<#\d{17,20}>/g, '[salon]')
    .replace(/<@&\d{17,20}>/g, '[rôle]');
}

/** Bornes appliquées à toute demande, y compris forgée à la main. */
export function sanitizeRequest(input: Partial<RaidSimRequest>): RaidSimRequest {
  const int = (value: unknown, fallback: number, min: number, max: number): number => {
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
  };

  return {
    guildId: String(input.guildId ?? ''),
    messages: int(input.messages, 10, 0, RAID_SIM_LIMITS.maxMessages),
    messageIntervalMs: int(input.messageIntervalMs, 1_200, RAID_SIM_LIMITS.minMessageIntervalMs, 10_000),
    channels: int(input.channels, 3, 0, RAID_SIM_LIMITS.maxChannels),
    channelIntervalMs: int(input.channelIntervalMs, 1_000, RAID_SIM_LIMITS.minChannelIntervalMs, 10_000),
    text: neutralizeMentions(String(input.text ?? '').slice(0, 180)) || '🧪 Test de résistance Elysia — simulation de raid',
  };
}

export class RaidSimService {
  private progress: RaidSimProgress = { ...IDLE };
  private stopRequested = false;
  private running: Promise<void> | null = null;
  private client: ElysiaClient | undefined;

  attach(client: ElysiaClient): void {
    this.client = client;
  }

  /** Serveurs de TEST autorisés (variable d'environnement RAID_SIM_GUILD_IDS). */
  get allowlist(): string[] {
    return loadConfig().raidSimGuildIds;
  }

  /** Vrai si le simulateur peut être utilisé (au moins un serveur autorisé). */
  get enabled(): boolean {
    return this.allowlist.length > 0;
  }

  /** Vrai si le serveur est authorisé pour la simulation. */
  isAllowed(guildId: string): boolean {
    return this.allowlist.includes(guildId);
  }

  get status(): RaidSimProgress {
    return { ...this.progress, logs: [...this.progress.logs] };
  }

  /**
   * Démarre une simulation. Refuse tout serveur absent de la liste blanche :
   * impossible d'utiliser l'outil sur un serveur de production.
   */
  async start(request: RaidSimRequest): Promise<{ ok: true; progress: RaidSimProgress } | { ok: false; error: string; status: number }> {
    if (!this.enabled) {
      return {
        ok: false,
        status: 403,
        error:
          'Simulateur désactivé : aucun serveur de test autorisé. Renseignez RAID_SIM_GUILD_IDS avec l’identifiant de votre serveur de test (séparés par des virgules).',
      };
    }
    if (!this.isAllowed(request.guildId)) {
      return { ok: false, status: 403, error: 'Ce serveur n’est pas dans la liste blanche RAID_SIM_GUILD_IDS.' };
    }
    if (this.progress.status === 'running' || this.progress.status === 'stopping' || this.progress.status === 'cleaning') {
      return { ok: false, status: 409, error: 'Une simulation est déjà en cours. Arrêtez-la d’abord (« STOP RAID SIM »).' };
    }
    if (!this.client) {
      return { ok: false, status: 503, error: 'Client Discord non initialisé.' };
    }

    const config = loadConfig();
    const dryRun = config.dryRun || !this.client.isReady();
    const guild = this.client.guilds.cache.get(request.guildId) ?? null;

    if (!guild && !dryRun) {
      return { ok: false, status: 404, error: 'Le bot n’est pas présent sur ce serveur (ou le cache n’est pas encore prêt).' };
    }
    if (guild && !dryRun) {
      const me = guild.members.me;
      const missing = [
        me?.permissions.has('ManageChannels') ? null : 'Gérer les salons',
        me?.permissions.has('ViewChannel') ? null : 'Voir les salons',
        me?.permissions.has('SendMessages') ? null : 'Envoyer des messages',
      ].filter(Boolean);
      if (missing.length > 0) {
        return { ok: false, status: 403, error: `Permissions manquantes au bot sur ce serveur : ${missing.join(', ')}.` };
      }
    }

    this.progress = {
      ...IDLE,
      status: 'running',
      guildId: request.guildId,
      guildName: guild?.name ?? 'mode démonstration',
      startedAt: Date.now(),
      messagesPlanned: request.messages,
      channelsPlanned: request.channels,
      dryRun,
    };
    this.stopRequested = false;

    this.push('warn', `Simulation lancée sur « ${this.progress.guildName} » — ${request.messages} message(s) et ${request.channels} salon(s) temporaires.`);
    if (dryRun) this.push('info', 'Mode démonstration (DRY_RUN) : aucune requête réelle vers Discord, scénario joué localement.');

    this.running = this.run(guild, request, dryRun)
      .catch((error) => {
        this.progress.status = 'error';
        this.progress.error = error instanceof Error ? error.message : String(error);
        this.push('error', `Erreur pendant la simulation : ${this.progress.error}`);
        log.error('Simulation de raid en échec', error as Error);
      })
      .finally(() => {
        this.progress.endedAt = Date.now();
        this.running = null;
      });

    return { ok: true, progress: this.status };
  }

  /** Arrêt d'urgence : interrompt la simulation et nettoie immédiatement. */
  async stop(): Promise<RaidSimProgress> {
    if (this.progress.status !== 'running' && this.progress.status !== 'cleaning' && this.progress.status !== 'stopping') {
      return this.status;
    }
    this.stopRequested = true;
    this.progress.status = 'stopping';
    this.push('warn', '⛔ Arrêt demandé : la simulation s’interrompt et le nettoyage démarre immédiatement.');

    // On laisse la boucle en cours se terminer proprement (elle nettoie).
    await this.running?.catch(() => undefined);
    return this.status;
  }

  /** Supprime les salons `sim-raid-*` restants (nettoyage de secours). */
  async cleanupLeftovers(guildId: string): Promise<{ removed: number; names: string[] }> {
    const guild = this.client?.guilds.cache.get(guildId);
    if (!guild || loadConfig().dryRun) return { removed: 0, names: [] };

    const leftovers = guild.channels.cache.filter((channel) => channel.name.startsWith(RAID_SIM_LIMITS.channelPrefix));
    const names: string[] = [];
    for (const channel of leftovers.values()) {
      names.push(channel.name);
      await channel.delete('Anti-raid : nettoyage des salons de simulation').catch(() => undefined);
    }
    if (names.length > 0) this.push('ok', `${names.length} salon(s) résiduel(s) supprimé(s) : ${names.join(', ')}`);
    return { removed: names.length, names };
  }

  // ── Exécution ───────────────────────────────────────────────────────────

  private async run(guild: Guild | null, request: RaidSimRequest, dryRun: boolean): Promise<void> {
    const createdChannelIds: string[] = [];
    let categoryId: string | null = null;
    let lastMessageChannelId: string | null = null;
    const deadline = Date.now() + RAID_SIM_LIMITS.maxDurationMs;

    try {
      if (!dryRun && guild) {
        const category = await guild.channels.create({
          name: `${RAID_SIM_LIMITS.channelPrefix}test`,
          type: ChannelType.GuildCategory,
          reason: 'Simulateur de raid Elysia (nettoyage automatique)',
        });
        categoryId = category.id;
        this.push('info', `Catégorie temporaire créée : ${category.name} (id ${category.id}).`);
      }

      const createChannel = async (index: number): Promise<TextChannel | null> => {
        if (this.stopRequested || Date.now() > deadline) return null;
        if (dryRun || !guild) {
          this.progress.channelsCreated += 1;
          this.push('ok', `[démo] Salon créé : ${RAID_SIM_LIMITS.channelPrefix}spam-${index}`);
          return null;
        }
        try {
          const channel = await guild.channels.create({
            name: `${RAID_SIM_LIMITS.channelPrefix}spam-${index}`,
            type: ChannelType.GuildText,
            parent: categoryId ?? undefined,
            reason: 'Simulateur de raid Elysia (nettoyage automatique)',
          });
          createdChannelIds.push(channel.id);
          this.progress.channelsCreated += 1;
          this.push('ok', `Salon créé : ${channel.name}`);
          return channel;
        } catch (error) {
          this.push('error', `Création de salon refusée : ${(error as Error).message}`);
          return null;
        }
      };

      const channelLoop = async (): Promise<void> => {
        for (let index = 1; index <= request.channels; index += 1) {
          if (this.stopRequested || Date.now() > deadline) return;
          await createChannel(index);
          await this.sleep(request.channelIntervalMs);
        }
      };

      const messageLoop = async (): Promise<void> => {
        for (let index = 1; index <= request.messages; index += 1) {
          if (this.stopRequested || Date.now() > deadline) return;

          if (dryRun || !guild) {
            this.progress.messagesSent += 1;
            this.push('info', `[démo] Message ${index}/${request.messages} envoyé (mentions neutralisées).`);
            await this.sleep(160);
            continue;
          }

          const channel = await this.acquireChannel(guild, createdChannelIds, request.channels > 0 ? () => lastMessageChannelId : null, createChannel, request.channels);
          if (!channel) {
            this.push('warn', 'Aucun salon de simulation disponible : envoi interrompu.');
            return;
          }
          lastMessageChannelId = channel.id;
          if (!createdChannelIds.includes(channel.id)) createdChannelIds.push(channel.id);

          try {
            await channel.send({
              content: request.text,
              allowedMentions: { parse: [] },
            });
            this.progress.messagesSent += 1;
            if (index === 1 || index % 5 === 0 || index === request.messages) {
              this.push('info', `Messages envoyés : ${index}/${request.messages}`);
            }
          } catch (error) {
            this.push('error', `Envoi refusé : ${(error as Error).message}`);
            await this.sleep(1_000);
          }

          await this.sleep(request.messageIntervalMs);
        }
      };

      await Promise.all([channelLoop(), messageLoop()]);

      if (!this.stopRequested && !dryRun && guild) {
        this.progress.status = 'cleaning';
        this.push('info', `Simulation terminée — nettoyage dans ${Math.round(RAID_SIM_LIMITS.cleanupDelayMs / 1_000)} s (les salons temporaires disparaissent, rien d’autre n’est touché).`);
        await this.sleep(RAID_SIM_LIMITS.cleanupDelayMs);
      }
    } finally {
      this.progress.status = this.stopRequested ? 'stopping' : this.progress.status;
      const removed = await this.cleanup(guild, createdChannelIds, categoryId, dryRun);
      this.progress.cleanedChannels = removed;
      this.progress.status = 'done';
      this.push('ok', `Nettoyage terminé : ${removed} salon(s) temporaire(s) supprimé(s).`);
      this.push('info', `Bilan : ${this.progress.messagesSent} message(s) envoyé(s), ${this.progress.channelsCreated} salon(s) créé(s).`);
      log.info(`Simulation de raid terminée sur ${request.guildId} (${this.progress.messagesSent} messages, ${this.progress.channelsCreated} salons).`);
    }
  }

  /** Récupère un salon de simulation (ou en crée un si le lot n'en prévoyait aucun). */
  private async acquireChannel(
    guild: Guild,
    created: string[],
    lastChannelGetter: (() => string | null) | null,
    createChannel: (index: number) => Promise<TextChannel | null>,
    plannedChannels: number,
  ): Promise<TextChannel | null> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (this.stopRequested) return null;
      const last = lastChannelGetter?.();
      const cached = last ? guild.channels.cache.get(last) : undefined;
      if (cached?.isTextBased() && !cached.isDMBased()) return cached as TextChannel;

      const first = created[0] ? guild.channels.cache.get(created[0]) : undefined;
      if (first?.isTextBased() && !first.isDMBased()) return first as TextChannel;

      if (plannedChannels === 0) {
        const channel = await createChannel(1);
        if (channel) return channel;
        return null;
      }
      await this.sleep(200);
    }
    return null;
  }

  /** Supprime uniquement les salons créés par la simulation. */
  private async cleanup(guild: Guild | null, channelIds: string[], categoryId: string | null, dryRun: boolean): Promise<number> {
    if (dryRun || !guild) {
      this.push('ok', '[démo] Nettoyage simulé : les salons temporaires auraient été supprimés.');
      return channelIds.length;
    }

    let removed = 0;
    for (const id of [...channelIds].reverse()) {
      const channel = guild.channels.cache.get(id);
      if (!channel) continue;
      await channel.delete('Simulateur de raid Elysia : nettoyage').catch(() => undefined);
      removed += 1;
    }
    if (categoryId) {
      const category = guild.channels.cache.get(categoryId) as CategoryChannel | undefined;
      if (category) {
        await category.delete('Simulateur de raid Elysia : nettoyage').catch(() => undefined);
        removed += 1;
      }
    }
    return removed;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
    });
  }

  private push(level: RaidSimLogLine['level'], message: string): void {
    const stamp = new Date().toLocaleTimeString('fr-FR');
    this.progress.logs.push({ at: Date.now(), level, message: `${stamp} — ${message}` });
    if (this.progress.logs.length > 200) this.progress.logs = this.progress.logs.slice(-200);
  }
}

export const raidSimService = new RaidSimService();
