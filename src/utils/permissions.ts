import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type PermissionResolvable,
  type Role,
} from 'discord.js';
import { loadConfig } from '../core/config';
import type { GuildSettings } from '../services/guildService';

/** Vrai si l'utilisateur fait partie des propriétaires du bot (OWNER_IDS). */
export function isBotOwner(userId: string): boolean {
  return loadConfig().ownerIds.includes(userId);
}

/** Vrai si le membre est administrateur du serveur (ou rôle « staff » configuré). */
export function isGuildAdmin(member: GuildMember, settings?: GuildSettings): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.id === member.guild.ownerId) return true;
  if (settings && settings.roles.staff.length > 0) {
    return member.roles.cache.some((role) => settings.roles.staff.includes(role.id));
  }
  return false;
}

/** Vrai si le membre peut héberger / terminer un giveaway. */
export function canManageGiveaways(member: GuildMember, settings: GuildSettings): boolean {
  if (isGuildAdmin(member, settings)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (settings.roles.giveawayHosts.length > 0) {
    return member.roles.cache.some((role) => settings.roles.giveawayHosts.includes(role.id));
  }
  return false;
}

/** Position du rôle le plus haut d'un membre (les rôles @everyone valent 0). */
export function highestRolePosition(member: GuildMember): number {
  return member.roles.highest.position;
}

/**
 * Vérifications hiérarchiques complètes avant une sanction.
 * Lève une `Error` explicative si l'action est impossible.
 */
export function assertModerationHierarchy(params: {
  guild: Guild;
  moderator: GuildMember;
  target: GuildMember;
  action: string;
}): void {
  const { guild, moderator, target, action } = params;
  const botMember = guild.members.me;

  if (!botMember) throw new Error('Bot introuvable sur le serveur (cache incomplet).');
  if (target.id === guild.ownerId) throw new Error("Impossible de modérer le propriétaire du serveur.");
  if (target.id === botMember.id) throw new Error('Je ne peux pas me modérer moi-même 🙃');
  if (target.id === moderator.id) throw new Error('Vous ne pouvez pas vous modérer vous-même.');
  if (target.roles.highest.position >= botMember.roles.highest.position && target.id !== guild.ownerId) {
    throw new Error(
      `Mon rôle est trop bas : **${target.user.tag}** a un rôle supérieur ou égal au mien. Déplacez le rôle du bot plus haut.`,
    );
  }
  const isOwner = moderator.id === guild.ownerId;
  if (!isOwner && target.roles.highest.position >= moderator.roles.highest.position) {
    throw new Error(
      `**${target.user.tag}** a un rôle supérieur ou égal au vôtre : vous ne pouvez pas le modérer avec ${action}.`,
    );
  }
}

/** Vérifie que le bot possède bien toutes les permissions demandées. */
export function missingBotPermissions(member: GuildMember, permissions: bigint[]): string[] {
  return permissions
    .filter((permission) => !member.permissions.has(permission as PermissionResolvable))
    .map((permission) => formatPermissionName(permission));
}

/** Vérifie que l'auteur de la commande possède les permissions demandées. */
export function missingUserPermissions(member: GuildMember, permissions: bigint[]): string[] {
  return permissions
    .filter((permission) => !member.permissions.has(permission as PermissionResolvable))
    .map((permission) => formatPermissionName(permission));
}

const PERMISSION_LABELS: Record<string, string> = {
  BanMembers: 'Bannir des membres',
  KickMembers: 'Expulser des membres',
  ModerateMembers: 'Exclure temporairement (timeout)',
  ManageRoles: 'Gérer les rôles',
  ManageChannels: 'Gérer les salons',
  ManageMessages: 'Gérer les messages',
  ManageGuild: 'Gérer le serveur',
  Administrator: 'Administrateur',
  ViewChannel: 'Voir les salons',
  SendMessages: 'Envoyer des messages',
  EmbedLinks: 'Intégrer des liens',
  AttachFiles: 'Joindre des fichiers',
  ReadMessageHistory: 'Voir l’historique',
  AddReactions: 'Ajouter des réactions',
  UseExternalEmojis: 'Utiliser des émojis externes',
  Connect: 'Se connecter (vocal)',
  Speak: 'Parler (vocal)',
  Stream: 'Vidéo (vocal)',
  MuteMembers: 'Rendre muet (vocal)',
  DeafenMembers: 'Rendre sourd (vocal)',
  ManageWebhooks: 'Gérer les webhooks',
  CreateInstantInvite: 'Créer une invitation',
  ChangeNickname: 'Changer mon pseudo',
  ManageNicknames: 'Gérer les pseudos',
};

export function formatPermissionName(permission: bigint): string {
  const key = (Object.entries(PermissionFlagsBits) as Array<[string, bigint]>).find(([, value]) => value === permission)?.[0];
  if (!key) return String(permission);
  return PERMISSION_LABELS[key] ?? key;
}

/** Vrai si le rôle peut être distribué par le bot (hiérarchie + rôle intégré). */
export function isRoleAssignable(guild: Guild, role: Role): boolean {
  const botMember = guild.members.me;
  if (!botMember) return false;
  if (role.managed) return false;
  if (role.id === guild.id) return false;
  return role.position < botMember.roles.highest.position;
}

/** Liste des permissions recommandées pour un bot de modération complet. */
export const RECOMMENDED_PERMISSIONS: bigint[] = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.UseExternalEmojis,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.MuteMembers,
];

/** Salon textuel classique (exclu : annonces, forums, vocaux). */
export function isTextChannel(channel: unknown): boolean {
  const type = (channel as { type?: ChannelType } | null)?.type;
  return type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement;
}

export { ButtonBuilder, ButtonStyle, ActionRowBuilder };
