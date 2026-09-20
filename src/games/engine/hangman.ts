import { pickOne } from '../../utils/random';
import { HANGMAN_THEMES, HANGMAN_WORDS, normalizeWord, type HangmanTheme } from '../content/words';

export const MAX_ERRORS = 6;

export interface HangmanState {
  theme: HangmanTheme;
  /** Mot affiché à la fin (avec accents). */
  display: string;
  /** Mot normalisé servant aux comparaisons. */
  word: string;
  guessed: string[];
  errors: number;
  /** Lettres trouvées par joueur (mode coopératif). */
  contributions: Record<string, number>;
  /** Joueur ayant trouvé le mot (ou complété la dernière lettre). */
  solvedBy: string | null;
  wrongWords: string[];
}

export type GuessOutcome = 'hit' | 'miss' | 'repeat' | 'invalid';

/** Potence en 7 étapes (0 = vide → 6 = pendu). */
export const GALLOWS: readonly string[] = [
  ['  ┌───┐ ', '  │   │ ', '      │ ', '      │ ', '      │ ', '  ══════'].join('\n'),
  ['  ┌───┐ ', '  │   │ ', '  O   │ ', '      │ ', '      │ ', '  ══════'].join('\n'),
  ['  ┌───┐ ', '  │   │ ', '  O   │ ', '  │   │ ', '      │ ', '  ══════'].join('\n'),
  ['  ┌───┐ ', '  │   │ ', '  O   │ ', ' /│   │ ', '      │ ', '  ══════'].join('\n'),
  ['  ┌───┐ ', '  │   │ ', '  O   │ ', ' /│\\  │ ', '      │ ', '  ══════'].join('\n'),
  ['  ┌───┐ ', '  │   │ ', '  O   │ ', ' /│\\  │ ', ' /    │ ', '  ══════'].join('\n'),
  ['  ┌───┐ ', '  │   │ ', '  O   │ ', ' /│\\  │ ', ' / \\  │ ', '  ══════'].join('\n'),
];

export function pickTheme(theme?: HangmanTheme | 'aleatoire' | null): HangmanTheme {
  if (theme && theme !== 'aleatoire' && theme in HANGMAN_THEMES) return theme;
  return pickOne(Object.keys(HANGMAN_THEMES) as HangmanTheme[]) as HangmanTheme;
}

export function createHangman(theme?: HangmanTheme | 'aleatoire' | null): HangmanState {
  const chosenTheme = pickTheme(theme);
  const display = pickOne(HANGMAN_WORDS[chosenTheme]) as string;
  return {
    theme: chosenTheme,
    display: display.toUpperCase(),
    word: normalizeWord(display),
    guessed: [],
    errors: 0,
    contributions: {},
    solvedBy: null,
    wrongWords: [],
  };
}

/** `P _ N D _` — les lettres non trouvées sont masquées. */
export function maskedWord(state: HangmanState): string {
  return [...state.word].map((letter) => (state.guessed.includes(letter) ? letter : '_')).join(' ');
}

export function isWon(state: HangmanState): boolean {
  return [...state.word].every((letter) => state.guessed.includes(letter));
}

export function isLost(state: HangmanState): boolean {
  return state.errors >= MAX_ERRORS;
}

export function remainingLetters(state: HangmanState): string[] {
  return [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((letter) => !state.guessed.includes(letter));
}

export function guessLetter(state: HangmanState, input: string, userId: string): GuessOutcome {
  const letter = normalizeWord(input).slice(0, 1);
  if (letter.length !== 1) return 'invalid';
  if (state.guessed.includes(letter)) return 'repeat';
  state.guessed.push(letter);
  if (state.word.includes(letter)) {
    state.contributions[userId] = (state.contributions[userId] ?? 0) + 1;
    if (isWon(state)) state.solvedBy = userId;
    return 'hit';
  }
  state.errors += 1;
  return 'miss';
}

/** Proposition du mot entier : une erreur si elle est fausse. */
export function guessWord(state: HangmanState, input: string, userId: string): boolean {
  const attempt = normalizeWord(input);
  if (attempt === state.word) {
    for (const letter of state.word) if (!state.guessed.includes(letter)) state.guessed.push(letter);
    state.solvedBy = userId;
    return true;
  }
  state.errors += 1;
  if (attempt) state.wrongWords.push(attempt);
  return false;
}

export { HANGMAN_THEMES };
export type { HangmanTheme };
