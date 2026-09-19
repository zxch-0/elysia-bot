import type { ElysiaClient } from '../core/client';
import { db, type Collection, type Document } from '../core/database';
import { BotError, isIgnorableError } from '../core/errors';
import { logger } from '../core/logger';
import { shortCode } from '../utils/random';
import {
  emptyRecord,
  type GameDefinition,
  type GameId,
  type GamePlayer,
  type GameRecord,
  type GameResult,
  type GameSession,
  type SessionStatus,
} from '../games/types';

const log = logger.child('games');

/** Statistiques persistées d'un joueur sur un serveur (une entrée par jeu + total). */
export interface GameStats extends Document {
  id: string;
  guildId: string;
  userId: string;
  tag: string;
  points: number;
  games: Partial<Record<GameId, GameRecord>>;
  updatedAt: number;
}

export interface RecordParams {
  guildId: string;
  userId: string;
  tag: string;
  game: GameId;
  result: GameResult;
  /** Points de classement gagnés (jamais négatifs). */
  points?: number;
  /** Performance à comparer au record personnel (score, coups, secondes…). */
  best?: number;
  betterIf?: 'higher' | 'lower';
}

export interface CreateSessionParams<S> {
  game: GameId;
  guildId: string;
  channelId: string;
  host: GamePlayer;
  players?: GamePlayer[];
  state: S;
  status?: SessionStatus;
  /** Durée d'inactivité tolérée avant expiration (défaut : celle du jeu). */
  idleTimeoutMs?: number;
}

/** Nombre maximal de parties simultanées par joueur (hôte) et par salon. */
const MAX_SESSIONS_PER_USER = 3;
const MAX_SESSIONS_PER_CHANNEL = 8;
/** Une partie terminée reste consultable (revanche…) pendant ce délai. */
const FINISHED_RETENTION_MS = 15 * 60_000;
const SWEEP_INTERVAL_MS = 10_000;

function isFinished(session: GameSession<any>): boolean {
  return session.status === 'finished';
}

/**
 * Gère les parties en mémoire (création, expiration, nettoyage) et les
 * statistiques persistantes (victoires, points, records, classement).
 */
export class GameService {
  private readonly collection: Collection<GameStats> = db.collection<GameStats>('game_stats');
  private readonly sessions = new Map<string, GameSession<any>>();
  private readonly definitions = new Map<GameId, GameDefinition<any>>();
  private client: ElysiaClient | undefined;
  private sweeper: NodeJS.Timeout | undefined;

  // ── Définitions ──────────────────────────────────────────────────────────

  registerDefinition(definition: GameDefinition<any>): void {
    this.definitions.set(definition.id, definition);
  }

  definition<S = unknown>(game: GameId): GameDefinition<S> | undefined {
    return this.definitions.get(game) as GameDefinition<S> | undefined;
  }

  listDefinitions(): GameDefinition<any>[] {
    return [...this.definitions.values()];
  }

