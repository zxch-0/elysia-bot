import { AuditLogEvent, PermissionFlagsBits, type Guild, type Message, type Role, type TextChannel } from 'discord.js';
import { db, type Collection, type Document } from '../core/database';
import { loadConfig } from '../core/config';
import { logger } from '../core/logger';
import { baseEmbed, THEME } from '../ui/embeds';
import { sendToLog } from './logService';
import { guildService } from './guildService';
import { moderationService } from './moderationService';
import type { ElysiaClient } from '../core/client';

const log = logger.child('anti-raid');

/** Sanction applicable automatiquement par l'anti-raid. */
export type AntiRaidPunishment = 'none' | 'kick' | 'ban' | 'timeout';

/** Ratios d'un bloc de détection (fenêtre glissante + seuil). */
export interface AntiRaidWindow {
  windowSeconds: number;
  threshold: number;
}

/** Réglages du verrouillage automatique. */
export interface AntiRaidLockdownSettings {
  /** Verrouiller automatiquement quand un raid est détecté. */
  auto: boolean;
  /** Durée du verrouillage en secondes (0 = jusqu'à levée manuelle). */
  durationSeconds: number;
  denySendMessages: boolean;
  denyReactions: boolean;
  denyCreateThreads: boolean;
}

/** Détection du spam de messages par un membre. */
export interface AntiRaidSpamSettings {
  enabled: boolean;
  messages: number;
  windowSeconds: number;
  action: AntiRaidPunishment;
  timeoutMinutes: number;
}

/** Filtrage des comptes trop récents. */
export interface AntiRaidAccountAgeSettings {
  /** Âge minimal du compte en jours (0 = contrôle désactivé). */
  days: number;
  /** Sanction appliquée hors raid. */
  action: AntiRaidPunishment;
  /** Sanction appliquée quand un raid est en cours. */
  actionDuringRaid: AntiRaidPunishment;
}

/** Overwrite @everyone mémorisé avant verrouillage (restauration exacte). */
export interface SavedOverwrite {
  sendMessages?: boolean | null;
  addReactions?: boolean | null;
  createPublicThreads?: boolean | null;
  createPrivateThreads?: boolean | null;
  sendMessagesInThreads?: boolean | null;
}

/** État persistant d'un serveur (survit au redémarrage). */
export interface AntiRaidState {
  lockdownActive: boolean;
  /** Fin du verrouillage (0 = jusqu'à levée manuelle). */
  lockdownUntil: number;
  lockdownStartedAt: number;
  lockdownReason: string;
  lockdownBy: string;
  /** Overwrites @everyone mémorisés par salon avant verrouillage. */
  savedOverwrites: Record<string, SavedOverwrite>;
  /** Nombre de raids détectés depuis la mise en service. */
  detections: number;
  lastDetectionAt: number;
  lastDetectionReason: string;
}

export interface AntiRaidSettings extends Document {
  id: string;
  enabled: boolean;
  joins: AntiRaidWindow;
  channels: AntiRaidWindow & { deleteCreated: boolean };
  roles: AntiRaidWindow & { deleteCreated: boolean };
  bans: AntiRaidWindow;
  spam: AntiRaidSpamSettings;
  accountAge: AntiRaidAccountAgeSettings;
  lockdown: AntiRaidLockdownSettings;
  alert: {
    channelId?: string | null;
    mentionAdmins: boolean;
  };
  trusted: {
    userIds: string[];
    roleIds: string[];
  };
  state: AntiRaidState;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
}

/** Entrée du journal anti-raid (affichée dans l'onglet admin). */
export interface AntiRaidEvent {
  id: string;
  at: number;
  kind: 'arrivees' | 'salons' | 'roles' | 'bans' | 'spam' | 'verrouillage' | 'levee' | 'sanction';
  reason: string;
  actorId: string | null;
  /** Nombre d'occurrences observées dans la fenêtre. */
  count: number;
  /** Type de verrouillage si applicable. */
  action?: string;
  detail?: string;
}

/** Événement susceptible d'être simulé depuis l'onglet admin (test sans effet). */
export interface AntiRaidTestResult {
  type: 'arrivees' | 'salons' | 'roles' | 'bans' | 'spam';
  detected: boolean;
  count: number;
  threshold: number;
  windowSeconds: number;
  action: string;
  explain: string;
}

const DEFAULT_STATE: AntiRaidState = {
  lockdownActive: false,
  lockdownUntil: 0,
  lockdownStartedAt: 0,
  lockdownReason: '',
  lockdownBy: '',
  savedOverwrites: {},
  detections: 0,
  lastDetectionAt: 0,
  lastDetectionReason: '',
};

