import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type TextChannel,
  type User,
} from 'discord.js';
import { logger } from '../core/logger';
import { BotError, NotFoundError } from '../core/errors';
import { caseService, type CaseType, type ModCase } from './caseService';
import { guildService } from './guildService';
import { clampTimeout, formatDuration, timestampTag } from '../utils/duration';
import { assertModerationHierarchy } from '../utils/permissions';
import { logModAction } from './logService';

const log = logger.child('moderation');

export interface ModerationOptions {
  guild: Guild;
  moderator: User;
  moderatorMember: GuildMember;
  target: GuildMember;
  reason?: string | null;
  duration?: number | null;
  /** Silence les MP et messages publics (utilisé par les sanctions automatiques). */
  silent?: boolean;
}

export interface ModerationResult {
  caseEntry: ModCase;
  /** Message informatif à afficher à l'auteur de la commande. */
  message: string;
  /** Vrai si la victime n'a pas pu être prévenue par MP. */
  dmSent: boolean;
}

/** Envoie un MP de notification, sans jamais faire échouer la sanction. */
async function notifyTarget(user: User, content: string): Promise<boolean> {
  try {
    await user.send({ content });
    return true;
  } catch {
    return false;
  }
}

function caseType(verb: CaseType): string {
  const labels: Record<CaseType, string> = {
    ban: 'Bannissement',
    kick: 'Expulsion',
    timeout: 'Timeout',
    mute: 'Mute',
    unmute: 'Unmute',
    warn: 'Avertissement',
    unban: 'Débannissement',
    softban: 'Softban',
    purge: 'Purge',
    lock: 'Verrouillage',
    unlock: 'Déverrouillage',
  };
  return labels[verb] ?? verb;
}

/**
 * Cœur du système de modération.
 * Chaque action : vérifications → exécution → case → log → MP.
 */
export class ModerationService {
  /** Bannit un membre (avec suppression de messages optionnelle). */
  async ban(options: ModerationOptions & { deleteMessageSeconds?: number }): Promise<ModerationResult> {
    const { guild, target, moderator, moderatorMember, reason, deleteMessageSeconds = 0 } = options;
    const settings = guildService.get(guild.id);
    assertModerationHierarchy({ guild, moderator: moderatorMember, target, action: 'ce bannissement' });

    const cleanReason = reason?.trim() || 'Aucune raison fournie';
    const dmSent = options.silent
      ? false
      : await notifyTarget(
          target.user,
          `🔨 Vous avez été **banni** de **${guild.name}**.\n**Raison :** ${cleanReason}\nSi vous pensez qu'il s'agit d'une erreur, contactez l'équipe.`,
        );

    await guild.members.ban(target.id, {
      reason: `${moderator.tag} : ${cleanReason}`,
      deleteMessageSeconds: Math.min(Math.max(deleteMessageSeconds, 0), 7 * 86_400),
    });

    const caseNumber = guildService.nextCaseId(guild.id);
    const entry = caseService.create({
      guildId: guild.id,
      caseNumber,
      type: 'ban',
      targetId: target.id,
      targetTag: target.user.tag,
      moderatorId: moderator.id,
      moderatorTag: moderator.tag,
      reason: cleanReason,
      duration: 0,
      expiresAt: 0,
      autoRevertAt: null,
    });

    if (settings.modules.logs) await logModAction(guild, entry, { settings });
    log.info(`${moderator.tag} a banni ${target.user.tag} (${cleanReason})`);
    return { caseEntry: entry, message: `🔨 **${target.user.tag}** a été banni. *Case #${caseNumber}*`, dmSent };
  }

  /** Bannit puis débannit immédiatement (efface les messages récents). */
  async softban(options: ModerationOptions & { deleteMessageSeconds?: number }): Promise<ModerationResult> {
    const result = await this.ban(options);
    await options.guild.members.unban(options.target.id, 'Softban : bannissement temporaire de nettoyage').catch(() => undefined);
    caseService.update(options.guild.id, result.caseEntry.caseNumber, { type: 'softban' });
    return { ...result, message: `🧹 **${options.target.user.tag}** a été softban (messages supprimés).` };
  }

