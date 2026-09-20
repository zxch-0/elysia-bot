import { pickOne } from '../../utils/random';
import { MOTUS_WORDS, normalizeWord } from '../content/words';

export const MOTUS_LENGTH = 5;
export const MOTUS_MAX_ATTEMPTS = 6;

export type LetterState = 'correct' | 'present' | 'absent';

export interface MotusAttempt {
  word: string;
  states: LetterState[];
}

export interface MotusState {
  target: string;
  attempts: MotusAttempt[];
  startedAt: number;
}

export function createMotus(): MotusState {
  return { target: pickOne(MOTUS_WORDS) as string, attempts: [], startedAt: Date.now() };
}

/** Vrai si la proposition est un mot de 5 lettres (A–Z après normalisation). */
export function normalizeGuess(input: string): string | null {
  const word = normalizeWord(input);
  return word.length === MOTUS_LENGTH ? word : null;
}

/**
 * Évaluation d'une proposition (algorithme en deux passes, correct avec les
 * lettres répétées : chaque lettre de la cible n'est « consommée » qu'une fois).
 */
export function scoreGuess(target: string, guess: string): LetterState[] {
  const states: LetterState[] = Array.from({ length: guess.length }, () => 'absent');
  const remaining = new Map<string, number>();

  for (let index = 0; index < guess.length; index += 1) {
    if (guess[index] === target[index]) states[index] = 'correct';
    else remaining.set(target[index], (remaining.get(target[index]) ?? 0) + 1);
  }
  for (let index = 0; index < guess.length; index += 1) {
    if (states[index] === 'correct') continue;
    const left = remaining.get(guess[index]) ?? 0;
    if (left > 0) {
      states[index] = 'present';
      remaining.set(guess[index], left - 1);
    }
  }
  return states;
}

export function submitGuess(state: MotusState, guess: string): MotusAttempt {
  const attempt = { word: guess, states: scoreGuess(state.target, guess) };
  state.attempts.push(attempt);
  return attempt;
}

export function isSolved(state: MotusState): boolean {
  const last = state.attempts[state.attempts.length - 1];
  return Boolean(last && last.word === state.target);
}

export function isExhausted(state: MotusState): boolean {
  return state.attempts.length >= MOTUS_MAX_ATTEMPTS && !isSolved(state);
}

/** Meilleur état connu de chaque lettre (correct > present > absent). */
export function keyboardState(state: MotusState): Record<string, LetterState> {
  const rank: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };
  const known: Record<string, LetterState> = {};
  for (const attempt of state.attempts) {
    attempt.states.forEach((letterState, index) => {
      const letter = attempt.word[index];
      if (!known[letter] || rank[letterState] > rank[known[letter]]) known[letter] = letterState;
    });
  }
  return known;
}

export const LETTER_EMOJI: Record<LetterState, string> = { correct: '🟩', present: '🟨', absent: '⬛' };
