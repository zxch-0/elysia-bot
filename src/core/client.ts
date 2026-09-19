import { Client, Collection, GatewayIntentBits, Options, Partials, type ChatInputCommandInteraction } from 'discord.js';
import { loadConfig } from './config';
import { logger } from './logger';
import type { Command, InteractionModule } from './types';

const log = logger.child('client');

/**
 * Client Discord enrichi : registres de commandes/modules, statistiques,
 * et configuration mémoire adaptée aux hébergements gratuits (512 Mo).
 */
export class ElysiaClient extends Client {
  public readonly commands = new Collection<string, Command>();
  public readonly modules = new Collection<string, InteractionModule>();
  public readonly cooldowns = new Collection<string, number[]>();
  public readonly startedAt = Date.now();
  public readonly stats = {
    commandsRun: 0,
    interactionsHandled: 0,
    errors: 0,
    giveawaysEnded: 0,
  };

  constructor() {
    const config = loadConfig();
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.User, Partials.Reaction],
      allowedMentions: { parse: ['users', 'roles'], repliedUser: true },
      // Réduction de l'empreinte mémoire (offres gratuites limitées à 512 Mo)
      makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 60,
        PresenceManager: 0,
        GuildInviteManager: 0,
        GuildScheduledEventManager: 0,
        ReactionManager: 0,
        StageInstanceManager: 0,
        VoiceStateManager: 0,
        GuildStickerManager: 20,
        GuildEmojiManager: 60,
        GuildMemberManager: { maxSize: 400, keepOverLimit: (member) => member.id === member.client.user?.id },
      }),
      sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: { interval: 600, lifetime: 1_800 },
        users: { interval: 3_600, filter: () => (user) => user.bot && user.id !== user.client.user?.id },
      },
      failIfNotExists: false,
      rest: {
        timeout: 20_000,
        retries: 3,
      },
    });
    log.debug(`Client construit (dryRun=${config.dryRun})`);
  }

  /** Durée de fonctionnement en millisecondes. */
  get uptimeMs(): number {
    return Date.now() - this.startedAt;
  }

  /** Enregistre (ou remplace) une commande. */
  registerCommand(command: Command): void {
    const name = command.data.name;
    if (this.commands.has(name)) {
      log.warn(`Commande dupliquée ignorée : /${name}`);
      return;
    }
    this.commands.set(name, command);
  }

  /** Enregistre un module d'interaction par préfixe de customId. */
  registerModule(module: InteractionModule): void {
    if (this.modules.has(module.prefix)) {
      log.warn(`Module d'interaction dupliqué : ${module.prefix}`);
      return;
    }
    this.modules.set(module.prefix, module);
  }

  /** Vérifie et consomme le cooldown d'un utilisateur (true = bloqué). */
  checkCooldown(interaction: ChatInputCommandInteraction, seconds: number): { blocked: boolean; remaining: number } {
    if (seconds <= 0) return { blocked: false, remaining: 0 };
    const key = `${interaction.user.id}:${interaction.commandName}`;
    const window = seconds * 1_000;
    const now = Date.now();
    const history = (this.cooldowns.get(key) ?? []).filter((timestamp) => now - timestamp < window);
    if (history.length >= 1) {
      const remaining = Math.ceil((window - (now - history[0])) / 1_000);
      this.cooldowns.set(key, history);
      return { blocked: true, remaining: Math.max(remaining, 1) };
    }
    history.push(now);
    this.cooldowns.set(key, history);
    return { blocked: false, remaining: 0 };
  }

  /** Résumé d'état pour le tableau de bord web. */
  snapshot() {
    const guilds = this.guilds.cache.map((guild) => ({
      id: guild.id,
      name: guild.name,
      members: guild.memberCount,
      icon: guild.iconURL({ size: 64 }) ?? null,
      ownerId: guild.ownerId,
      joinedAt: guild.joinedTimestamp,
    }));

    return {
      ready: this.isReady(),
      user: this.user
        ? { id: this.user.id, tag: this.user.tag, avatar: this.user.displayAvatarURL({ size: 128 }) }
        : null,
      uptimeMs: this.uptimeMs,
      latencyMs: Math.round(this.ws.ping),
      guildCount: guilds.length,
      userCount: guilds.reduce((sum, guild) => sum + guild.members, 0),
      guilds,
      commandCount: this.commands.size,
      moduleCount: this.modules.size,
      stats: this.stats,
    };
  }
}

export function createClient(): ElysiaClient {
  return new ElysiaClient();
}