  /** Expulse un membre. */
  async kick(options: ModerationOptions): Promise<ModerationResult> {
    const { guild, target, moderator, moderatorMember, reason } = options;
    const settings = guildService.get(guild.id);
    assertModerationHierarchy({ guild, moderator: moderatorMember, target, action: 'cette expulsion' });

    const cleanReason = reason?.trim() || 'Aucune raison fournie';
    const dmSent = options.silent
      ? false
      : await notifyTarget(target.user, `👢 Vous avez été **expulsé** de **${guild.name}**.\n**Raison :** ${cleanReason}`);

    await target.kick(`${moderator.tag} : ${cleanReason}`);

    const caseNumber = guildService.nextCaseId(guild.id);
    const entry = caseService.create({
      guildId: guild.id,
      caseNumber,
      type: 'kick',
      targetId: target.id,
      targetTag: target.user.tag,
      moderatorId: moderator.id,
      moderatorTag: moderator.tag,
      reason: cleanReason,
      duration: 0,
      expiresAt: 0,
      autoRevertAt: null,
    });

    if (settings.modules.logs) await logModAction(guild, entry, { settings });
    return { caseEntry: entry, message: `👢 **${target.user.tag}** a été expulsé. *Case #${caseNumber}*`, dmSent };
  }

  /** Timeout natif Discord (max 28 jours). */
  async timeout(options: ModerationOptions & { duration: number }): Promise<ModerationResult> {
    const { guild, target, moderator, moderatorMember, reason, duration } = options;
    const settings = guildService.get(guild.id);
    assertModerationHierarchy({ guild, moderator: moderatorMember, target, action: 'ce timeout' });

    const ms = clampTimeout(duration);
    const cleanReason = reason?.trim() || 'Aucune raison fournie';

    const dmSent = options.silent
      ? false
      : await notifyTarget(
          target.user,
          `🔇 Vous avez été **réduit au silence** sur **${guild.name}** pendant **${formatDuration(ms)}**.\n**Raison :** ${cleanReason}`,
        );

    await target.timeout(ms, `${moderator.tag} : ${cleanReason}`);

    const caseNumber = guildService.nextCaseId(guild.id);
    const entry = caseService.create({
      guildId: guild.id,
      caseNumber,
      type: 'timeout',
      targetId: target.id,
      targetTag: target.user.tag,
      moderatorId: moderator.id,
      moderatorTag: moderator.tag,
      reason: cleanReason,
      duration: ms,
      expiresAt: Date.now() + ms,
      autoRevertAt: Date.now() + ms,
    });

    if (settings.modules.logs) await logModAction(guild, entry, { settings });
    return {
      caseEntry: entry,
      message: `🔇 **${target.user.tag}** est en timeout pour **${formatDuration(ms)}**. *Case #${caseNumber}*`,
      dmSent,
    };
  }

  /**
   * Mute « classique » : timeout natif (mode par défaut) ou rôle muet
   * (durée illimitée / rôle de mute configuré).
   */
  async mute(options: ModerationOptions & { duration?: number | null; useRole?: boolean }): Promise<ModerationResult> {
    const { guild, target, duration, useRole } = options;
    const settings = guildService.get(guild.id);
    const mode = useRole ? 'role' : settings.mute.mode;
    const ms = duration && duration > 0 ? duration : settings.mute.defaultDuration;

    if (mode === 'role') {
      const muteRoleId = settings.roles.mute;
      if (!muteRoleId) {
        throw new BotError(
          'Aucun rôle muet configuré.\n➜ `/config mute-role role:@Muted` ou utilisez le mode timeout : `/config mute-mode mode:timeout`.',
        );
      }
      const muteRole = guild.roles.cache.get(muteRoleId);
      if (!muteRole) throw new NotFoundError('Le rôle muet configuré n’existe plus. Reconfigurez-le avec `/config mute-role`.');

      assertModerationHierarchy({ guild, moderator: options.moderatorMember, target, action: 'ce mute' });
      await target.roles.add(muteRole, `${options.moderator.tag} : ${options.reason ?? 'mute'}`);
      const caseNumber = guildService.nextCaseId(guild.id);
      const entry = caseService.create({
        guildId: guild.id,
        caseNumber,
        type: 'mute',
        targetId: target.id,
        targetTag: target.user.tag,
        moderatorId: options.moderator.id,
        moderatorTag: options.moderator.tag,
        reason: options.reason?.trim() || 'Aucune raison fournie',
        duration: ms > 0 ? ms : 0,
        expiresAt: ms > 0 ? Date.now() + ms : 0,
        autoRevertAt: ms > 0 ? Date.now() + ms : null,
        metadata: { mode: 'role', roleId: muteRole.id },
      });
      if (settings.modules.logs) await logModAction(guild, entry, { settings });
      return {
        caseEntry: entry,
        message: `🔇 **${target.user.tag}** a reçu le rôle muet${ms > 0 ? ` pour **${formatDuration(ms)}**` : ' (illimité)'}. *Case #${caseNumber}*`,
        dmSent: true,
      };
    }

    const result = await this.timeout({ ...options, duration: ms });
    caseService.update(guild.id, result.caseEntry.caseNumber, { type: 'mute', metadata: { mode: 'timeout' } });
    return { ...result, message: `🔇 **${target.user.tag}** a été mute pendant **${formatDuration(ms)}**. *Case #${result.caseEntry.caseNumber}*` };
  }