/** Réglages par défaut : protection active, sanctions destructrices désactivées. */
export function defaultAntiRaidSettings(guildId: string): AntiRaidSettings {
  const now = Date.now();
  return {
    id: guildId,
    enabled: true,
    joins: { windowSeconds: 10, threshold: 8 },
    channels: { windowSeconds: 10, threshold: 5, deleteCreated: true },
    roles: { windowSeconds: 10, threshold: 3, deleteCreated: true },
    bans: { windowSeconds: 20, threshold: 5 },
    spam: { enabled: false, messages: 8, windowSeconds: 5, action: 'timeout', timeoutMinutes: 10 },
    accountAge: { days: 7, action: 'none', actionDuringRaid: 'kick' },
    lockdown: { auto: true, durationSeconds: 600, denySendMessages: true, denyReactions: true, denyCreateThreads: true },
    alert: { channelId: null, mentionAdmins: true },
    trusted: { userIds: [], roleIds: [] },
    state: { ...DEFAULT_STATE },
    createdAt: now,
    updatedAt: now,
    updatedBy: 'système',
  };
}

interface GuildRuntime {
  joins: number[];
  channels: number[];
  roles: number[];
  bans: number[];
  spam: Map<string, number[]>;
  /** Salons récemment créés (id → horodatage) pour suppression ciblée. */
  createdChannels: Map<string, number>;
  createdRoles: Map<string, number>;
  events: AntiRaidEvent[];
}

function emptyRuntime(): GuildRuntime {
  return {
    joins: [],
    channels: [],
    roles: [],
    bans: [],
    spam: new Map(),
    createdChannels: new Map(),
    createdRoles: new Map(),
    events: [],
  };
}

