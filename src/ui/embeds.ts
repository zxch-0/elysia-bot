import {
  AttachmentBuilder,
  EmbedBuilder,
  type ColorResolvable,
  type GuildMember,
  type User,
} from 'discord.js';
import { formatDuration, timestampTag } from '../utils/duration';

/** Identité visuelle d'Elysia : dégradé violet/rose. */
export const THEME = {
  colors: {
    primary: 0x8b5cf6,
    secondary: 0xec4899,
    success: 0x22c55e,
    error: 0xef4444,
    warning: 0xf59e0b,
    info: 0x38bdf8,
    neutral: 0x64748b,
    giveaway: 0xa855f7,
    panel: 0x7c3aed,
  },
  emoji: {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    hammer: '🔨',
    mute: '🔇',
    kick: '👢',
    warn: '⚠️',
    gift: '🎁',
    ticket: '🎟️',
    crown: '👑',
    tools: '🛠️',
    shield: '🛡️',
    scroll: '📜',
    folder: '📁',
    sparkles: '✨',
    clock: '⏳',
    check: '☑️',
    cross: '✖️',
    arrow: '➜',
    pulse: '💜',
  },
} as const;

export const AUTHOR_FOOTER = 'Elysia • Bot Discord tout-en-un';

interface BaseEmbedOptions {
  title?: string;
  description?: string;
  color?: ColorResolvable;
  footer?: string;
  thumbnail?: string | null;
  image?: string | null;
  timestamp?: boolean | Date;
}

/** Embed de base aux couleurs d'Elysia. */
export function baseEmbed(options: BaseEmbedOptions = {}): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(options.color ?? THEME.colors.primary);
  if (options.title) embed.setTitle(options.title.slice(0, 256));
  if (options.description) embed.setDescription(options.description.slice(0, 4096));
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);
  embed.setFooter({ text: options.footer ?? AUTHOR_FOOTER });
  if (options.timestamp !== false) {
    embed.setTimestamp(options.timestamp instanceof Date ? options.timestamp : new Date());
  }
  return embed;
}

export function successEmbed(title: string, description?: string): EmbedBuilder {
  return baseEmbed({
    title: `${THEME.emoji.success} ${title}`,
    description,
    color: THEME.colors.success,
  });
}

export function errorEmbed(description: string, title = 'Erreur'): EmbedBuilder {
  return baseEmbed({
    title: `${THEME.emoji.error} ${title}`,
    description,
    color: THEME.colors.error,
  });
}

export function warningEmbed(title: string, description?: string): EmbedBuilder {
  return baseEmbed({
    title: `${THEME.emoji.warning} ${title}`,
    description,
    color: THEME.colors.warning,
  });
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  return baseEmbed({
    title: `${THEME.emoji.info} ${title}`,
    description,
    color: THEME.colors.info,
  });
}

function displayName(user: User | GuildMember): string {
  if ('user' in user) return `${user.user.tag}`;
  return user.tag;
}

function avatarOf(user: User | GuildMember): string {
  const target = 'user' in user ? user.user : user;
  return target.displayAvatarURL({ size: 128 });
}

/** Embed de case de modération (utilisé par /cases, /warn, logs…). */
export function modActionEmbed(params: {
  action: string;
  emoji: string;
  color: number;
  caseId?: number;
  target: string;
  targetId?: string;
  moderator: string;
  reason: string;
  duration?: number;
  expiresAt?: number;
  extra?: Array<{ name: string; value: string; inline?: boolean }>;
}): EmbedBuilder {
  const embed = baseEmbed({ color: params.color });
  embed.setAuthor({ name: `Case #${params.caseId ?? '—'} • ${params.action}` });
  embed.setTitle(`${params.emoji} ${params.action}`);
  embed.addFields(
    { name: 'Membre', value: params.targetId ? `${params.target}\n\`${params.targetId}\`` : params.target, inline: true },
    { name: 'Modérateur', value: params.moderator, inline: true },
    {
      name: 'Durée',
      value: params.duration ? formatDuration(params.duration) : 'Permanente',
      inline: true,
    },
  );
  embed.addFields({ name: 'Raison', value: params.reason || 'Aucune raison fournie' });
  if (params.expiresAt) embed.addFields({ name: 'Expire', value: timestampTag(params.expiresAt, 'f') });
  for (const field of params.extra ?? []) embed.addFields({ name: field.name, value: field.value, inline: field.inline });
  return embed;
}

/** Ajoute une image (URL ou fichier local) à un embed. */
export function withImage(embed: EmbedBuilder, urlOrFileName: string | null | undefined): EmbedBuilder {
  if (!urlOrFileName) return embed;
  const isLocal = !/^https?:\/\//i.test(urlOrFileName);
  return embed.setImage(isLocal ? `attachment://${urlOrFileName}` : urlOrFileName);
}

/** Prépare la pièce jointe correspondant à une image locale. */
export function imageAttachment(fileName: string, buffer: Buffer): AttachmentBuilder {
  return new AttachmentBuilder(buffer, { name: fileName });
}

export { displayName as formatMemberName, avatarOf };