  /** Branche le client Discord (édition des messages expirés) et démarre le nettoyage. */
  attach(client: ElysiaClient): void {
    this.client = client;
    if (this.sweeper) return;
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref?.();
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  createSession<S>(params: CreateSessionParams<S>): GameSession<S> {
    const definition = this.definitions.get(params.game);
    const idle = params.idleTimeoutMs ?? definition?.idleTimeoutMs ?? 10 * 60_000;

    const active = [...this.sessions.values()].filter((session) => session.status !== 'finished');
    if (active.filter((session) => session.hostId === params.host.id).length >= MAX_SESSIONS_PER_USER) {
      throw new BotError(
        `Vous avez déjà **${MAX_SESSIONS_PER_USER} parties** en cours. Terminez-en une (bouton 🏳️) avant d’en lancer une nouvelle.`,
      );
    }
    if (active.filter((session) => session.channelId === params.channelId).length >= MAX_SESSIONS_PER_CHANNEL) {
      throw new BotError(`Ce salon héberge déjà ${MAX_SESSIONS_PER_CHANNEL} parties actives. Patientez ou utilisez un autre salon.`);
    }

    let id = shortCode(6).toLowerCase();
    while (this.sessions.has(id)) id = shortCode(6).toLowerCase();

    const now = Date.now();
    const session: GameSession<S> = {
      id,
      game: params.game,
      guildId: params.guildId,
      channelId: params.channelId,
      messageId: null,
      hostId: params.host.id,
      players: params.players ?? [params.host],
      status: params.status ?? 'playing',
      state: params.state,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + idle,
      outcome: null,
      timers: new Set(),
    };
    this.sessions.set(id, session);
    return session;
  }

  get<S = unknown>(id: string): GameSession<S> | undefined {
    return this.sessions.get(id) as GameSession<S> | undefined;
  }

  /** Prolonge la partie après une action (l'inactivité repart de zéro). */
  touch(session: GameSession<any>, idleTimeoutMs?: number): void {
    const idle = idleTimeoutMs ?? this.definitions.get(session.game)?.idleTimeoutMs ?? 10 * 60_000;
    session.updatedAt = Date.now();
    session.expiresAt = session.updatedAt + idle;
  }

  /** Programme une minuterie liée à la partie (annulée automatiquement à la fin). */
  schedule(session: GameSession<any>, delayMs: number, callback: () => void | Promise<void>): NodeJS.Timeout {
    const timer = setTimeout(() => {
      session.timers.delete(timer);
      void (async () => {
        try {
          await callback();
        } catch (error) {
          log.warn(`Minuterie de partie ${session.game}/${session.id} en échec`, error);
        }
      })();
    }, delayMs);
    timer.unref?.();
    session.timers.add(timer);
    return timer;
  }

  /** Clôt une partie : minuteries annulées, conservée un moment pour la revanche. */
  finish(session: GameSession<any>, outcome: string | null = null): void {
    for (const timer of session.timers) clearTimeout(timer);
    session.timers.clear();
    session.status = 'finished';
    if (outcome) session.outcome = outcome;
    session.updatedAt = Date.now();
    session.expiresAt = session.updatedAt + FINISHED_RETENTION_MS;
  }

  /** Supprime immédiatement une partie (message impossible à envoyer, etc.). */
  discard(session: GameSession<any>): void {
    for (const timer of session.timers) clearTimeout(timer);
    session.timers.clear();
    this.sessions.delete(session.id);
  }

  /** Parties actives (statistiques du tableau de bord). */
  activeCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) if (session.status !== 'finished') count += 1;
    return count;
  }

  /** Ré-affiche le message Discord d'une partie à partir de son état courant. */
  async refreshMessage(session: GameSession<any>, options: { disabled?: boolean } = {}): Promise<boolean> {
    const client = this.client;
    const definition = this.definitions.get(session.game);
    if (!client || !definition || !session.messageId) return false;
    try {
      const channel = await client.channels.fetch(session.channelId);
      if (!channel || !channel.isTextBased() || !('messages' in channel)) return false;
      const message = await channel.messages.fetch(session.messageId);
      const payload = definition.render(session, options);
      await message.edit({
        content: payload.content ?? '',
        embeds: payload.embeds ?? [],
        components: payload.components ?? [],
      });
      return true;
    } catch (error) {
      if (!isIgnorableError(error)) log.debug(`Rafraîchissement impossible (${session.game}/${session.id})`, error);
      return false;
    }
  }

  /** Expire les parties inactives et purge les parties terminées. */
  private async sweep(): Promise<void> {
    const now = Date.now();
    for (const session of [...this.sessions.values()]) {
      if (session.expiresAt > now) continue;
      if (session.status === 'finished') {
        this.sessions.delete(session.id);
        continue;
      }
      const definition = this.definitions.get(session.game);
      try {
        definition?.onExpire?.(session);
      } catch (error) {
        log.warn(`onExpire de ${session.game} en échec`, error);
      }
      // `onExpire` peut avoir clos la partie lui-même (forfait, score…).
      if (!isFinished(session)) this.finish(session, session.outcome ?? '⌛ Partie expirée par inactivité.');
      await this.refreshMessage(session, { disabled: true });
      log.debug(`Partie ${session.game}/${session.id} expirée`);
    }
  }

  // ── Statistiques ─────────────────────────────────────────────────────────

  /** Enregistre le résultat d'une partie pour un joueur et retourne sa fiche. */
  record(params: RecordParams): GameRecord {
    const id = `${params.guildId}:${params.userId}`;
    const now = Date.now();
    const doc: GameStats = this.collection.get(id) ?? {
      id,
      guildId: params.guildId,
      userId: params.userId,
      tag: params.tag,
      points: 0,
      games: {},
      updatedAt: now,
    };
    const record = doc.games[params.game] ?? emptyRecord();

    record.played += 1;
    if (params.result === 'win') {
      record.wins += 1;
      record.streak += 1;
      record.bestStreak = Math.max(record.bestStreak, record.streak);
    } else if (params.result === 'loss') {
      record.losses += 1;
      record.streak = 0;
    } else {
      record.draws += 1;
    }

    const points = Math.max(0, Math.round(params.points ?? 0));
    record.points += points;
    doc.points += points;

    if (typeof params.best === 'number' && Number.isFinite(params.best)) {
      const better =
        record.best === null || (params.betterIf === 'lower' ? params.best < record.best : params.best > record.best);
      if (better) record.best = params.best;
    }

    doc.games[params.game] = record;
    doc.tag = params.tag;
    doc.updatedAt = now;
    this.collection.set(doc);
    return record;
  }

  stats(guildId: string, userId: string): GameStats | undefined {
    return this.collection.get(`${guildId}:${userId}`);
  }

  /** Classement d'un serveur (points totaux ou points d'un jeu précis). */
  leaderboard(guildId: string, limit = 10, game?: GameId): Array<{ stats: GameStats; points: number }> {
    return this.collection
      .find((doc) => doc.guildId === guildId)
      .map((stats) => ({ stats, points: game ? (stats.games[game]?.points ?? 0) : stats.points }))
      .filter((entry) => entry.points > 0)
      .sort((a, b) => b.points - a.points || a.stats.updatedAt - b.stats.updatedAt)
      .slice(0, limit);
  }

  /** Position d'un joueur dans le classement général (1 = premier), ou null. */
  rank(guildId: string, userId: string): number | null {
    const ordered = this.leaderboard(guildId, Number.MAX_SAFE_INTEGER);
    const index = ordered.findIndex((entry) => entry.stats.userId === userId);
    return index >= 0 ? index + 1 : null;
  }

  /** Nombre de joueurs ayant au moins une partie enregistrée (tableau de bord). */
  totalPlayers(): number {
    return this.collection.size;
  }
}

export const gameService = new GameService();
