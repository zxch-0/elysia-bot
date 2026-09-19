import { gameService } from '../services/gameService';
import type { GameDefinition } from './types';
import { blackjackGame } from './ui/blackjack';
import { connectFourGame } from './ui/connectFour';
import { game2048 } from './ui/game2048';
import { hangmanGame } from './ui/hangman';
import { memoryGame } from './ui/memory';
import { minesweeperGame } from './ui/minesweeper';
import { motusGame } from './ui/motus';
import { quizGame } from './ui/quiz';
import { rpsGame } from './ui/rps';
import { ticTacToeGame } from './ui/tictactoe';

/** Toutes les définitions de mini-jeux, dans l'ordre d'affichage du catalogue. */
export const GAME_DEFINITIONS: readonly GameDefinition<any>[] = [
  ticTacToeGame,
  connectFourGame,
  rpsGame,
  memoryGame,
  hangmanGame,
  motusGame,
  quizGame,
  minesweeperGame,
  game2048,
  blackjackGame,
];

let registered = false;

/** Enregistre les jeux auprès du service (idempotent). */
export function registerGames(): void {
  if (registered) return;
  registered = true;
  for (const definition of GAME_DEFINITIONS) gameService.registerDefinition(definition);
}
