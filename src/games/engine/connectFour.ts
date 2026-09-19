import { randomIntSecure } from '../../utils/random';

export const COLS = 7;
export const ROWS = 6;

/** 0 = vide, 1 = 🔴 (joueur 1), 2 = 🟡 (joueur 2). */
export type Disc = 0 | 1 | 2;
export type ConnectFourLevel = 'facile' | 'normal' | 'difficile' | 'expert';

export interface C4Board {
  /** Index = ligne × 7 + colonne, ligne 0 = bas de la grille. */
  cells: Disc[];
  /** Nombre de jetons déjà posés dans chaque colonne. */
  heights: number[];
  moves: number;
}

/** Ordre d'exploration centre → bords (accélère l'élagage alpha-bêta). */
const ORDER = [3, 2, 4, 1, 5, 0, 6] as const;
const WIN_SCORE = 100_000;

const LEVELS: Record<ConnectFourLevel, { depth: number; budgetMs: number; randomness: number }> = {
  facile: { depth: 2, budgetMs: 60, randomness: 0.35 },
  normal: { depth: 4, budgetMs: 150, randomness: 0 },
  difficile: { depth: 7, budgetMs: 320, randomness: 0 },
  expert: { depth: 14, budgetMs: 650, randomness: 0 },
};

/** Les 69 alignements de 4 cases possibles. */
const WINDOWS: number[][] = (() => {
  const windows: number[][] = [];
  const at = (row: number, col: number): number => row * COLS + col;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col + 3 < COLS; col += 1) windows.push([at(row, col), at(row, col + 1), at(row, col + 2), at(row, col + 3)]);
  }
  for (let row = 0; row + 3 < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) windows.push([at(row, col), at(row + 1, col), at(row + 2, col), at(row + 3, col)]);
  }
  for (let row = 0; row + 3 < ROWS; row += 1) {
    for (let col = 0; col + 3 < COLS; col += 1) {
      windows.push([at(row, col), at(row + 1, col + 1), at(row + 2, col + 2), at(row + 3, col + 3)]);
      windows.push([at(row, col + 3), at(row + 1, col + 2), at(row + 2, col + 1), at(row + 3, col)]);
    }
  }
  return windows;
})();

export function createBoard(): C4Board {
  return { cells: Array.from({ length: COLS * ROWS }, () => 0 as Disc), heights: Array.from({ length: COLS }, () => 0), moves: 0 };
}

export function cloneBoard(board: C4Board): C4Board {
  return { cells: [...board.cells], heights: [...board.heights], moves: board.moves };
}

export function canPlay(board: C4Board, col: number): boolean {
  return col >= 0 && col < COLS && board.heights[col] < ROWS;
}

export function isFull(board: C4Board): boolean {
  return board.moves >= COLS * ROWS;
}

/** Pose un jeton et retourne la ligne occupée. */
export function play(board: C4Board, col: number, disc: 1 | 2): number {
  if (!canPlay(board, col)) throw new Error(`Colonne ${col + 1} pleine ou invalide`);
  const row = board.heights[col];
  board.cells[row * COLS + col] = disc;
  board.heights[col] += 1;
  board.moves += 1;
  return row;
}

export function undo(board: C4Board, col: number): void {
  board.heights[col] -= 1;
  board.cells[board.heights[col] * COLS + col] = 0;
  board.moves -= 1;
}