  /** Ajoute un avertissement et applique les seuils configurés. */
  async warn(options: ModerationOptions): Promise<ModerationResult & { totalWarnings: number; triggered?: string }> {
    const { guild, target, moderator, moderatorMember, reason } = options;
    const settings = guildService.get(guild.id);
    assertModerationHierarchy({ guild, moderator: moderatorMember, target, action: 'cet avertissement' });

    const cleanReason = reason?.trim() || 'Aucune raison fournie';
    const caseNumber = guildService.nextCaseId(guild.id);
    const entry = caseService.create({
      guildId: guild.id,
      caseNumber,
      type: 'warn',
      targetId: target.id,
      targetTag: target.user.tag,
      moderatorId: moderator.id,
      moderatorTag: moderator.tag,
      reason: cleanReason,
      duration: 0,
      expiresAt: 0,
      autoRevertAt: null,
    });

    const dmSent = options.silent
      ? false
      : await notifyTarget(
          target.user,
          `⚠️ Vous avez reçu un **avertissement** sur **${guild.name}**.\n**Raison :** ${cleanReason}\n**Case :** #${caseNumber}\nMerci de respecter les règles du serveur.`,
        );

    if (settings.modules.logs) await logModAction(guild, entry, { settings });

    const totalWarnings = caseService.countActiveWarnings(guild.id, target.id);
    let triggered: string | undefined;

    const threshold = settings.warnings.thresholds
      .filter((item) => item.count === totalWarnings)
      .sort((a, b) => a.count - b.count)[0];

    if (threshold) {
      try {
        if (threshold.action === 'mute') {
          await this.mute({
            ...options,
            reason: `Seuil automatique : ${totalWarnings} avertissements`,
            duration: threshold.duration ?? settings.mute.defaultDuration,
          });
          triggered = `mute automatique (${formatDuration(threshold.duration ?? settings.mute.defaultDuration)})`;
        } else if (threshold.action === 'kick') {
          await this.kick({ ...options, reason: `Seuil automatique : ${totalWarnings} avertissements` });
          triggered = 'expulsion automatique';
        } else if (threshold.action === 'ban') {
          await this.ban({ ...options, reason: `Seuil automatique : ${totalWarnings} avertissements` });
          triggered = 'bannissement automatique';
        }
      } catch (error) {
        log.warn(`Seuil de sanctions non appliqué pour ${target.user.tag}`, error);
      }
    }

    return {
      caseEntry: entry,
      message: `⚠️ **${target.user.tag}** a reçu un avertissement (**${totalWarnings}** au total). *Case #${caseNumber}*`,
      dmSent,
      totalWarnings,
      triggered,
    };
  }

