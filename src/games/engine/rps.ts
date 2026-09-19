import { pickOne } from '../../utils/random';

export type RpsMove = 'pierre' | 'feuille' | 'ciseaux' | 'lezard' | 'spock';
export type RpsVariant = 'classique' | 'lezard-spock';

export const CLASSIC_MOVES: RpsMove[] = ['pierre', 'feuille', 'ciseaux'];
export const EXTENDED_MOVES: RpsMove[] = ['pierre', 'feuille', 'ciseaux', 'lezard', 'spock'];

export const RPS_META: Record<RpsMove, { label: string; emoji: string }> = {
  pierre: { label: 'Pierre', emoji: '🪨' },
  feuille: { label: 'Feuille', emoji: '📄' },
  ciseaux: { label: 'Ciseaux', emoji: '✂️' },
  lezard: { label: 'Lézard', emoji: '🦎' },
  spock: { label: 'Spock', emoji: '🖖' },
};

/** `BEATS[a][b]` = verbe si `a` bat `b`. */
const BEATS: Record<RpsMove, Partial<Record<RpsMove, string>>> = {
  pierre: { ciseaux: 'casse', lezard: 'écrase' },
  feuille: { pierre: 'recouvre', spock: 'réfute' },
  ciseaux: { feuille: 'coupent', lezard: 'décapitent' },
  lezard: { spock: 'empoisonne', feuille: 'mange' },
  spock: { ciseaux: 'casse', pierre: 'vaporise' },
};

export function movesFor(variant: RpsVariant): RpsMove[] {
  return variant === 'lezard-spock' ? EXTENDED_MOVES : CLASSIC_MOVES;
}

export function isValidMove(variant: RpsVariant, move: string): move is RpsMove {
  return (movesFor(variant) as string[]).includes(move);
}

/** 0 = égalité, 1 = `a` gagne, 2 = `b` gagne. */
export function resolveRound(a: RpsMove, b: RpsMove): 0 | 1 | 2 {
  if (a === b) return 0;
  return BEATS[a][b] ? 1 : 2;
}

/** « 🪨 Pierre casse ✂️ Ciseaux ». */
export function describeRound(a: RpsMove, b: RpsMove): string {
  const result = resolveRound(a, b);
  if (result === 0) return `${RPS_META[a].emoji} ${RPS_META[a].label} contre ${RPS_META[b].emoji} ${RPS_META[b].label} : égalité !`;
  const [winner, loser] = result === 1 ? [a, b] : [b, a];
  return `${RPS_META[winner].emoji} ${RPS_META[winner].label} ${BEATS[winner][loser]} ${RPS_META[loser].emoji} ${RPS_META[loser].label}`;
}

export function randomMove(variant: RpsVariant): RpsMove {
  return pickOne(movesFor(variant)) as RpsMove;
}

export interface RpsRound {
  moves: [RpsMove, RpsMove];
  winner: 0 | 1 | 2;
}

export interface RpsState {
  variant: RpsVariant;
  /** Nombre de manches gagnantes nécessaires. */
  target: number;
  rounds: RpsRound[];
  score: [number, number];
  /** Choix en attente pour la manche en cours (index joueur → coup). */
  pending: Partial<Record<0 | 1, RpsMove>>;
  vsBot: boolean;
}

export function createRps(variant: RpsVariant, bestOf: number, vsBot: boolean): RpsState {
  const rounds = Math.max(1, Math.min(9, Math.trunc(bestOf)));
  return { variant, target: Math.floor(rounds / 2) + 1, rounds: [], score: [0, 0], pending: {}, vsBot };
}

/** Enregistre la manche jouée et met à jour le score. */
export function playRound(state: RpsState, a: RpsMove, b: RpsMove): RpsRound {
  const winner = resolveRound(a, b);
  const round: RpsRound = { moves: [a, b], winner };
  state.rounds.push(round);
  if (winner === 1) state.score[0] += 1;
  if (winner === 2) state.score[1] += 1;
  state.pending = {};
  return round;
}

/** Index (0/1) du vainqueur du match, ou null tant qu'il n'est pas décidé. */
export function matchWinner(state: RpsState): 0 | 1 | null {
  if (state.score[0] >= state.target) return 0;
  if (state.score[1] >= state.target) return 1;
  return null;
}
