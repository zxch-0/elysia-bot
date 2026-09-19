import { randomIntSecure } from '../../utils/random';

export const SIZE = 4;
export const CELLS = SIZE * SIZE;
export const MAX_UNDOS = 3;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Snapshot {
  grid: number[];
  score: number;
}

export interface G2048State {
  grid: number[];
  score: number;
  moves: number;
  history: Snapshot[];
  undosLeft: number;
  /** La tuile 2048 a été atteinte (on peut continuer à jouer). */
  reached: boolean;
  over: boolean;
  startedAt: number;
}

export function createGame(): G2048State {
  const grid = Array.from({ length: CELLS }, () => 0);
  addRandomTile(grid);
  addRandomTile(grid);
  return { grid, score: 0, moves: 0, history: [], undosLeft: MAX_UNDOS, reached: false, over: false, startedAt: Date.now() };
}

/** Ajoute un 2 (90 %) ou un 4 (10 %) sur une case vide. */
export function addRandomTile(grid: number[]): boolean {
  const empty: number[] = [];
  grid.forEach((value, index) => {
    if (value === 0) empty.push(index);
  });
  if (empty.length === 0) return false;
  grid[empty[randomIntSecure(empty.length)]] = randomIntSecure(10) === 0 ? 4 : 2;
  return true;
}

/** Glisse et fusionne une ligne vers la gauche. */
export function slideLine(line: number[]): { line: number[]; gained: number } {
  const compact = line.filter((value) => value !== 0);
  const result: number[] = [];
  let gained = 0;
  for (let index = 0; index < compact.length; index += 1) {
    if (index + 1 < compact.length && compact[index] === compact[index + 1]) {
      const merged = compact[index] * 2;
      result.push(merged);
      gained += merged;
      index += 1;
    } else {
      result.push(compact[index]);
    }
  }
  while (result.length < line.length) result.push(0);
  return { line: result, gained };
}

/** Indices de chaque ligne à traiter, ordonnés depuis le bord vers lequel on glisse. */
function lines(direction: Direction): number[][] {
  const result: number[][] = [];
  for (let k = 0; k < SIZE; k += 1) {
    const indices: number[] = [];
    for (let i = 0; i < SIZE; i += 1) {
      if (direction === 'left') indices.push(k * SIZE + i);
      else if (direction === 'right') indices.push(k * SIZE + (SIZE - 1 - i));
      else if (direction === 'up') indices.push(i * SIZE + k);
      else indices.push((SIZE - 1 - i) * SIZE + k);
    }
    result.push(indices);
  }
  return result;
}

/** Applique un mouvement ; retourne `false` si rien ne bouge (coup ignoré). */
export function move(state: G2048State, direction: Direction): boolean {
  if (state.over) return false;
  const next = [...state.grid];
  let gained = 0;
  for (const indices of lines(direction)) {
    const slid = slideLine(indices.map((index) => next[index]));
    indices.forEach((index, position) => {
      next[index] = slid.line[position];
    });
    gained += slid.gained;
  }
  const changed = next.some((value, index) => value !== state.grid[index]);
  if (!changed) return false;

  state.history.push({ grid: [...state.grid], score: state.score });
  if (state.history.length > MAX_UNDOS) state.history.shift();

  state.grid = next;
  state.score += gained;
  state.moves += 1;
  addRandomTile(state.grid);
  if (!state.reached && state.grid.some((value) => value >= 2048)) state.reached = true;
  if (!canMove(state.grid)) state.over = true;
  return true;
}

export function undo(state: G2048State): boolean {
  if (state.undosLeft <= 0 || state.history.length === 0) return false;
  const snapshot = state.history.pop() as Snapshot;
  state.grid = snapshot.grid;
  state.score = snapshot.score;
  state.undosLeft -= 1;
  state.over = false;
  return true;
}

export function canMove(grid: number[]): boolean {
  for (let index = 0; index < CELLS; index += 1) {
    if (grid[index] === 0) return true;
    const col = index % SIZE;
    if (col < SIZE - 1 && grid[index] === grid[index + 1]) return true;
    if (index + SIZE < CELLS && grid[index] === grid[index + SIZE]) return true;
  }
  return false;
}

export function maxTile(grid: number[]): number {
  return grid.reduce((best, value) => Math.max(best, value), 0);
}

/** Grille en art ASCII (bloc de code monospace). */
export function renderGrid(grid: number[]): string {
  const top = `┌${Array.from({ length: SIZE }, () => '──────').join('┬')}┐`;
  const mid = `├${Array.from({ length: SIZE }, () => '──────').join('┼')}┤`;
  const bottom = `└${Array.from({ length: SIZE }, () => '──────').join('┴')}┘`;
  const rows: string[] = [];
  for (let row = 0; row < SIZE; row += 1) {
    const cells = Array.from({ length: SIZE }, (_, col) => {
      const value = grid[row * SIZE + col];
      return value === 0 ? '      ' : `${String(value).padStart(5, ' ')} `;
    });
    rows.push(`│${cells.join('│')}│`);
  }
  return [top, rows.join(`\n${mid}\n`), bottom].join('\n');
}

/** Points de classement selon la meilleure tuile atteinte. */
export function tilePoints(tile: number): number {
  if (tile >= 4096) return 50;
  if (tile >= 2048) return 25;
  if (tile >= 1024) return 12;
  if (tile >= 512) return 6;
  if (tile >= 256) return 3;
  if (tile >= 128) return 1;
  return 0;
}
