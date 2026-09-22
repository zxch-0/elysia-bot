/**
 * Duels amicaux entre deux membres (`/duel`).
 * Chaque manche : les deux adversaires lancent 2d6, le meilleur total gagne
 * la manche. En cas d'égalité après toutes les manches, on rejoue en mort
 * subite jusqu'à ce qu'un joueur se détache.
 *
 * La logique est volontairement séparée de Discord (testable hors ligne).
 */

import { rollDice } from '../utils/dice';
import { shortCode } from '../utils/random';

export type DuelStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface DuelRound {
  host: number;
  target: number;
  /** 'host', 'target' ou 'tie'. */
  winner: 'host' | 'target' | 'tie';
  suddenDeath?: boolean;
}

export interface DuelSession {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string | null;
  hostId: string;
  hostTag: string;
  targetId: string;
  targetTag: string;
  rounds: number;
  bet: string | null;
  status: DuelStatus;
  history: DuelRound[];
  hostWins: number;
  targetWins: number;
  winnerId?: string | null;
  loserId?: string | null;
  createdAt: number;
  expiresAt: number;
}

/** Durée maximale avant expiration d'un défi non accepté (2 minutes). */
export const DUEL_TTL_MS = 2 * 60_000;
/** Nombre de manches autorisées. */
export const DUEL_ROUND_CHOICES = [1, 3, 5] as const;
/** Nombre maximal de manches de mort subite (sécurité anti-boucle). */
const MAX_SUDDEN_DEATH = 10;

const sessions = new Map<string, DuelSession>();

export function createDuel(params: {
  guildId: string;
  channelId: string;
  hostId: string;
  hostTag: string;
  targetId: string;
  targetTag: string;
  rounds?: number;
  bet?: string | null;
}): DuelSession {
  const session: DuelSession = {
    id: shortCode(6),
    guildId: params.guildId,
    channelId: params.channelId,
    messageId: null,
    hostId: params.hostId,
    hostTag: params.hostTag,
    targetId: params.targetId,
    targetTag: params.targetTag,
    rounds: DUEL_ROUND_CHOICES.includes((params.rounds ?? 3) as 3) ? (params.rounds ?? 3) : 3,
    bet: params.bet?.slice(0, 200) ?? null,
    status: 'pending',
    history: [],
    hostWins: 0,
    targetWins: 0,
    winnerId: null,
    loserId: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + DUEL_TTL_MS,
  };
  sessions.set(session.id, session);
  purgeExpired();
  return session;
}

export function getDuel(id: string): DuelSession | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  if (session.status === 'pending' && session.expiresAt < Date.now()) {
    session.status = 'expired';
  }
  return session;
}

export function setDuelMessage(id: string, messageId: string): void {
  const session = sessions.get(id);
  if (session) session.messageId = messageId;
}

/** Lance les manches et désigne le gagnant. */
export function playDuel(session: DuelSession): DuelSession {
  const roll = () => rollDice('2d6').total;

  for (let round = 0; round < session.rounds; round += 1) {
    const host = roll();
    const target = roll();
    const winner = host === target ? 'tie' : host > target ? 'host' : 'target';
    session.history.push({ host, target, winner });
    if (winner === 'host') session.hostWins += 1;
    if (winner === 'target') session.targetWins += 1;
  }

  // Mort subite tant que les deux joueurs sont à égalité.
  let sudden = 0;
  while (session.hostWins === session.targetWins && sudden < MAX_SUDDEN_DEATH) {
    const host = roll();
    const target = roll();
    if (host === target) {
      session.history.push({ host, target, winner: 'tie', suddenDeath: true });
      sudden += 1;
      continue;
    }
    const winner = host > target ? 'host' : 'target';
    session.history.push({ host, target, winner, suddenDeath: true });
    if (winner === 'host') session.hostWins += 1;
    else session.targetWins += 1;
    sudden += 1;
  }

  // Sécurité : si la mort subite n'a rien donné (cas extrême), on tranche à la manche la plus haute.
  if (session.hostWins === session.targetWins) {
    const hostTotal = session.history.reduce((sum, round) => sum + round.host, 0);
    const targetTotal = session.history.reduce((sum, round) => sum + round.target, 0);
    if (hostTotal >= targetTotal) session.hostWins += 1;
    else session.targetWins += 1;
  }

  if (session.hostWins > session.targetWins) {
    session.winnerId = session.hostId;
    session.loserId = session.targetId;
  } else {
    session.winnerId = session.targetId;
    session.loserId = session.hostId;
  }
  session.status = 'accepted';
  return session;
}

export function declineDuel(id: string, userId: string): DuelSession | undefined {
  const session = sessions.get(id);
  if (!session || session.targetId !== userId || session.status !== 'pending') return undefined;
  session.status = 'declined';
  return session;
}

export function cancelDuel(id: string, userId: string): DuelSession | undefined {
  const session = sessions.get(id);
  if (!session || session.hostId !== userId) return undefined;
  session.status = 'declined';
  return session;
}

export function deleteDuel(id: string): void {
  sessions.delete(id);
}

/** Nettoie les duels terminés depuis plus de 10 minutes. */
export function purgeExpired(now: number = Date.now()): number {
  let removed = 0;
  for (const [id, session] of sessions) {
    const age = now - session.createdAt;
    if ((session.status !== 'pending' && age > 10 * 60_000) || (session.status === 'pending' && session.expiresAt < now - 60_000)) {
      sessions.delete(id);
      removed += 1;
    }
  }
  return removed;
}

export function duelCount(): number {
  return sessions.size;
}

/** Total des points d'une manche pour un camp (utilisé par les statistiques). */
export function totalScore(session: DuelSession, side: 'host' | 'target'): number {
  return session.history.reduce((sum, round) => sum + round[side], 0);
}
