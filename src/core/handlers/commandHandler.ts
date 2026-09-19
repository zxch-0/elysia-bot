import {
  ChannelType,
  GuildMember,
  PermissionFlagsBits,
  type AutocompleteInteraction,
  type Guild,
  type GuildMemberResolvable,
  type GuildTextBasedChannel,
  type Role,
  type User,
} from 'discord.js';
import type { Command, CommandContext } from '../types';
import type { ElysiaClient } from '../client';
import type { GuildSettings } from '../../services/guildService';
import { BotError, PermissionError, UsageError, isIgnorableError, toUserMessage } from '../errors';
import { guildService } from '../../services/guildService';
import { isBotOwner, isGuildAdmin, missingBotPermissions, missingUserPermissions } from '../../utils/permissions';
import { createLogger } from '../logger';
import { errorEmbed, infoEmbed, successEmbed, warningEmbed } from '../../ui/embeds';

const log = createLogger('interactions');

/** Récupère un argument de commande de façon sûre. */
function splitPath(path?: string): string[] {
  if (!path) return [];
  return path.split('.').filter(Boolean);
}

function getOption(interaction: any, key: string, path?: string): any {
  const parts = splitPath(path);
  if (parts.length === 0) {
    return (
      interaction.options.get(key) ??
      interaction.options.getSubcommand(false) ??
      interaction.options.getSubcommandGroup(false) ??
      null
    );
  }
  return interaction.options.get(key, ...parts);
}

/**
 * Construit le contexte passé aux commandes.
 * Les erreurs de résolution lèvent une `UsageError` avec un message clair,
 * interceptée par le gestionnaire global.
 */
export function buildContext(
  interaction: import('discord.js').ChatInputCommandInteraction,
  client: ElysiaClient,
): CommandContext {
  const guild = interaction.guild;
  const member = interaction.member as GuildMember | null;

  if (!guild || !member) {
    throw new BotError('Cette commande doit être utilisée sur un serveur (pas en message privé).');
  }

  const settings = guildService.get(guild.id);

  const ctx: CommandContext = {
    client,
    interaction,
    guild,
    member,
    settings,

    user(key: string, path?: string): User {
      const value = getOption(interaction, key, path);
      const resolved = value?.user ?? value?.member?.user ?? null;
      if (!resolved) throw new UsageError(`Impossible de résoudre l’utilisateur demandé (\`${key}\`).`);
      return resolved;
    },
    memberOf(key: string, path?: string): GuildMember {
      const value = getOption(interaction, key, path);
      const resolved: GuildMemberResolvable | null =
        value?.member ?? (value instanceof GuildMember ? value : null) ?? null;
      if (!resolved) throw new UsageError(`Impossible de résoudre le membre demandé (\`${key}\`).`);
      return resolved as GuildMember;
    },
    string(key: string, path?: string): string {
      const value = getOption(interaction, key, path);
      const text = typeof value === 'string' ? value : value?.value;
      if (text === undefined || text === null) throw new UsageError(`Paramètre texte manquant : \`${key}\`.`);
      return String(text);
    },
    integer(key: string, path?: string): number {
      const value = ctx.number(key, path);
      return Math.trunc(value);
    },
    number(key: string, path?: string): number {
      const value = getOption(interaction, key, path);
      const num = typeof value === 'number' ? value : value?.value;
      if (typeof num !== 'number' || Number.isNaN(num)) throw new UsageError(`Paramètre numérique manquant : \`${key}\`.`);
      return num;
    },
    boolean(key: string, path?: string): boolean {
      const value = getOption(interaction, key, path);
      const flag = typeof value === 'boolean' ? value : value?.value;
      return Boolean(flag);
    },
    channel(key: string, path?: string, types?: ChannelType[]): any {
      const value = getOption(interaction, key, path);
      const channel = value?.channel ?? value;
      if (!channel) throw new UsageError(`Salon introuvable (\`${key}\`).`);
      if (types && types.length > 0 && !types.includes(channel.type)) {
        throw new UsageError('Ce type de salon n’est pas accepté ici.');
      }
      return channel as GuildTextBasedChannel;
    },
    role(key: string, path?: string): Role {
      const value = getOption(interaction, key, path);
      const role = value?.role ?? value;
      if (!role) throw new UsageError(`Rôle introuvable (\`${key}\`).`);
      return role as Role;
    },
    attachment(key: string, path?: string) {
      return getOption(interaction, key, path)?.attachment ?? null;
    },
    subcommand: () => interaction.options.getSubcommand(false),
    subcommandGroup: () => interaction.options.getSubcommandGroup(false),

    async success(title: string, description?: string, extra?: Record<string, unknown>) {
      return respond(interaction, { embeds: [successEmbed(title, description)] }, extra);
    },
    async error(description: string, title = 'Erreur') {
      return respond(interaction, { embeds: [errorEmbed(description, title)] });
    },
    async info(title: string, description?: string) {
      return respond(interaction, { embeds: [infoEmbed(title, description)] });
    },
    async warn(title: string, description?: string) {
      return respond(interaction, { embeds: [warningEmbed(title, description)] });
    },
    async send(embed, components) {
      return respond(interaction, { embeds: [embed], components: components ?? [] });
    },
  };

  return ctx;
}