/** Alignement gagnant passant par (row, col), ou null. */
export function winningLine(board: C4Board, row: number, col: number): number[] | null {
  const disc = board.cells[row * COLS + col];
  if (disc === 0) return null;
  const directions: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of directions) {
    const line = [row * COLS + col];
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board.cells[r * COLS + c] === disc) {
        line.push(r * COLS + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

/** Vrai si jouer `col` fait gagner `disc` immédiatement. */
export function wouldWin(board: C4Board, col: number, disc: 1 | 2): boolean {
  if (!canPlay(board, col)) return false;
  const row = play(board, col, disc);
  const won = winningLine(board, row, col) !== null;
  undo(board, col);
  return won;
}

/** Heuristique classique : fenêtres de 4 pondérées + bonus colonne centrale. */
export function evaluate(board: C4Board, disc: 1 | 2): number {
  const other = disc === 1 ? 2 : 1;
  let score = 0;
  for (let row = 0; row < ROWS; row += 1) {
    const cell = board.cells[row * COLS + 3];
    if (cell === disc) score += 3;
    else if (cell === other) score -= 3;
  }
  for (const window of WINDOWS) {
    let mine = 0;
    let theirs = 0;
    for (const index of window) {
      const cell = board.cells[index];
      if (cell === disc) mine += 1;
      else if (cell === other) theirs += 1;
    }
    const empty = 4 - mine - theirs;
    if (mine === 4) score += 1_000;
    else if (mine === 3 && empty === 1) score += 5;
    else if (mine === 2 && empty === 2) score += 2;
    if (theirs === 4) score -= 1_000;
    else if (theirs === 3 && empty === 1) score -= 4;
    else if (theirs === 2 && empty === 2) score -= 1;
  }
  return score;
}

interface SearchContext {
  nodes: number;
  deadline: number;
  aborted: boolean;
}

/** Negamax alpha-bêta : score du point de vue du joueur `disc` qui doit jouer. */
function negamax(board: C4Board, depth: number, alpha: number, beta: number, disc: 1 | 2, ctx: SearchContext): number {
  ctx.nodes += 1;
  if ((ctx.nodes & 2047) === 0 && Date.now() > ctx.deadline) {
    ctx.aborted = true;
    return 0;
  }
  if (isFull(board)) return 0;

  // Victoire immédiate : inutile de descendre plus bas.
  for (const col of ORDER) {
    if (wouldWin(board, col, disc)) return WIN_SCORE + (COLS * ROWS - board.moves);
  }
  if (depth <= 0) return evaluate(board, disc);

  const other: 1 | 2 = disc === 1 ? 2 : 1;
  let best = -Infinity;
  for (const col of ORDER) {
    if (!canPlay(board, col)) continue;
    play(board, col, disc);
    const score = -negamax(board, depth - 1, -beta, -alpha, other, ctx);
    undo(board, col);
    if (ctx.aborted) return 0;
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export interface AiMove {
  column: number;
  depth: number;
  nodes: number;
  /** Score estimé (positif = avantage IA). */
  score: number;
}

/**
 * Meilleur coup pour `disc` : victoire immédiate, blocage obligatoire, puis
 * approfondissement itératif borné dans le temps (l'interaction Discord doit
 * être acquittée en moins de 3 secondes).
 */
export function bestMove(board: C4Board, disc: 1 | 2, level: ConnectFourLevel): AiMove {
  const legal = ORDER.filter((col) => canPlay(board, col));
  if (legal.length === 0) throw new Error('Grille pleine');
  const other: 1 | 2 = disc === 1 ? 2 : 1;
  const config = LEVELS[level];

  for (const col of legal) if (wouldWin(board, col, disc)) return { column: col, depth: 0, nodes: 0, score: WIN_SCORE };

  const threats = legal.filter((col) => wouldWin(board, col, other));
  if (config.randomness > 0 && randomIntSecure(1_000) < config.randomness * 1_000) {
    return { column: legal[randomIntSecure(legal.length)], depth: 0, nodes: 0, score: 0 };
  }
  if (threats.length >= 1) return { column: threats[0], depth: 0, nodes: 0, score: 0 };

  const work = cloneBoard(board);
  const deadline = Date.now() + config.budgetMs;
  let bestColumn = legal[0];
  let bestScore = -Infinity;
  let reachedDepth = 0;
  let totalNodes = 0;

  for (let depth = 1; depth <= config.depth; depth += 1) {
    const ctx: SearchContext = { nodes: 0, deadline, aborted: false };
    let alpha = -Infinity;
    let column = legal[0];
    let score = -Infinity;
    for (const col of legal) {
      play(work, col, disc);
      const value = -negamax(work, depth - 1, -Infinity, -alpha, other, ctx);
      undo(work, col);
      if (ctx.aborted) break;
      if (value > score) {
        score = value;
        column = col;
      }
      if (score > alpha) alpha = score;
    }
    totalNodes += ctx.nodes;
    if (ctx.aborted) break;
    bestColumn = column;
    bestScore = score;
    reachedDepth = depth;
    // Victoire (ou défaite) forcée trouvée : inutile de chercher plus loin.
    if (Math.abs(score) >= WIN_SCORE) break;
  }

  return { column: bestColumn, depth: reachedDepth, nodes: totalNodes, score: bestScore };
}