  /** Lève un timeout ou retire le rôle muet + clôt les cases actives. */
  async unmute(options: {
    guild: Guild;
    moderator: User;
    target: GuildMember;
    reason?: string | null;
  }): Promise<{ cases: ModCase[]; mode: string }> {
    const { guild, target, moderator, reason } = options;
    const settings = guildService.get(guild.id);
    const active = caseService
      .listUser(guild.id, target.id, ['mute', 'timeout'])
      .filter((entry) => entry.active);

    if (active.length === 0 && !target.isCommunicationDisabled()) {
      throw new BotError(`**${target.user.tag}** n'est actuellement pas réduit au silence.`);
    }

    const restored: ModCase[] = [];
    if (target.isCommunicationDisabled()) {
      await target.timeout(null, `${moderator.tag} : unmute`);
      restored.push(...active.filter((entry) => (entry.metadata?.mode ?? 'timeout') === 'timeout'));
    }

    const muteRoleId = settings.roles.mute;
    if (muteRoleId && target.roles.cache.has(muteRoleId)) {
      await target.roles.remove(muteRoleId, `${moderator.tag} : unmute`);
      restored.push(...active.filter((entry) => entry.metadata?.mode === 'role'));
    }

    for (const entry of new Set([...active, ...restored])) {
      caseService.update(guild.id, entry.caseNumber, { active: false, autoRevertAt: null });
    }

    const caseNumber = guildService.nextCaseId(guild.id);
    const entry = caseService.create({
      guildId: guild.id,
      caseNumber,
      type: 'unmute',
      targetId: target.id,
      targetTag: target.user.tag,
      moderatorId: moderator.id,
      moderatorTag: moderator.tag,
      reason: reason?.trim() || 'Aucune raison fournie',
      duration: 0,
      expiresAt: 0,
      autoRevertAt: null,
      refCaseNumber: active[0]?.caseNumber ?? null,
    });
    if (settings.modules.logs) await logModAction(guild, entry, { settings });

    await notifyTarget(
      target.user,
      `🔊 Vous n'êtes **plus réduit au silence** sur **${guild.name}**. Merci de respecter les règles à l'avenir.`,
    ).catch(() => undefined);

    return { cases: [...active, entry], mode: settings.mute.mode };
  }

  /** Débannit un utilisateur (par ID, même s'il n'est plus sur le serveur). */
  async unban(options: {
    guild: Guild;
    moderator: User;
    userId: string;
    userTag?: string;
    reason?: string | null;
  }): Promise<ModCase> {
    const { guild, moderator, userId, reason } = options;
    const settings = guildService.get(guild.id);
    let tag = options.userTag;

    if (!tag) {
      const ban = await guild.bans.fetch(userId).catch(() => null);
      if (!ban) throw new NotFoundError(`Aucun bannissement trouvé pour l'identifiant \`${userId}\`.`);
      tag = ban.user.tag;
      await guild.members.unban(userId, `${moderator.tag} : ${reason ?? 'unban'}`);
    } else {
      await guild.members.unban(userId, `${moderator.tag} : ${reason ?? 'unban'}`);
    }

    const caseNumber = guildService.nextCaseId(guild.id);
    const entry = caseService.create({
      guildId: guild.id,
      caseNumber,
      type: 'unban',
      targetId: userId,
      targetTag: tag,
      moderatorId: moderator.id,
      moderatorTag: moderator.tag,
      reason: reason?.trim() || 'Aucune raison fournie',
      duration: 0,
      expiresAt: 0,
      autoRevertAt: null,
    });

    caseService
      .listUser(guild.id, userId, ['ban'])
      .filter((item) => item.active)
      .forEach((item) => caseService.update(guild.id, item.caseNumber, { active: false }));

    if (settings.modules.logs) await logModAction(guild, entry, { settings });
    return entry;
  }

  /** Supprime des messages en masse et journalise l'action. */
  async purge(options: {
    channel: TextChannel;
    moderator: User;
    amount: number;
    filter?: (message: import('discord.js').Message) => boolean;
  }): Promise<{ deleted: number; caseEntry: ModCase }> {
    const { channel, moderator, amount, filter } = options;
    const deleted = await channel.bulkDelete(amount, filter ? true : false).catch(async () => channel.bulkDelete(amount, true));
    const guild = channel.guild;
    const caseNumber = guildService.nextCaseId(guild.id);
    const entry = caseService.create({
      guildId: guild.id,
      caseNumber,
      type: 'purge',
      targetId: channel.id,
      targetTag: `#${channel.name}`,
      moderatorId: moderator.id,
      moderatorTag: moderator.tag,
      reason: `${deleted.size} message(s) supprimé(s)`,
      duration: 0,
      expiresAt: 0,
      autoRevertAt: null,
      metadata: { channelId: channel.id, count: deleted.size },
    });
    return { deleted: deleted.size, caseEntry: entry };
  }

