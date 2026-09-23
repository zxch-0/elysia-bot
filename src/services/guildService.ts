import { db, type Collection, type Document } from '../core/database';
import { loadConfig } from '../core/config';
import type { Locale } from '../core/types';

/** Sanctions automatiques déclenchées par un nombre d'avertissements. */
export interface WarningThreshold {
  count: number;
  action: 'mute' | 'kick' | 'ban';
  /** Durée (ms) — 0 ou absent = permanent. */
  duration?: number;
}

export interface GuildSettings extends Document {
  id: string;
  locale: Locale;
  modules: {
    moderation: boolean;
    giveaways: boolean;
    rolePanels: boolean;
    logs: boolean;
    welcome: boolean;
    autoRole: boolean;
    games: boolean;
    /** Système d'XP / niveaux (`/niveau`). */
    levels: boolean;
    /** Économie : argent gagné en discutant, misé au blackjack (`/argent`). */
    economy: boolean;
    /** Annonces d'anniversaires (`/anniversaire`). */
    birthdays: boolean;
    /** Boîte à suggestions (`/suggestion`). */
    suggestions: boolean;
  };
  channels: {
    modLog?: string | null;
    messageLog?: string | null;
    memberLog?: string | null;
    welcome?: string | null;
    goodbye?: string | null;
    giveawayAnnounce?: string | null;
    /** Salon des annonces d'anniversaires. */
    birthday?: string | null;
    /** Salon des montées de niveau. */
    levelUp?: string | null;
    /** Salon des suggestions. */
    suggestions?: string | null;
  };
  roles: {
    mute?: string | null;
    autoRoles: string[];
    giveawayHosts: string[];
    staff: string[];
    giveawayPing?: string | null;
    mutedBypass: string[];
  };
  mute: {
    /** `timeout` = timeout natif Discord, `role` = rôle muet (temps illimité). */
    mode: 'timeout' | 'role';
    defaultDuration: number;
  };
  warnings: {
    thresholds: WarningThreshold[];
  };
  welcome: {
    enabled: boolean;
    message: string;
    embed: boolean;
    color: number;
  };
  goodbye: {
    enabled: boolean;
    message: string;
  };
  giveaway: {
    /** Rôles autorisés à lancer un giveaway (en plus des administrateurs). */
    defaultDuration: number;
    defaultWinners: number;
    requireAccountAge: number;
    requireMemberSince: number;
    dmWinners: boolean;
    blacklistedRoleIds: string[];
  };
  counters: {
    caseId: number;
    giveawayId: number;
    suggestionId: number;
    countdownId: number;
    reminderId: number;
    pollId: number;
  };
  /** Récompenses de rôle par niveau (système d'XP). */
  levels: LevelSettings;
  /** Réglages du système d'économie (argent gagné en discutant). */
  economy: EconomySettings;
  /** Réglages des modules communautaires (suggestions, anniversaires). */
  community: {
    suggestions: {
      /** Publier les suggestions sans nom d'auteur. */
      anonymousByDefault: boolean;
      /** Ouvrir un fil de discussion sous chaque suggestion. */
      createThreads: boolean;
    };
    birthdays: {
      /** Annoncer les anniversaires du jour. */
      announce: boolean;
    };
  };
  createdAt: number;
  updatedAt: number;
}

/** Réglages du système d'XP / niveaux. */
export interface LevelSettings {
  enabled: boolean;
  /** Gain d'XP minimum par message. */
  xpMin: number;
  /** Gain d'XP maximum par message. */
  xpMax: number;
  /** Délai minimum entre deux gains d'XP (ms). */
  cooldownMs: number;
  /** Annoncer les montées de niveau. */
  announce: boolean;
  /** Rôles attribués automatiquement à partir d'un niveau. */
  rewards: LevelReward[];
}

export interface LevelReward {
  level: number;
  roleId: string;
}

/** Réglages du système d'économie (`/argent`). */
export interface EconomySettings {
  enabled: boolean;
  /** Gain d'argent minimum par message. */
  moneyMin: number;
  /** Gain d'argent maximum par message. */
  moneyMax: number;
  /** Délai anti-flood entre deux gains (ms). */
  cooldownMs: number;
  /** Capital de départ crédité à la première apparition d'un membre. */
  startingBalance: number;
}