function respond(
  interaction: import('discord.js').ChatInputCommandInteraction,
  payload: { embeds?: any[]; components?: any[]; content?: string },
  extra?: Record<string, unknown>,
) {
  const body = { ...payload, ...(extra ?? {}) } as any;
  try {
    if (interaction.deferred || interaction.replied) return interaction.editReply(body);
    return interaction.reply({ ...body, ephemeral: true });
  } catch (error) {
    log.warn('Réponse impossible', error);
    return undefined;
  }
}

/** Vérifie les permissions déclaratives d'une commande. */
export function checkPermissions(command: Command, ctx: CommandContext): void {
  const permissions = command.permissions;
  if (!permissions) return;

  if (permissions.ownerOnly && !isBotOwner(ctx.member.id)) {
    throw new PermissionError('🔒 Cette commande est réservée aux propriétaires du bot.');
  }

  if (permissions.adminOnly && !isGuildAdmin(ctx.member, ctx.settings)) {
    throw new PermissionError(
      '🔒 Cette commande est réservée aux **administrateurs** du serveur (ou aux rôles staff configurés via `/config`).',
    );
  }

  if (permissions.user && permissions.user.length > 0) {
    const missing = missingUserPermissions(ctx.member, permissions.user);
    if (missing.length > 0) throw new PermissionError(`🔒 Il vous manque la permission : **${missing.join(', ')}**.`);
  }

  if (permissions.bot && permissions.bot.length > 0) {
    const botMember = ctx.guild.members.me;
    if (botMember) {
      const missing = missingBotPermissions(botMember, permissions.bot as bigint[]);
      if (missing.length > 0) {
        throw new PermissionError(
          `🤖 Il me manque la permission : **${missing.join(', ')}**.\nUn administrateur peut me l’accorder dans *Paramètres du serveur → Rôles*.`,
        );
      }
    }
  }
}

/** Exécute une commande slash avec gestion complète des erreurs. */
export async function executeCommand(
  interaction: import('discord.js').ChatInputCommandInteraction,
  client: ElysiaClient,
  command: Command,
): Promise<void> {
  const started = Date.now();

  try {
    if (!interaction.inGuild() && !command.permissions?.allowDm) {
      throw new BotError('Cette commande doit être utilisée sur un serveur.');
    }

    const cooldownSeconds = command.cooldown ?? 3;
    const cooldown = client.checkCooldown(interaction, cooldownSeconds);
    if (cooldown.blocked) {
      await interaction.reply({
        embeds: [warningEmbed('Patience…', `Doucement ! Réessayez dans **${cooldown.remaining} s**.`)],
        ephemeral: true,
      });
      return;
    }

    const ctx = buildContext(interaction, client);
    checkPermissions(command, ctx);

    if (!command.noDefer && !interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: !command.publicReply });
    }

    await command.run(ctx);
    client.stats.commandsRun += 1;
    log.info(`/${interaction.commandName} par ${interaction.user.tag} (${Date.now() - started} ms)`);
  } catch (error) {
    client.stats.errors += 1;
    const userMessage = toUserMessage(error);
    const isExpected = error instanceof BotError;
    if (isExpected) log.warn(`/${interaction.commandName} refusée pour ${interaction.user.tag} : ${userMessage}`);
    else log.error(`Échec de /${interaction.commandName} pour ${interaction.user.tag}`, error as Error);

    try {
      const payload = { embeds: [errorEmbed(userMessage, isExpected ? 'Action impossible' : 'Erreur inattendue')], ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
      else if (interaction.isRepliable()) await interaction.reply(payload);
    } catch (replyError) {
      if (!isIgnorableError(replyError)) log.error('Impossible de notifier l’erreur', replyError as Error);
    }
  }
}

/** Exécute l'autocomplétion d'une commande si elle en déclare une. */
export async function executeAutocomplete(interaction: AutocompleteInteraction, client: ElysiaClient): Promise<void> {
  const command = client.commands.get(interaction.commandName);
  if (!command?.autocomplete) {
    await interaction.respond([]).catch(() => undefined);
    return;
  }
  try {
    await command.autocomplete(interaction, client);
  } catch (error) {
    log.warn(`Autocomplétion échouée pour /${interaction.commandName}`, error);
    await interaction.respond([]).catch(() => undefined);
  }
}

export const DISCORD_CHANNEL_TYPES = ChannelType;
export const ADMIN_PERMISSION = PermissionFlagsBits.Administrator;
export type { Guild, GuildSettings };
