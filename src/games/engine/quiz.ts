import { shuffle } from '../../utils/random';
import { QUIZ_QUESTIONS, QUIZ_THEMES, type QuizQuestion, type QuizTheme } from '../content/questions';

export type QuizDifficulty = 'facile' | 'normal' | 'difficile' | 'mix';

export interface PreparedQuestion {
  theme: QuizTheme;
  difficulty: 1 | 2 | 3;
  question: string;
  /** Réponses mélangées. */
  answers: string[];
  /** Index de la bonne réponse dans `answers`. */
  correct: number;
}

export interface QuizAnswer {
  choice: number;
  /** Temps de réponse en millisecondes depuis l'affichage de la question. */
  elapsedMs: number;
}

export interface QuizState {
  questions: PreparedQuestion[];
  index: number;
  /** Durée d'une question en millisecondes. */
  questionMs: number;
  /** Instant d'affichage de la question courante. */
  askedAt: number;
  /** Réponses à la question courante, par joueur. */
  answers: Record<string, QuizAnswer>;
  /** Scores cumulés et bonnes réponses par joueur. */
  scores: Record<string, { points: number; correct: number; name: string }>;
  phase: 'question' | 'reveal' | 'ended';
  /** Résultat détaillé de la dernière question (affiché pendant la révélation). */
  lastReveal: Array<{ userId: string; correct: boolean; points: number }>;
}

export const POINTS_PER_CORRECT = 10;
export const MAX_SPEED_BONUS = 5;

/** Sélectionne et mélange des questions (thème et difficulté optionnels). */
export function pickQuestions(count: number, theme: QuizTheme | 'mix' = 'mix', difficulty: QuizDifficulty = 'mix'): PreparedQuestion[] {
  const wantedDifficulty = difficulty === 'facile' ? 1 : difficulty === 'normal' ? 2 : difficulty === 'difficile' ? 3 : null;
  let pool = QUIZ_QUESTIONS.filter((question) => theme === 'mix' || question.theme === theme);
  if (wantedDifficulty !== null) {
    const filtered = pool.filter((question) => question.difficulty === wantedDifficulty);
    // Si le filtre laisse trop peu de questions, on complète avec les voisines.
    pool = filtered.length >= count ? filtered : pool.filter((question) => Math.abs(question.difficulty - wantedDifficulty) <= 1);
  }
  return shuffle(pool)
    .slice(0, Math.max(1, Math.min(count, pool.length)))
    .map(prepare);
}

export function prepare(question: QuizQuestion): PreparedQuestion {
  const order = shuffle([0, 1, 2, 3]);
  return {
    theme: question.theme,
    difficulty: question.difficulty,
    question: question.question,
    answers: order.map((index) => question.answers[index]),
    correct: order.indexOf(0),
  };
}

/** Points d'une bonne réponse : base + bonus de rapidité (linéaire). */
export function scoreAnswer(elapsedMs: number, questionMs: number, difficulty: 1 | 2 | 3): number {
  const remaining = Math.max(0, Math.min(1, 1 - elapsedMs / questionMs));
  const base = POINTS_PER_CORRECT + (difficulty - 1) * 2;
  return base + Math.round(remaining * MAX_SPEED_BONUS);
}

export function currentQuestion(state: QuizState): PreparedQuestion | undefined {
  return state.questions[state.index];
}

/** Clôt la question courante : calcule les points et prépare la révélation. */
export function resolveQuestion(state: QuizState): void {
  const question = currentQuestion(state);
  if (!question) return;
  state.lastReveal = Object.entries(state.answers)
    .map(([userId, answer]) => {
      const correct = answer.choice === question.correct;
      const points = correct ? scoreAnswer(answer.elapsedMs, state.questionMs, question.difficulty) : 0;
      const entry = state.scores[userId];
      if (entry) {
        entry.points += points;
        if (correct) entry.correct += 1;
      }
      return { userId, correct, points };
    })
    .sort((a, b) => b.points - a.points);
  state.phase = 'reveal';
}

export function leaderboard(state: QuizState): Array<{ userId: string; points: number; correct: number; name: string }> {
  return Object.entries(state.scores)
    .map(([userId, entry]) => ({ userId, ...entry }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct);
}

export { QUIZ_THEMES };
export type { QuizTheme };