/** Bornes dures : évite qu'un réglage absurde (0 ou 10 000) casse la détection. */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * 🛡️ Anti-raid.
 *
 * Surveille les vagues d'arrivées, la création massive de salons/rôles, les
 * bans en série et (option) le spam de messages. Quand un seuil est franchi :
 *  1. alerte dans le salon de logs (avec les auteurs identifiés via l'audit) ;
 *  2. verrouillage automatique du serveur (les overwrites @everyone d'origine
 *     sont mémorisés pour être restaurés à l'identique) ;
 *  3. sanctions optionnelles (kick/ban/timeout) sur les comptes suspects.
 *
 * ⚠️ Le bot lui-même est toujours considéré comme « de confiance » : les
 * simulations de l'onglet admin ne déclenchent donc jamais l'anti-raid.
 */
export class AntiRaidService {
  private collection: Collection<AntiRaidSettings> = db.collection<AntiRaidSettings>('antiraid');
  private runtime = new Map<string, GuildRuntime>();
  private client: ElysiaClient | undefined;
  private timer: NodeJS.Timeout | undefined;
  private sequence = 0;

  /** Branche le client Discord (nécessaire pour le verrouillage/sanctions). */
  attach(client: ElysiaClient): void {
    this.client = client;
    if (!this.timer) {
      this.timer = setInterval(() => void this.tick(), 5_000);
      this.timer.unref?.();
    }
  }

  /** Nombre de serveurs protégés (pour le tableau de bord). */
  get total(): number {
    return this.collection.size;
  }

  // ── Réglages ────────────────────────────────────────────────────────────

  /** Réglages d'un serveur (fusionnés avec les valeurs par défaut). */
  getSettings(guildId: string): AntiRaidSettings {
    const stored = this.collection.get(guildId);
    if (!stored) return defaultAntiRaidSettings(guildId);
    const defaults = defaultAntiRaidSettings(guildId);
    return {
      ...defaults,
      ...stored,
      joins: { ...defaults.joins, ...stored.joins },
      channels: { ...defaults.channels, ...stored.channels },
      roles: { ...defaults.roles, ...stored.roles },
      bans: { ...defaults.bans, ...stored.bans },
      spam: { ...defaults.spam, ...stored.spam },
      accountAge: { ...defaults.accountAge, ...stored.accountAge },
      lockdown: { ...defaults.lockdown, ...stored.lockdown },
      alert: { ...defaults.alert, ...stored.alert },
      trusted: { ...defaults.trusted, ...stored.trusted },
      state: { ...defaults.state, ...(stored.state ?? {}) },
    };
  }

  /** Enregistre les réglages d'un serveur (bornés, jamais de valeur absurde). */
  saveSettings(guildId: string, patch: Partial<AntiRaidSettings>, actor = 'panneau admin'): AntiRaidSettings {
    const current = this.getSettings(guildId);
    const merged: AntiRaidSettings = {
      ...current,
      ...patch,
      id: guildId,
      joins: {
        windowSeconds: clamp(patch.joins?.windowSeconds ?? current.joins.windowSeconds, 2, 300),
        threshold: clamp(patch.joins?.threshold ?? current.joins.threshold, 2, 200),
      },
      channels: {
        windowSeconds: clamp(patch.channels?.windowSeconds ?? current.channels.windowSeconds, 2, 300),
        threshold: clamp(patch.channels?.threshold ?? current.channels.threshold, 2, 50),
        deleteCreated: patch.channels?.deleteCreated ?? current.channels.deleteCreated,
      },
      roles: {
        windowSeconds: clamp(patch.roles?.windowSeconds ?? current.roles.windowSeconds, 2, 300),
        threshold: clamp(patch.roles?.threshold ?? current.roles.threshold, 2, 50),
        deleteCreated: patch.roles?.deleteCreated ?? current.roles.deleteCreated,
      },
      bans: {
        windowSeconds: clamp(patch.bans?.windowSeconds ?? current.bans.windowSeconds, 2, 600),
        threshold: clamp(patch.bans?.threshold ?? current.bans.threshold, 2, 100),
      },
      spam: {
        enabled: patch.spam?.enabled ?? current.spam.enabled,
        messages: clamp(patch.spam?.messages ?? current.spam.messages, 3, 100),
        windowSeconds: clamp(patch.spam?.windowSeconds ?? current.spam.windowSeconds, 2, 60),
        action: patch.spam?.action ?? current.spam.action,
        timeoutMinutes: clamp(patch.spam?.timeoutMinutes ?? current.spam.timeoutMinutes, 1, 1440),
      },
      accountAge: {
        days: clamp(patch.accountAge?.days ?? current.accountAge.days, 0, 365),
        action: patch.accountAge?.action ?? current.accountAge.action,
        actionDuringRaid: patch.accountAge?.actionDuringRaid ?? current.accountAge.actionDuringRaid,
      },
      lockdown: {
        auto: patch.lockdown?.auto ?? current.lockdown.auto,
        durationSeconds: clamp(patch.lockdown?.durationSeconds ?? current.lockdown.durationSeconds, 0, 86_400),
        denySendMessages: patch.lockdown?.denySendMessages ?? current.lockdown.denySendMessages,
        denyReactions: patch.lockdown?.denyReactions ?? current.lockdown.denyReactions,
        denyCreateThreads: patch.lockdown?.denyCreateThreads ?? current.lockdown.denyCreateThreads,
      },
      alert: {
        channelId: patch.alert?.channelId ?? current.alert.channelId ?? null,
        mentionAdmins: patch.alert?.mentionAdmins ?? current.alert.mentionAdmins,
      },
      trusted: {
        userIds: (patch.trusted?.userIds ?? current.trusted.userIds).filter((id) => /^\d{17,20}$/.test(id)).slice(0, 50),
        roleIds: (patch.trusted?.roleIds ?? current.trusted.roleIds).filter((id) => /^\d{17,20}$/.test(id)).slice(0, 50),
      },
      state: current.state,
      updatedBy: actor,
      updatedAt: Date.now(),
    };

    this.collection.set(merged);
    this.push({ guildId, kind: 'verrouillage', reason: `Réglages mis à jour par ${actor}`, actorId: null, count: 0 });
    log.info(`Anti-raid : réglages enregistrés pour ${guildId} (par ${actor}).`);
    return merged;
  }

  /** Membre de confiance ? (propriétaire, admin, liste blanche, bot) */
  isTrusted(guild: Guild, userId: string): boolean {
    if (!userId) return true;
    if (userId === guild.client.user?.id) return true;
    if (userId === guild.ownerId) return true;
    if (loadConfig().ownerIds.includes(userId)) return true;

    const settings = this.getSettings(guild.id);
    if (settings.trusted.userIds.includes(userId)) return true;

    const member = guild.members.cache.get(userId);
    if (member) {
      if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
      if (settings.trusted.roleIds.some((roleId) => member.roles.cache.has(roleId))) return true;
    }
    return false;
  }

  // ── Détections ──────────────────────────────────────────────────────────

  /** Arrivée d'un membre : vague + âge du compte. */
  async handleMemberAdd(member: import('discord.js').GuildMember): Promise<{ punished: string | null }> {
    const guild = member.guild;
    const settings = this.getSettings(guild.id);
    if (!settings.enabled) return { punished: null };
    if (this.isTrusted(guild, member.id)) return { punished: null };

    const runtime = this.runtimeFor(guild.id);
    const now = Date.now();
    runtime.joins = runtime.joins.filter((at) => now - at < settings.joins.windowSeconds * 1_000);
    runtime.joins.push(now);

    const raidActive = this.isRaidRecent(guild.id, settings);
    let punished: string | null = null;

    // Compte trop récent → sanction selon le contexte (raid ou non).
    if (settings.accountAge.days > 0) {
      const ageMs = now - member.user.createdTimestamp;
      if (ageMs < settings.accountAge.days * 86_400_000) {
        const action = raidActive ? settings.accountAge.actionDuringRaid : settings.accountAge.action;
        if (action !== 'none') {
          punished = await this.punish(guild, member.id, action, 'Anti-raid : compte trop récent', settings.spam.timeoutMinutes);
          if (punished) {
            this.push({
              guildId: guild.id,
              kind: 'sanction',
              reason: `Compte créé il y a ${Math.max(0, Math.round(ageMs / 3_600_000))} h — ${action}`,
              actorId: member.id,
              count: 1,
              action,
              detail: member.user.tag,
            });
          }
        }
      }
    }

    if (runtime.joins.length >= settings.joins.threshold) {
      const count = runtime.joins.length;
      runtime.joins = [];
      await this.triggerRaid(guild, {
        kind: 'arrivees',
        reason: `${count} arrivées en ${settings.joins.windowSeconds} s`,
        actorId: null,
        count,
      });
    } else if (runtime.joins.length >= Math.ceil(settings.joins.threshold / 2)) {
      this.push({
        guildId: guild.id,
        kind: 'arrivees',
        reason: `Pic d'arrivées inhabituel (${runtime.joins.length} en ${settings.joins.windowSeconds} s) — seuil ${settings.joins.threshold}`,
        actorId: null,
        count: runtime.joins.length,
      });
    }

    return { punished };
  }

  /** Création (ou suppression) de salon : vague + suppression des salons créés. */
  async handleChannelChange(channel: {
    id: string;
    guild: Guild;
    name?: string | null;
    kind?: 'create' | 'delete';
  }): Promise<void> {
    const guild = channel.guild;
    const kind = channel.kind ?? 'create';
    const settings = this.getSettings(guild.id);
    if (!settings.enabled) return;

    const runtime = this.runtimeFor(guild.id);
    const now = Date.now();
    runtime.channels = runtime.channels.filter((at) => now - at < settings.channels.windowSeconds * 1_000);
    runtime.channels.push(now);
    if (kind === 'create') runtime.createdChannels.set(channel.id, now);

    const actorId = await this.auditActor(guild, kind === 'create' ? AuditLogEvent.ChannelCreate : AuditLogEvent.ChannelDelete);
    if (actorId && this.isTrusted(guild, actorId)) {
      this.push({
        guildId: guild.id,
        kind: 'salons',
        reason: `Salon « ${channel.name ?? channel.id} » ${kind === 'create' ? 'créé' : 'supprimé'} par un membre de confiance — ignoré`,
        actorId,
        count: runtime.channels.length,
        detail: 'confiance',
      });
      return;
    }

    if (runtime.channels.length >= settings.channels.threshold) {
      const count = runtime.channels.length;
      // Seuls les salons créés pendant la vague (et par un compte non fiable)
      // sont supprimés : jamais ceux qui préexistaient au raid.
      const toDelete = [...runtime.createdChannels.entries()]
        .filter(([, at]) => now - at < settings.channels.windowSeconds * 1_000)
        .map(([id]) => id);

      if (settings.channels.deleteCreated && kind === 'create') {
        for (const id of toDelete) {
          const target = guild.channels.cache.get(id);
          if (!target) continue;
          await target.delete('Anti-raid : création massive de salons').catch(() => undefined);
        }
      }

      runtime.channels = [];
      runtime.createdChannels.clear();
      await this.triggerRaid(guild, {
        kind: 'salons',
        reason: `${count} salons ${kind === 'create' ? 'créés' : 'supprimés'} en ${settings.channels.windowSeconds} s${settings.channels.deleteCreated && kind === 'create' ? ' (salons créés supprimés)' : ''}`,
        actorId,
        count,
      });
      return;
    }

    if (runtime.channels.length >= Math.ceil(settings.channels.threshold / 2)) {
      this.push({
        guildId: guild.id,
        kind: 'salons',
        reason: `${kind === 'create' ? 'Création' : 'Suppression'} de salons inhabituelle (${runtime.channels.length}/${settings.channels.threshold})`,
        actorId,
        count: runtime.channels.length,
      });
    }
  }

  /** Création de rôle : vague + suppression des rôles créés. */
  async handleRoleCreate(role: Role): Promise<void> {
    const guild = role.guild;
    const settings = this.getSettings(guild.id);
    if (!settings.enabled) return;

    const runtime = this.runtimeFor(guild.id);
    const now = Date.now();
    runtime.roles = runtime.roles.filter((at) => now - at < settings.roles.windowSeconds * 1_000);
    runtime.roles.push(now);
    runtime.createdRoles.set(role.id, now);

    const actorId = await this.auditActor(guild, AuditLogEvent.RoleCreate);
    if (actorId && this.isTrusted(guild, actorId)) return;

    if (runtime.roles.length >= settings.roles.threshold) {
      const count = runtime.roles.length;
      if (settings.roles.deleteCreated) {
        for (const [id, at] of [...runtime.createdRoles.entries()]) {
          if (now - at > settings.roles.windowSeconds * 1_000) continue;
          const target = guild.roles.cache.get(id);
          if (!target) continue;
          await target.delete('Anti-raid : création massive de rôles').catch(() => undefined);
        }
      }
      runtime.roles = [];
      runtime.createdRoles.clear();
      await this.triggerRaid(guild, {
        kind: 'roles',
        reason: `${count} rôles créés en ${settings.roles.windowSeconds} s${settings.roles.deleteCreated ? ' (supprimés)' : ''}`,
        actorId,
        count,
      });
    }
  }

  /** Bannissements en série (compte staff compromis ?) → alerte immédiate. */
  async handleBanAdd(guild: Guild, targetTag: string): Promise<void> {
    const settings = this.getSettings(guild.id);
    if (!settings.enabled) return;

    const runtime = this.runtimeFor(guild.id);
    const now = Date.now();
    runtime.bans = runtime.bans.filter((at) => now - at < settings.bans.windowSeconds * 1_000);
    runtime.bans.push(now);

    if (runtime.bans.length >= settings.bans.threshold) {
      const count = runtime.bans.length;
      runtime.bans = [];
      const moderatorId = await this.auditActor(guild, AuditLogEvent.MemberBanAdd);
      await this.triggerRaid(guild, {
        kind: 'bans',
        reason: `${count} bannissements en ${settings.bans.windowSeconds} s — dernier : ${targetTag}`,
        actorId: moderatorId,
        count,
      });
    }
  }

  /** Spam de messages (optionnel) : timeout/kick/ban automatique. */
  async handleMessage(message: Message): Promise<void> {
    if (!message.inGuild() || message.author.bot) return;
    const guild = message.guild;
    const settings = this.getSettings(guild.id);
    if (!settings.enabled || !settings.spam.enabled) return;
    if (this.isTrusted(guild, message.author.id)) return;

    const runtime = this.runtimeFor(guild.id);
    const now = Date.now();
    const history = (runtime.spam.get(message.author.id) ?? []).filter((at) => now - at < settings.spam.windowSeconds * 1_000);
    history.push(now);
    runtime.spam.set(message.author.id, history);

    if (history.length < settings.spam.messages) return;
    runtime.spam.delete(message.author.id);

    const action = settings.spam.action;
    const punished = action === 'none' ? '' : await this.punish(guild, message.author.id, action, `Anti-raid : spam (${history.length} messages en ${settings.spam.windowSeconds} s)`, settings.spam.timeoutMinutes);

    this.push({
      guildId: guild.id,
      kind: 'spam',
      reason: `${message.author.tag} : ${history.length} messages en ${settings.spam.windowSeconds} s`,
      actorId: message.author.id,
      count: history.length,
      action: punished || 'alerte',
      detail: message.channelId ? `<#${message.channelId}>` : undefined,
    });
    await this.alert(guild, settings, {
      title: '🌊 Spam détecté',
      description: [
        `**Membre :** ${message.author.tag} (\`${message.author.id}\`)`,
        `**Volume :** ${history.length} messages en ${settings.spam.windowSeconds} s`,
        `**Sanction :** ${punished || 'aucune (alerte uniquement)'}`,
      ].join('\n'),
      color: THEME.colors.warning,
    });
  }

  // ── Verrouillage ────────────────────────────────────────────────────────

  /** Verrouille le serveur (retire l'écriture à @everyone, mémorise l'état). */
  async lockdown(
    guild: Guild,
    options: { reason?: string; durationSeconds?: number; by?: string } = {},
  ): Promise<{ ok: boolean; channels: number; until: number; error?: string }> {
    const settings = this.getSettings(guild.id);
    const state = settings.state;
    // Garde-fou : serveur simulé (mode démonstration) ou bot non connecté.
    if (!guild.channels?.cache || !guild.roles?.everyone) {
      return { ok: false, channels: 0, until: 0, error: 'Serveur indisponible (bot non connecté ou serveur simulé).' };
    }
    const me = guild.members?.me;
    if (!me) return { ok: false, channels: 0, until: 0, error: 'Le bot n’est pas présent sur ce serveur.' };
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles) && !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return { ok: false, channels: 0, until: 0, error: 'Permission « Gérer les salons » manquante.' };
    }

    const duration = options.durationSeconds ?? settings.lockdown.durationSeconds;
    const now = Date.now();
    const channels = [...guild.channels.cache.values()].filter((channel) => channel.isTextBased() && !channel.isDMBased()) as TextChannel[];

    /** Permission @everyone actuelle mémorisée pour une restauration à l'identique. */
    const remember = (target: TextChannel, everyone: ReturnType<TextChannel['permissionOverwrites']['cache']['get']>) => ({
      sendMessages: everyone?.allow.has(PermissionFlagsBits.SendMessages) ? true : everyone?.deny.has(PermissionFlagsBits.SendMessages) ? false : null,
      addReactions: everyone?.allow.has(PermissionFlagsBits.AddReactions) ? true : everyone?.deny.has(PermissionFlagsBits.AddReactions) ? false : null,
      createPublicThreads: everyone?.allow.has(PermissionFlagsBits.CreatePublicThreads)
        ? true
        : everyone?.deny.has(PermissionFlagsBits.CreatePublicThreads)
          ? false
          : null,
      createPrivateThreads: everyone?.allow.has(PermissionFlagsBits.CreatePrivateThreads)
        ? true
        : everyone?.deny.has(PermissionFlagsBits.CreatePrivateThreads)
          ? false
          : null,
      sendMessagesInThreads: everyone?.allow.has(PermissionFlagsBits.SendMessagesInThreads)
        ? true
        : everyone?.deny.has(PermissionFlagsBits.SendMessagesInThreads)
          ? false
          : null,
    });

    // Traitement par lots : un gros serveur (500+ salons) est verrouillé en
    // quelques secondes sans saturer l'API Discord.
    const BATCH = 8;
    for (let index = 0; index < channels.length; index += BATCH) {
      await Promise.all(
        channels.slice(index, index + BATCH).map(async (target) => {
          const everyone = target.permissionOverwrites.cache.get(guild.roles.everyone.id);
          if (!state.savedOverwrites[target.id]) state.savedOverwrites[target.id] = remember(target, everyone);

          await target.permissionOverwrites
            .edit(guild.roles.everyone, {
              SendMessages: settings.lockdown.denySendMessages ? false : undefined,
              AddReactions: settings.lockdown.denyReactions ? false : undefined,
              CreatePublicThreads: settings.lockdown.denyCreateThreads ? false : undefined,
              CreatePrivateThreads: settings.lockdown.denyCreateThreads ? false : undefined,
              SendMessagesInThreads: settings.lockdown.denySendMessages ? false : undefined,
            })
            .catch((error) => log.warn(`Verrouillage du salon ${target.id} impossible`, error));
        }),
      );
    }

    state.lockdownActive = true;
    state.lockdownStartedAt = now;
    state.lockdownUntil = duration > 0 ? now + duration * 1_000 : 0;
    state.lockdownReason = options.reason?.slice(0, 300) || 'Verrouillage manuel';
    state.lockdownBy = options.by ?? 'panneau admin';
    this.collection.set(settings);

    this.push({
      guildId: guild.id,
      kind: 'verrouillage',
      reason: state.lockdownReason,
      actorId: null,
      count: channels.length,
      action: duration > 0 ? `expire dans ${Math.round(duration / 60)} min` : 'manuel',
    });
    log.warn(`🔒 ${guild.name} verrouillé (${channels.length} salons) — ${state.lockdownReason}`);

    await this.alert(guild, settings, {
      title: '🔒 Verrouillage activé',
      description: [
        `**Motif :** ${state.lockdownReason}`,
        `**Salons verrouillés :** ${channels.length}`,
        `**Durée :** ${duration > 0 ? `${Math.round(duration / 60)} min` : 'jusqu’à levée manuelle'}`,
        `**Déclenché par :** ${state.lockdownBy}`,
      ].join('\n'),
      color: THEME.colors.error,
    });

    return { ok: true, channels: channels.length, until: state.lockdownUntil };
  }

  /** Déverrouille le serveur et restaure les overwrites d'origine. */
  async release(
    guild: Guild,
    options: { reason?: string; by?: string } = {},
  ): Promise<{ ok: boolean; channels: number }> {
    const settings = this.getSettings(guild.id);
    const state = settings.state;
    let channels = 0;

    if (!guild.channels?.cache) return { ok: false, channels: 0 };

    const entries = Object.entries(state.savedOverwrites);
    const BATCH = 8;
    for (let index = 0; index < entries.length; index += BATCH) {
      const results = await Promise.all(
        entries.slice(index, index + BATCH).map(async ([channelId, saved]) => {
          const channel = guild.channels.cache.get(channelId);
          if (!channel || !channel.isTextBased() || channel.isDMBased()) return 0;
          await (channel as TextChannel).permissionOverwrites
            .edit(guild.roles.everyone, {
              SendMessages: saved.sendMessages ?? null,
              AddReactions: saved.addReactions ?? null,
              CreatePublicThreads: saved.createPublicThreads ?? null,
              CreatePrivateThreads: saved.createPrivateThreads ?? null,
              SendMessagesInThreads: saved.sendMessagesInThreads ?? null,
            })
            .catch((error) => log.warn(`Restauration du salon ${channelId} impossible`, error));
          return 1;
        }),
      );
      channels += results.reduce<number>((sum, value) => sum + value, 0);
    }

    state.savedOverwrites = {};
    state.lockdownActive = false;
    state.lockdownUntil = 0;
    state.lockdownReason = '';
    state.lockdownStartedAt = 0;
    state.lockdownBy = '';
    this.collection.set(settings);

    this.push({ guildId: guild.id, kind: 'levee', reason: options.reason ?? 'Verrouillage levé', actorId: null, count: channels });
    log.info(`🔓 ${guild.name} déverrouillé (${channels} salons restaurés).`);

    await this.alert(guild, settings, {
      title: '🔓 Verrouillage levé',
      description: [
        `**Salons restaurés :** ${channels}`,
        `**Par :** ${options.by ?? 'panneau admin'}`,
      ].join('\n'),
      color: THEME.colors.success,
    });

    return { ok: true, channels };
  }

  /** Vrai si un raid a été détecté très récemment (fenêtre de 3 minutes). */
  isRaidRecent(guildId: string, settings?: AntiRaidSettings): boolean {
    const effective = settings ?? this.getSettings(guildId);
    if (effective.state.lockdownActive) return true;
    return Date.now() - effective.state.lastDetectionAt < 3 * 60_000;
  }

  // ── Supervision ─────────────────────────────────────────────────────────

  /** État complet d'un serveur pour l'onglet admin. */
  overview(guildId: string): {
    settings: Omit<AntiRaidSettings, 'state'> & { state: Omit<AntiRaidState, 'savedOverwrites'> & { lockedChannels: number } };
    events: AntiRaidEvent[];
    runtime: { joins: number; channels: number; roles: number; bans: number };
  } {
    const settings = this.getSettings(guildId);
    const runtime = this.runtimeFor(guildId);
    const { savedOverwrites, ...state } = settings.state;
    return {
      settings: {
        ...settings,
        state: { ...state, lockedChannels: Object.keys(savedOverwrites).length },
      },
      events: runtime.events.slice(-40).reverse(),
      runtime: {
        joins: runtime.joins.length,
        channels: runtime.channels.length,
        roles: runtime.roles.length,
        bans: runtime.bans.length,
      },
    };
  }

  /** Test à blanc : indique ce qui se passerait avec les réglages actuels. */
  test(guildId: string, type: AntiRaidTestResult['type'], count?: number): AntiRaidTestResult {
    const settings = this.getSettings(guildId);
    const labels: Record<AntiRaidTestResult['type'], { windowSeconds: number; threshold: number; action: string; label: string }> = {
      arrivees: {
        windowSeconds: settings.joins.windowSeconds,
        threshold: settings.joins.threshold,
        action: settings.lockdown.auto ? 'verrouillage automatique' : 'alerte seule',
        label: 'arrivées',
      },
      salons: {
        windowSeconds: settings.channels.windowSeconds,
        threshold: settings.channels.threshold,
        action: settings.channels.deleteCreated ? 'suppression des salons créés + verrouillage' : 'alerte + verrouillage',
        label: 'salons créés',
      },
      roles: {
        windowSeconds: settings.roles.windowSeconds,
        threshold: settings.roles.threshold,
        action: settings.roles.deleteCreated ? 'suppression des rôles créés + verrouillage' : 'alerte + verrouillage',
        label: 'rôles créés',
      },
      bans: {
        windowSeconds: settings.bans.windowSeconds,
        threshold: settings.bans.threshold,
        action: 'alerte immédiate (bannissements non annulés automatiquement)',
        label: 'bannissements',
      },
      spam: {
        windowSeconds: settings.spam.messages > 0 ? settings.spam.windowSeconds : 0,
        threshold: settings.spam.messages,
        action: settings.spam.action === 'none' ? 'alerte seule' : `sanction : ${settings.spam.action}`,
        label: 'messages',
      },
    };
    const config = labels[type];
    const value = count ?? config.threshold;
    const detected = settings.enabled && value >= config.threshold;
    return {
      type,
      detected,
      count: value,
      threshold: config.threshold,
      windowSeconds: config.windowSeconds,
      action: config.action,
      explain: !settings.enabled
        ? 'Anti-raid désactivé sur ce serveur : aucune détection ne serait déclenchée.'
        : detected
          ? `Avec ${value} ${config.label} en ${config.windowSeconds} s, le seuil de ${config.threshold} serait franchi → ${config.action}.`
          : `Avec ${value} ${config.label} en ${config.windowSeconds} s, le seuil de ${config.threshold} ne serait pas atteint (aucune action).`,
    };
  }

  /** Derniers événements d'un serveur (ou de tous si `guildId` est absent). */
  recentEvents(guildId?: string, limit = 30): AntiRaidEvent[] {
    if (guildId) return this.runtimeFor(guildId).events.slice(-limit).reverse();
    return [...this.runtime.values()]
      .flatMap((runtime) => runtime.events)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  }

  // ── Interne ─────────────────────────────────────────────────────────────

  /** Vérifie les verrouillages arrivés à échéance (toutes les 5 s). */
  private async tick(): Promise<void> {
    const now = Date.now();
    for (const settings of this.collection.all()) {
      const state = settings.state;
      if (!state?.lockdownActive || !state.lockdownUntil || state.lockdownUntil > now) continue;
      const guild = this.client?.guilds.cache.get(settings.id);
      if (!guild) continue;
      await this.release(guild, { reason: 'Fin du verrouillage automatique', by: 'anti-raid' }).catch((error) =>
        log.warn(`Levée automatique impossible sur ${settings.id}`, error),
      );
    }
  }

  /** Détection confirmée : alerte + verrouillage automatique. */
  private async triggerRaid(
    guild: Guild,
    event: { kind: AntiRaidEvent['kind']; reason: string; actorId: string | null; count: number },
  ): Promise<void> {
    const settings = this.getSettings(guild.id);
    const state = settings.state;
    state.detections += 1;
    state.lastDetectionAt = Date.now();
    state.lastDetectionReason = event.reason;
    this.collection.set(settings);

    this.push({ guildId: guild.id, ...event });

    let lockdownInfo = 'verrouillage désactivé';
    if (settings.lockdown.auto) {
      const result = await this.lockdown(guild, {
        reason: `Anti-raid : ${event.reason}`,
        durationSeconds: settings.lockdown.durationSeconds,
        by: 'anti-raid (automatique)',
      });
      lockdownInfo = result.ok ? `🔒 ${result.channels} salons verrouillés` : `⚠️ verrouillage impossible (${result.error})`;
    }

    const actor = event.actorId ? `<@${event.actorId}>` : 'inconnu (audit inaccessible)';
    await this.alert(guild, settings, {
      title: '🚨 RAID DÉTECTÉ',
      description: [
        `**Type :** ${event.kind}`,
        `**Détail :** ${event.reason}`,
        `**Auteur identifié :** ${actor}`,
        `**Réaction :** ${lockdownInfo}`,
        '',
        'Utilisez `/antiraid deverrouiller` (ou l’onglet admin) une fois la situation stabilisée.',
      ].join('\n'),
      color: THEME.colors.error,
    });

    log.warn(`🚨 Raid détecté sur ${guild.name} (${event.kind}) : ${event.reason}`);
  }

  /** Applique une sanction via le système de modération (cases + logs). */
  private async punish(
    guild: Guild,
    userId: string,
    action: AntiRaidPunishment,
    reason: string,
    timeoutMinutes: number,
  ): Promise<string | null> {
    if (action === 'none') return null;
    const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
    if (!member) return null;
    if (this.isTrusted(guild, userId)) return null;

    const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!me) return null;

    try {
      if (action === 'ban' && member.bannable) {
        await moderationService.ban({ guild, moderator: guild.client.user!, moderatorMember: me, target: member, reason, silent: true });
        return `banni (${reason})`;
      }
      if (action === 'kick' && member.kickable) {
        await moderationService.kick({ guild, moderator: guild.client.user!, moderatorMember: me, target: member, reason, silent: true });
        return `expulsé (${reason})`;
      }
      if (action === 'timeout' && member.moderatable) {
        await moderationService.timeout({
          guild,
          moderator: guild.client.user!,
          moderatorMember: me,
          target: member,
          reason,
          duration: timeoutMinutes * 60_000,
          silent: true,
        });
        return `timeout ${timeoutMinutes} min (${reason})`;
      }
      return null;
    } catch (error) {
      log.warn(`Sanction « ${action} » impossible sur ${member.user.tag}`, error);
      return null;
    }
  }

  /** Auteur d'une action Discord via le journal d'audit (si autorisé). */
  private async auditActor(guild: Guild, type: AuditLogEvent): Promise<string | null> {
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
    try {
      const logs = await guild.fetchAuditLogs({ type, limit: 5 });
      const entry = logs.entries.find((candidate) => Date.now() - candidate.createdTimestamp < 15_000);
      return entry?.executorId ?? null;
    } catch {
      return null;
    }
  }

  /** Envoie une alerte dans le salon configuré (sinon logs de modération). */
  private async alert(
    guild: Guild,
    settings: AntiRaidSettings,
    content: { title: string; description: string; color: number },
  ): Promise<void> {
    const channelId = settings.alert.channelId || guildService.get(guild.id).channels.modLog;
    const staffRoles = settings.alert.mentionAdmins
      ? guildService.get(guild.id).roles.staff.filter((roleId) => guild.roles.cache.has(roleId)).slice(0, 3)
      : [];
    const mention = staffRoles.map((roleId) => `<@&${roleId}>`).join(' ');

    const embed = baseEmbed({ ...content, footer: 'Elysia • anti-raid' });
    await sendToLog(guild, channelId, embed).catch(() => undefined);
    if (mention) {
      const channel = channelId ? guild.channels.cache.get(channelId) : undefined;
      if (channel?.isTextBased() && !channel.isDMBased()) {
        await (channel as TextChannel)
          .send({ content: mention, allowedMentions: { roles: staffRoles } })
          .catch(() => undefined);
      }
    }
  }

  private runtimeFor(guildId: string): GuildRuntime {
    let runtime = this.runtime.get(guildId);
    if (!runtime) {
      runtime = emptyRuntime();
      this.runtime.set(guildId, runtime);
    }
    return runtime;
  }

  private push(event: Omit<AntiRaidEvent, 'id' | 'at'> & { guildId: string }): void {
    const runtime = this.runtimeFor(event.guildId);
    runtime.events.push({ ...event, id: `${Date.now().toString(36)}-${(this.sequence += 1).toString(36)}`, at: Date.now() });
    if (runtime.events.length > 60) runtime.events = runtime.events.slice(-60);
  }
}

export const antiRaidService = new AntiRaidService();
