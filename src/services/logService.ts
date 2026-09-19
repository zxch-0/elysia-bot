import { EmbedBuilder, type Guild, type GuildMember, type PartialGuildMember, type User } from 'discord.js';
import { logger } from '../core/logger';
import type { GuildSettings } from './guildService';
import { guildService } from './guildService';
import { baseEmbed, THEME, modActionEmbed } from '../ui/embeds';
import { SANCTION_META } from './moderationService';
import type { ModCase } from './caseService';
import { truncate } from '../utils/format';

const log = logger.child('logs');

/** Récupère le salon de logs à utiliser (fallback sur les logs de modération). */
async function resolveLogChannel(guild: Guild, channelId: string | null | undefined): Promise<import('discord.js').TextChannel | null> {
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return null;
  return channel as import('discord.js').TextChannel;
}

/** Envoi générique dans un salon de logs (silencieux en cas d'échec). */
async function sendToLog(
  guild: Guild,
  channelId: string | null | undefined,
  embed: EmbedBuilder,
): Promise<string | null> {
  const channel = await resolveLogChannel(guild, channelId);
  if (!channel) return null;
  try {
    const message = await channel.send({ embeds: [embed] });
    return message.id;
  } catch (error) {
    log.warn(`Impossible d'écrire dans le salon de logs ${channelId}`, error);
    return null;
  }
}

/** Journalise une sanction dans le salon de logs de modération. */
export async function logModAction(
  guild: Guild,
  entry: ModCase,
  context: { settings?: GuildSettings } = {},
): Promise<string | null> {
  const settings = context.settings ?? guildService.get(guild.id);
  if (!settings.modules.logs) return null;

  const meta = SANCTION_META[entry.type] ?? { label: entry.type, emoji: '🛡️', color: THEME.colors.neutral };
  const embed = modActionEmbed({
    action: meta.label,
    emoji: meta.emoji,
    color: meta.color,
    caseId: entry.caseNumber,
    target: entry.targetTag,
    targetId: entry.targetId,
    moderator: entry.moderatorTag,
    reason: entry.reason,
    duration: entry.duration,
    expiresAt: entry.expiresAt || undefined,
    extra: [
      { name: 'Type', value: `\`${entry.type}\``, inline: true },
      { name: 'Identifiant', value: `\`${entry.id}\``, inline: true },
    ],
  });

  const messageId = await sendToLog(guild, settings.channels.modLog, embed);
  if (messageId) log.debug(`Case #${entry.caseNumber} journalisée`);
  else if (!settings.channels.modLog) log.debug(`Aucun salon de modération configuré pour ${guild.id}`);
  return messageId;
}

/** Journalise un message supprimé ou modifié. */
export async function logMessageEvent(params: {
  guild: Guild;
  type: 'delete' | 'update';
  channelId: string;
  author: User;
  content: string;
  before?: string;
}): Promise<void> {
  const settings = guildService.get(params.guild.id);
  if (!settings.modules.logs || !settings.channels.messageLog) return;
  if (params.author?.bot) return;

  const embed = baseEmbed({
    title: params.type === 'delete' ? '🗑️ Message supprimé' : '✏️ Message modifié',
    color: params.type === 'delete' ? THEME.colors.error : THEME.colors.warning,
    footer: `Auteur : ${params.author.tag} • ${params.author.id}`,
  });
  embed.addFields(
    { name: 'Salon', value: `<#${params.channelId}>`, inline: true },
    { name: 'Auteur', value: `${params.author} (\`${params.author.id}\`)`, inline: true },
  );
  if (params.type === 'update' && params.before) {
    embed.addFields(
      { name: 'Avant', value: truncate(params.before || '*(vide)*', 1000) },
      { name: 'Après', value: truncate(params.content || '*(vide)*', 1000) },
    );
  } else {
    embed.addFields({ name: 'Contenu', value: truncate(params.content || '*(vide ou média)*', 1000) });
  }
  await sendToLog(params.guild, settings.channels.messageLog, embed);
}

/** Journalise les arrivées / départs / sanctions de membres. */
export async function logMemberEvent(params: {
  guild: Guild;
  type: 'join' | 'leave' | 'kick-soft' | 'role-add' | 'role-remove' | 'nickname';
  member: GuildMember | PartialGuildMember;
  extra?: Array<{ name: string; value: string; inline?: boolean }>;
}): Promise<void> {
  const settings = guildService.get(params.guild.id);
  if (!settings.modules.logs || !settings.channels.memberLog) return;

  const titles: Record<string, { title: string; color: number }> = {
    join: { title: '📥 Nouveau membre', color: THEME.colors.success },
    leave: { title: '📤 Départ', color: THEME.colors.error },
    'kick-soft': { title: '👢 Expulsion détectée', color: THEME.colors.warning },
    'role-add': { title: '➕ Rôle ajouté', color: THEME.colors.info },
    'role-remove': { title: '➖ Rôle retiré', color: THEME.colors.warning },
    nickname: { title: '📝 Pseudo modifié', color: THEME.colors.secondary },
  };
  const info = titles[params.type] ?? titles.join;
  const embed = baseEmbed({ title: info.title, color: info.color });

  const user = params.member.user;
  if (user) {
    embed.setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ size: 128 }) });
    embed.addFields({ name: 'Membre', value: `${user} (\`${user.id}\`)`, inline: true });
    embed.addFields({ name: 'Compte créé', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true });
  }
  if (params.member.joinedTimestamp) {
    embed.addFields({ name: 'A rejoint', value: `<t:${Math.floor(params.member.joinedTimestamp / 1000)}:R>`, inline: true });
  }
  for (const field of params.extra ?? []) embed.addFields(field);

  await sendToLog(params.guild, settings.channels.memberLog, embed);
}

/** Journalise une participation / fin de giveaway. */
export async function logGiveaway(params: {
  guild: Guild;
  title: string;
  description: string;
  color?: number;
}): Promise<void> {
  const settings = guildService.get(params.guild.id);
  if (!settings.modules.logs || !settings.channels.modLog) return;
  const embed = baseEmbed({
    title: `🎁 ${params.title}`,
    description: params.description,
    color: params.color ?? THEME.colors.giveaway,
  });
  await sendToLog(params.guild, settings.channels.modLog, embed);
}

/** Message de bienvenue personnalisable. */
export function renderWelcomeTemplate(template: string, member: GuildMember): string {
  return template
    .replaceAll('{mention}', `<@${member.id}>`)
    .replaceAll('{user}', member.user.tag)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{membercount}', String(member.guild.memberCount))
    .replaceAll('{createdat}', `<t:${Math.floor(member.user.createdTimestamp / 1000)}:D>`);
}

export { sendToLog };