export function defaultGuildSettings(guildId: string): GuildSettings {
  const config = loadConfig();
  return {
    id: guildId,
    locale: config.defaultLocale,
    modules: {
      moderation: true,
      giveaways: true,
      rolePanels: true,
      logs: true,
      welcome: false,
      autoRole: false,
      games: true,
      levels: true,
      economy: true,
      birthdays: true,
      suggestions: true,
    },
    channels: {},
    roles: {
      autoRoles: [],
      giveawayHosts: [],
      staff: [],
      mutedBypass: [],
    },
    mute: {
      mode: 'timeout',
      defaultDuration: 10 * 60_000,
    },
    warnings: {
      thresholds: [
        { count: 3, action: 'mute', duration: 60 * 60_000 },
        { count: 5, action: 'mute', duration: 24 * 60 * 60_000 },
        { count: 7, action: 'ban' },
      ],
    },
    welcome: {
      enabled: false,
      message: 'Bienvenue {mention} sur **{server}** ! Nous sommes désormais {membercount} membres 🎉',
      embed: true,
      color: 0x7c5cff,
    },
    goodbye: {
      enabled: false,
      message: '**{user}** a quitté le serveur. À bientôt 👋',
    },
    giveaway: {
      defaultDuration: 24 * 60 * 60_000,
      defaultWinners: 1,
      requireAccountAge: 7,
      requireMemberSince: 0,
      dmWinners: true,
      blacklistedRoleIds: [],
    },
    counters: {
      caseId: 0,
      giveawayId: 0,
      suggestionId: 0,
      countdownId: 0,
      reminderId: 0,
      pollId: 0,
    },
    levels: {
      enabled: true,
      xpMin: 15,
      xpMax: 25,
      cooldownMs: 60_000,
      announce: true,
      rewards: [],
    },
    economy: {
      enabled: true,
      moneyMin: 8,
      moneyMax: 20,
      cooldownMs: 5_000,
      startingBalance: 50,
    },
    community: {
      suggestions: {
        anonymousByDefault: false,
        createThreads: true,
      },
      birthdays: {
        announce: true,
      },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Fusion profonde tolérante aux `undefined` (permet des patches partiels). */
function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (Array.isArray(base)) return (patch as unknown as T) ?? base;
  if (typeof base !== 'object' || base === null) return (patch as unknown as T) ?? base;

  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined) continue;
    const current = (base as Record<string, unknown>)[key];
    if (
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      result[key] = deepMerge(current, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Accès typé à la configuration par serveur, avec cache mémoire.
 * La configuration est créée automatiquement au premier accès.
 */
export class GuildService {
  private collection: Collection<GuildSettings> = db.collection<GuildSettings>('guilds');

  get(guildId: string): GuildSettings {
    const existing = this.collection.get(guildId);
    if (existing) {
      // Migration douce : on complète les champs ajoutés après coup.
      return deepMerge(defaultGuildSettings(guildId), existing) as GuildSettings;
    }
    const created = defaultGuildSettings(guildId);
    this.collection.set(created);
    return created;
  }

  /** Applique un patch et persiste (retourne la config fusionnée). */
  update(guildId: string, patch: DeepPartial<GuildSettings>): GuildSettings {
    const current = this.get(guildId);
    const merged = deepMerge(current, { ...patch, updatedAt: Date.now() } as DeepPartial<GuildSettings>);
    this.collection.set(merged);
    return merged;
  }

  set(guildId: string, settings: GuildSettings): GuildSettings {
    this.collection.set(settings);
    return settings;
  }

  reset(guildId: string): GuildSettings {
    const fresh = defaultGuildSettings(guildId);
    this.collection.set(fresh);
    return fresh;
  }

  /** Réserve le prochain numéro de case (incrément atomique en mémoire). */
  nextCaseId(guildId: string): number {
    const settings = this.get(guildId);
    const next = settings.counters.caseId + 1;
    settings.counters.caseId = next;
    settings.updatedAt = Date.now();
    this.collection.set(settings);
    return next;
  }

  nextGiveawayId(guildId: string): number {
    const settings = this.get(guildId);
    const next = settings.counters.giveawayId + 1;
    settings.counters.giveawayId = next;
    settings.updatedAt = Date.now();
    this.collection.set(settings);
    return next;
  }

  /**
   * Réserve le prochain numéro d'un compteur quelconque
   * (suggestions, comptes à rebours, rappels, sondages).
   */
  nextCounter(guildId: string, key: keyof GuildSettings['counters']): number {
    const settings = this.get(guildId);
    const next = (settings.counters[key] ?? 0) + 1;
    settings.counters[key] = next;
    settings.updatedAt = Date.now();
    this.collection.set(settings);
    return next;
  }

  /** Nombre de serveurs connus (statistiques du tableau de bord). */
  count(): number {
    return this.collection.size;
  }
}

export const guildService = new GuildService();
export type { DeepPartial };
