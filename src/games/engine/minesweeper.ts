import { shuffle } from '../../utils/random';

export const MS_COLS = 5;
export const MS_ROWS = 4;
export const MS_CELLS = MS_COLS * MS_ROWS;
export const MS_MIN_MINES = 2;
export const MS_MAX_MINES = 8;

export interface MinesweeperState {
  mines: number;
  /** Positions des mines — placées au premier clic (jamais sur la case cliquée). */
  mineCells: boolean[] | null;
  revealed: boolean[];
  flagged: boolean[];
  flagMode: boolean;
  exploded: number | null;
  startedAt: number | null;
  moves: number;
}

export type RevealOutcome = 'revealed' | 'mine' | 'noop';

export function createMinesweeper(mines: number): MinesweeperState {
  const count = Math.min(MS_MAX_MINES, Math.max(MS_MIN_MINES, Math.trunc(mines)));
  return {
    mines: count,
    mineCells: null,
    revealed: Array.from({ length: MS_CELLS }, () => false),
    flagged: Array.from({ length: MS_CELLS }, () => false),
    flagMode: false,
    exploded: null,
    startedAt: null,
    moves: 0,
  };
}

export function neighbours(index: number): number[] {
  const row = Math.floor(index / MS_COLS);
  const col = index % MS_COLS;
  const result: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < MS_ROWS && c >= 0 && c < MS_COLS) result.push(r * MS_COLS + c);
    }
  }
  return result;
}

/** Place les mines en évitant la première case cliquée et, si possible, ses voisines. */
export function placeMines(state: MinesweeperState, safeIndex: number): void {
  const protectedCells = new Set<number>([safeIndex, ...neighbours(safeIndex)]);
  let candidates = Array.from({ length: MS_CELLS }, (_, index) => index).filter((index) => !protectedCells.has(index));
  if (candidates.length < state.mines) {
    candidates = Array.from({ length: MS_CELLS }, (_, index) => index).filter((index) => index !== safeIndex);
  }
  const chosen = new Set(shuffle(candidates).slice(0, state.mines));
  state.mineCells = Array.from({ length: MS_CELLS }, (_, index) => chosen.has(index));
  state.startedAt = Date.now();
}

export function adjacentMines(state: MinesweeperState, index: number): number {
  if (!state.mineCells) return 0;
  return neighbours(index).filter((neighbour) => state.mineCells![neighbour]).length;
}

/** Révèle une case (avec propagation sur les zéros). */
export function reveal(state: MinesweeperState, index: number): RevealOutcome {
  if (index < 0 || index >= MS_CELLS) return 'noop';
  if (state.revealed[index] || state.flagged[index] || state.exploded !== null) return 'noop';
  if (!state.mineCells) placeMines(state, index);
  state.moves += 1;

  if (state.mineCells![index]) {
    state.exploded = index;
    state.revealed[index] = true;
    return 'mine';
  }

  const stack = [index];
  while (stack.length > 0) {
    const current = stack.pop() as number;
    if (state.revealed[current]) continue;
    state.revealed[current] = true;
    state.flagged[current] = false;
    if (adjacentMines(state, current) === 0) {
      for (const neighbour of neighbours(current)) {
        if (!state.revealed[neighbour] && !state.mineCells![neighbour]) stack.push(neighbour);
      }
    }
  }
  return 'revealed';
}

export function toggleFlag(state: MinesweeperState, index: number): boolean {
  if (index < 0 || index >= MS_CELLS || state.revealed[index] || state.exploded !== null) return false;
  state.flagged[index] = !state.flagged[index];
  return true;
}

export function isWon(state: MinesweeperState): boolean {
  if (!state.mineCells || state.exploded !== null) return false;
  for (let index = 0; index < MS_CELLS; index += 1) {
    if (!state.mineCells[index] && !state.revealed[index]) return false;
  }
  return true;
}

export function flagsPlaced(state: MinesweeperState): number {
  return state.flagged.filter(Boolean).length;
}
