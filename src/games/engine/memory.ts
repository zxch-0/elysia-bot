import { shuffle } from '../../utils/random';

export const MEMORY_COLS = 5;
export const MEMORY_PAIR_OPTIONS = [6, 8, 10] as const;

const EMOJI_POOL = [
  '🍎', '🍌', '🍇', '🍓', '🍒', '🍍', '🥝', '🍑', '🥕', '🌽', '🍄', '🌵', '🌸', '🌻', '🍀', '🌈', '⭐', '🔥', '❄️', '🌙',
  '🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🦄', '🐙', '🦋', '🐢', '🦀', '🐬', '🦉',
  '⚽', '🏀', '🎲', '🎯', '🎸', '🎺', '🎮', '🚀', '⚓', '🎁',
];

export interface MemoryState {
  pairs: number;
  cards: string[];
  matched: boolean[];
  /** Cartes actuellement retournées (0, 1 ou 2 index). */
  faceUp: number[];
  moves: number;
  /** Paires trouvées par joueur (index 0/1). */
  found: [number, number];
  /** Joueur dont c'est le tour (duel). */
  turn: 0 | 1;
  startedAt: number;
  /** Jeton d'aperçu : invalide les minuteries de retournement obsolètes. */
  peekToken: number;
}

export type FlipOutcome = 'first' | 'match' | 'mismatch' | 'invalid';

export function createMemory(pairs: number): MemoryState {
  const count = MEMORY_PAIR_OPTIONS.includes(pairs as (typeof MEMORY_PAIR_OPTIONS)[number]) ? pairs : 8;
  const symbols = shuffle(EMOJI_POOL).slice(0, count);
  const cards = shuffle([...symbols, ...symbols]);
  return {
    pairs: count,
    cards,
    matched: cards.map(() => false),
    faceUp: [],
    moves: 0,
    found: [0, 0],
    turn: 0,
    startedAt: Date.now(),
    peekToken: 0,
  };
}

/** Cache les deux cartes d'un essai raté (appelé par la minuterie ou au clic suivant). */
export function hideMismatch(state: MemoryState): void {
  if (state.faceUp.length === 2 && state.cards[state.faceUp[0]] !== state.cards[state.faceUp[1]]) state.faceUp = [];
}

export function flip(state: MemoryState, index: number): FlipOutcome {
  if (index < 0 || index >= state.cards.length) return 'invalid';
  if (state.matched[index] || state.faceUp.includes(index)) return 'invalid';

  // Un essai raté est encore visible : on le range avant de continuer.
  if (state.faceUp.length === 2) hideMismatch(state);
  if (state.faceUp.length >= 2) return 'invalid';

  state.faceUp.push(index);
  if (state.faceUp.length === 1) return 'first';

  state.moves += 1;
  const [a, b] = state.faceUp;
  if (state.cards[a] === state.cards[b]) {
    state.matched[a] = true;
    state.matched[b] = true;
    state.faceUp = [];
    state.found[state.turn] += 1;
    return 'match';
  }
  state.peekToken += 1;
  return 'mismatch';
}

export function isComplete(state: MemoryState): boolean {
  return state.matched.every(Boolean);
}

export function nextTurn(state: MemoryState): void {
  state.turn = state.turn === 0 ? 1 : 0;
}

/** Points solo : plus le nombre de coups est proche du minimum (nb de paires), mieux c'est. */
export function soloPoints(state: MemoryState): number {
  const perfect = state.pairs;
  const extra = Math.max(0, state.moves - perfect);
  return Math.max(2, Math.round(perfect * 2.5 - extra));
}
