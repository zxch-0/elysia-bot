import { pickOne } from '../../utils/random';

/** 0 = vide, 1 = ❌ (joueur 1), 2 = ⭕ (joueur 2). */
export type Mark = 0 | 1 | 2;
export type Board = Mark[];
export type TicTacToeLevel = 'facile' | 'normal' | 'imbattable';

export const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function createBoard(): Board {
  return Array.from({ length: 9 }, () => 0 as Mark);
}

export function opponentOf(mark: 1 | 2): 1 | 2 {
  return mark === 1 ? 2 : 1;
}

/** Ligne gagnante éventuelle. */
export function findWinner(board: Board): { mark: 1 | 2; line: readonly [number, number, number] } | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] !== 0 && board[a] === board[b] && board[a] === board[c]) return { mark: board[a] as 1 | 2, line };
  }
  return null;
}

export function isFull(board: Board): boolean {
  return board.every((cell) => cell !== 0);
}

export function availableMoves(board: Board): number[] {
  const moves: number[] = [];
  for (let index = 0; index < board.length; index += 1) if (board[index] === 0) moves.push(index);
  return moves;
}

/**
 * Minimax complet (l'arbre du morpion est minuscule : ≤ 9! positions).
 * Les victoires rapides sont préférées et les défaites retardées.
 */
export function minimax(board: Board, current: 1 | 2, me: 1 | 2, depth = 0): number {
  const winner = findWinner(board);
  if (winner) return winner.mark === me ? 10 - depth : depth - 10;
  if (isFull(board)) return 0;

  const maximizing = current === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of availableMoves(board)) {
    board[move] = current;
    const score = minimax(board, opponentOf(current), me, depth + 1);
    board[move] = 0;
    best = maximizing ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

/** Coup gagnant immédiat pour `mark`, s'il existe. */
export function immediateWin(board: Board, mark: 1 | 2): number | null {
  for (const move of availableMoves(board)) {
    board[move] = mark;
    const won = findWinner(board)?.mark === mark;
    board[move] = 0;
    if (won) return move;
  }
  return null;
}

/** Meilleur coup pour `mark` selon le niveau demandé. */
export function bestMove(board: Board, mark: 1 | 2, level: TicTacToeLevel): number {
  const moves = availableMoves(board);
  if (moves.length === 0) throw new Error('Aucun coup disponible');

  if (level === 'facile') return pickOne(moves) as number;

  if (level === 'normal') {
    // Gagne si possible, bloque sinon, joue au hasard le reste du temps.
    const win = immediateWin(board, mark);
    if (win !== null) return win;
    const block = immediateWin(board, opponentOf(mark));
    if (block !== null) return block;
    return pickOne(moves) as number;
  }

  let bestScore = -Infinity;
  let candidates: number[] = [];
  for (const move of moves) {
    board[move] = mark;
    const score = minimax(board, opponentOf(mark), mark, 1);
    board[move] = 0;
    if (score > bestScore) {
      bestScore = score;
      candidates = [move];
    } else if (score === bestScore) {
      candidates.push(move);
    }
  }
  return pickOne(candidates) as number;
}