  /** Verrouille un salon (ou tous les salons configurés). */
  async lock(options: { guild: Guild; channel: TextChannel; moderator: User; reason?: string | null }): Promise<void> {
    const { guild, channel, moderator, reason } = options;
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason: `${moderator.tag} : lock` });
    const notifications = await this.trackLockCase(guild, channel, moderator, 'lock', reason ?? null);
    log.debug(`Salon #${channel.name} verrouillé (case #${notifications.caseNumber})`);
  }

  async unlock(options: { guild: Guild; channel: TextChannel; moderator: User; reason?: string | null }): Promise<void> {
    const { guild, channel, moderator, reason } = options;
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: `${moderator.tag} : unlock` });
    await this.trackLockCase(guild, channel, moderator, 'unlock', reason ?? null);
  }

  private async trackLockCase(
    guild: Guild,
    channel: TextChannel,
    moderator: User,
    type: 'lock' | 'unlock',
    reason: string | null,
  ): Promise<ModCase> {
    const settings = guildService.get(guild.id);
    const caseNumber = guildService.nextCaseId(guild.id);
    const entry = caseService.create({
      guildId: guild.id,
      caseNumber,
      type,
      targetId: channel.id,
      targetTag: `#${channel.name}`,
      moderatorId: moderator.id,
      moderatorTag: moderator.tag,
      reason: reason?.trim() || (type === 'lock' ? 'Salon verrouillé' : 'Salon déverrouillé'),
      duration: 0,
      expiresAt: 0,
      autoRevertAt: null,
      metadata: { channelId: channel.id },
    });
    if (settings.modules.logs) await logModAction(guild, entry, { settings });
    return entry;
  }

  /** Applique le ou les rôles automatiques configurés. */
  async applyAutoRoles(guild: Guild, member: GuildMember): Promise<void> {
    const settings = guildService.get(guild.id);
    if (!settings.modules.autoRole || settings.roles.autoRoles.length === 0) return;
    const roles = settings.roles.autoRoles.filter((roleId) => {
      const role = guild.roles.cache.get(roleId);
      return role && !role.managed && role.position < (guild.members.me?.roles.highest.position ?? 0);
    });
    if (roles.length === 0) return;
    await member.roles.add(roles, 'Rôles automatiques (arrivée)').catch((error) => {
      log.warn(`Rôles automatiques non appliqués pour ${member.user.tag}`, error);
    });
  }
}

export const moderationService = new ModerationService();

export interface SanctionInfo {
  label: string;
  emoji: string;
  color: number;
  type: CaseType;
}

/** Métadonnées d'affichage par type de sanction. */
export const SANCTION_META: Record<string, SanctionInfo> = {
  ban: { label: 'Bannissement', emoji: '🔨', color: 0xef4444, type: 'ban' },
  softban: { label: 'Softban', emoji: '🧹', color: 0xf97316, type: 'softban' },
  kick: { label: 'Expulsion', emoji: '👢', color: 0xf59e0b, type: 'kick' },
  timeout: { label: 'Timeout', emoji: '⏱️', color: 0xeab308, type: 'timeout' },
  mute: { label: 'Mute', emoji: '🔇', color: 0xa855f7, type: 'mute' },
  warn: { label: 'Avertissement', emoji: '⚠️', color: 0x38bdf8, type: 'warn' },
  unmute: { label: 'Unmute', emoji: '🔊', color: 0x22c55e, type: 'unmute' },
  unban: { label: 'Débannissement', emoji: '♻️', color: 0x22c55e, type: 'unban' },
  purge: { label: 'Purge', emoji: '🧽', color: 0x64748b, type: 'purge' },
  lock: { label: 'Verrouillage', emoji: '🔒', color: 0x64748b, type: 'lock' },
  unlock: { label: 'Déverrouillage', emoji: '🔓', color: 0x22c55e, type: 'unlock' },
};

export { caseType, timestampTag, ChannelType as PermissionChannelType, PermissionFlagsBits };
