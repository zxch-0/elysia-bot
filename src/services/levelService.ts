import type { Guild, GuildMember, Message } from 'discord.js';
import { randomInt } from 'node:crypto';
import { db, type Collection, type Document } from '../core/database';
import { logger } from '../core/logger';
import type { GuildSettings } from './guildService';
import { isRoleAssignable } from '../utils/permissions';

const log = logger.child('levels');

export interface LevelEntry extends Document {
  /** `${guildId}:${userId}` */
  id: string;
  guildId: string;
  userId: string;
  tag: string;
  xp: number;
  level: number;
  messages: number;
  lastXpAt: number;
  updatedAt: number;
}

export interface LevelProgress {
  level: number;
  /** XP accumulé dans le niveau courant. */
  into: number;
  /** XP nécessaire pour passer au niveau suivant. */
  needed: number;
  /** XP total. */
  xp: number;
  /** Ratio de progression (0 → 1). */
  ratio: number;
}

/**
 * Courbe d'XP : `totalXpForLevel(n) = 100 × n²`.
 * Niveau 1 → 100 XP, niveau 2 → 400, niveau 3 → 900, niveau 10 → 10 000.
 */
export function totalXpForLevel(level: number): number {
  const safe = Math.max(Math.trunc(level), 0);
  return 100 * safe * safe;
}

/** Niveau correspondant à un total d'XP. */
export function levelFromXp(xp: number): number {
  if (xp <= 0) return 0;
  return Math.floor(Math.sqrt(xp / 100));
}

/** Progression détaillée (niveau, XP dans le niveau, XP restant). */
export function levelProgress(xp: number): LevelProgress {
  const safeXp = Math.max(Math.trunc(xp), 0);
  const level = levelFromXp(safeXp);
  const floor = totalXpForLevel(level);
  const ceiling = totalXpForLevel(level + 1);
  const into = safeXp - floor;
  const needed = ceiling - floor;
  return { level, into, needed, xp: safeXp, ratio: needed > 0 ? into / needed : 0 };
}

/**
 * Système d'XP / niveaux (`/niveau`).
 * L'XP est gagné en discutant (1 fois par minute et par membre), les rôles de
 * récompense sont attribués automatiquement à la montée de niveau.
 */
export class LevelService {
  private readonly collection: Collection<LevelEntry> = db.collection<LevelEntry>('levels');

  private key(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  entry(guildId: string, userId: string): LevelEntry | undefined {
    return this.collection.get(this.key(guildId, userId));
  }

  /** Crée l'entrée si besoin (lecture seule, sans écriture disque inutile). */
  ensure(guildId: string, userId: string, tag: string): LevelEntry {
    const existing = this.collection.get(this.key(guildId, userId));
    if (existing) {
      if (tag && existing.tag !== tag) existing.tag = tag;
      return existing;
    }
    const entry: LevelEntry = {
      id: this.key(guildId, userId),
      guildId,
      userId,
      tag,
      xp: 0,
      level: 0,
      messages: 0,
      lastXpAt: 0,
      updatedAt: Date.now(),
    };
    this.collection.set(entry);
    return entry;
  }

  /**
   * Traite un message : ajoute de l'XP si le délai anti-spam est écoulé.
   * Retourne `null` si aucun XP n'a été attribué.
   */
  handleMessage(message: Message, settings: GuildSettings, now = Date.now()): { gained: number; entry: LevelEntry; levelUp: boolean; progress: LevelProgress } | null {
    if (!settings.modules.levels || !settings.levels.enabled) return null;
    if (message.author.bot || !message.guildId || !message.inGuild()) return null;
    if (message.system) return null;

    const entry = this.ensure(message.guildId, message.author.id, message.author.tag);
    if (now - entry.lastXpAt < settings.levels.cooldownMs) return null;

    const min = Math.max(settings.levels.xpMin, 1);
    const max = Math.max(settings.levels.xpMax, min);
    const gained = max === min ? min : randomInt(min, max + 1);

    const previousLevel = entry.level;
    entry.xp += gained;
    entry.level = levelFromXp(entry.xp);
    entry.messages += 1;
    entry.lastXpAt = now;
    entry.tag = message.author.tag;
    entry.updatedAt = now;
    this.collection.set(entry);

    return {
      gained,
      entry,
      levelUp: entry.level > previousLevel,
      progress: levelProgress(entry.xp),
    };
  }

  /** Attribue un montant d'XP précis (récompense, événement, correction). */
  addXp(guildId: string, userId: string, tag: string, amount: number): LevelEntry {
    const entry = this.ensure(guildId, userId, tag);
    const previousLevel = entry.level;
    entry.xp = Math.max(0, entry.xp + Math.trunc(amount));
    entry.level = levelFromXp(entry.xp);
    entry.updatedAt = Date.now();
    this.collection.set(entry);
    if (entry.level !== previousLevel) log.debug(`${tag} passe au niveau ${entry.level}`);
    return entry;
  }

  /** Remet un membre à zéro (modération du classement). */
  reset(guildId: string, userId: string): boolean {
    return this.collection.delete(this.key(guildId, userId));
  }

  /** Classement d'un serveur, trié par XP décroissant. */
  leaderboard(guildId: string, limit = 10): LevelEntry[] {
    return this.collection
      .find((entry) => entry.guildId === guildId && entry.xp > 0)
      .sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId))
      .slice(0, Math.max(limit, 1));
  }

  /** Rang d'un membre (1 = premier) ou `null` s'il n'a jamais gagné d'XP. */
  rank(guildId: string, userId: string): number | null {
    const entry = this.entry(guildId, userId);
    if (!entry || entry.xp <= 0) return null;
    return this.collection.count((item) => item.guildId === guildId && item.xp > entry.xp) + 1;
  }

  countActive(guildId: string): number {
    return this.collection.count((entry) => entry.guildId === guildId && entry.xp > 0);
  }

  /** Total d'XP distribué sur un serveur (statistiques). */
  totalXp(guildId: string): number {
    return this.collection
      .find((entry) => entry.guildId === guildId)
      .reduce((sum, entry) => sum + entry.xp, 0);
  }

  /**
   * Attribue les rôles de récompense atteints par un membre.
   * Retourne la liste des rôles effectivement ajoutés.
   */
  async applyRewards(guild: Guild, member: GuildMember, level: number, settings: GuildSettings): Promise<string[]> {
    const granted: string[] = [];
    const rewards = [...settings.levels.rewards].sort((a, b) => a.level - b.level);

    for (const reward of rewards) {
      if (reward.level > level) continue;
      const role = guild.roles.cache.get(reward.roleId);
      if (!role || member.roles.cache.has(role.id)) continue;
      if (!isRoleAssignable(guild, role)) {
        log.warn(`Récompense de niveau ${reward.level} ignorée : le rôle ${role.name} est trop haut pour moi.`);
        continue;
      }
      try {
        await member.roles.add(role, `Récompense de niveau ${reward.level}`);
        granted.push(role.id);
      } catch (error) {
        log.warn(`Attribution du rôle de récompense ${role.id} impossible`, error);
      }
    }

    return granted;
  }

  /** Supprime les entrées de membres ayant quitté le serveur (entretien). */
  pruneGuild(guild: Guild, keepIds: Set<string>): number {
    const stale = this.collection.find((entry) => entry.guildId === guild.id && !keepIds.has(entry.userId));
    for (const entry of stale) this.collection.delete(entry.id);
    return stale.length;
  }

  total(): number {
    return this.collection.size;
  }
}

export const levelService = new LevelService();
