import { BotError } from '../../core/errors';
import type { ComponentMessage } from '../../core/types';
import { gameService } from '../../services/gameService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows, type ButtonSpec } from '../../ui/components';
import { timestampTag } from '../../utils/duration';
import {
  QUIZ_THEMES,
  currentQuestion,
  leaderboard,
  pickQuestions,
  resolveQuestion,
  type QuizDifficulty,
  type QuizState,
  type QuizTheme,
} from '../engine/quiz';
import type { GameDefinition, GamePlayer, GameSession } from '../types';
import { MEDALS, canRematch, cid, deny, endRows, linkRematch, mention, rememberMessage, whisper, updateGame } from './common';

export interface QuizSessionState extends QuizState {
  theme: QuizTheme | 'mix';
  difficulty: QuizDifficulty;
  requested: number;
  /** Instant de fin de la question courante (affichage du compte à rebours). */
  deadline: number;
  /** Instant d'affichage de la prochaine question (phase de révélation). */
  nextAt: number;
  /** Un rafraîchissement du compteur de réponses est déjà programmé. */
  refreshPending: boolean;
}

const LETTERS = ['🇦', '🇧', '🇨', '🇩'] as const;
const REVEAL_MS = 6_000;
/** Délai de regroupement des rafraîchissements du compteur de réponses (anti rate-limit). */
const ANSWER_REFRESH_MS = 2_000;
const RULES = 'Tout le monde peut répondre : bonne réponse = 10 points (+ bonus de rapidité, + difficulté).';

function difficultyStars(level: 1 | 2 | 3): string {
  return '⭐'.repeat(level);
}

/** Liste de noms bornée (« A, B, C et 12 autres ») pour rester sous les limites d'un embed. */
function nameList(items: string[], limit = 12): string {
  if (items.length <= limit) return items.join(', ');
  return `${items.slice(0, limit).join(', ')} et ${items.length - limit} autre(s)`;
}

function scoreboard(state: QuizSessionState, limit = 5): string {
  const ranking = leaderboard(state).slice(0, limit);
  if (ranking.length === 0) return '*Aucun point marqué pour le moment.*';
  return ranking.map((entry, index) => `${MEDALS[index] ?? `**${index + 1}.**`} ${mention(entry.userId)} — **${entry.points}** pts (${entry.correct} ✅)`).join('\n');
}

function render(session: GameSession<QuizSessionState>, options: { disabled?: boolean } = {}): ComponentMessage {
  const { state } = session;
  const question = currentQuestion(state);
  const finished = session.status === 'finished' || state.phase === 'ended';
  const themeLabel = state.theme === 'mix' ? '🎲 Thèmes mélangés' : `${QUIZ_THEMES[state.theme].emoji} ${QUIZ_THEMES[state.theme].label}`;

  if (finished || !question) {
    const ranking = leaderboard(state);
    const embed = baseEmbed({
      title: '🧠 Quiz — résultats',
      description: [
        `${themeLabel} • ${state.questions.length} question(s) • hôte ${mention(session.hostId)}`,
        '',
        session.outcome ?? '🏁 Quiz terminé.',
        '',
        ranking.length ? scoreboard(state, 10) : '*Personne n’a marqué de point… c’était difficile ?*',
      ].join('\n'),
      color: THEME.colors.success,
      footer: `Elysia • mini-jeux • ${ranking.length} participant(s)`,
    });
    return { embeds: [embed], components: options.disabled ? [] : endRows(session, { rematchLabel: 'Rejouer (mêmes réglages)' }) };
  }

  const answered = Object.keys(state.answers).length;
  const header = `${themeLabel} • ${QUIZ_THEMES[question.theme].emoji} ${QUIZ_THEMES[question.theme].label} • ${difficultyStars(question.difficulty)}`;

  if (state.phase === 'reveal') {
    const correctLine = `✅ **Réponse : ${LETTERS[question.correct]} ${question.answers[question.correct]}**`;
    const winners = state.lastReveal.filter((entry) => entry.correct);
    const losers = state.lastReveal.filter((entry) => !entry.correct);
    const embed = baseEmbed({
      title: `🧠 Quiz — question ${state.index + 1}/${state.questions.length}`,
      description: [
        header,
        '',
        `**${question.question}**`,
        '',
        correctLine,
        winners.length
          ? `🎯 ${nameList(winners.map((entry) => `${mention(entry.userId)} (+${entry.points})`))}`
          : '😶 Personne n’a trouvé la bonne réponse.',
        losers.length ? `❌ ${nameList(losers.map((entry) => mention(entry.userId)))}` : '',
        '',
        `🏆 **Classement**\n${scoreboard(state)}`,
        '',
        state.index + 1 < state.questions.length
          ? `⏭️ Prochaine question ${timestampTag(state.nextAt, 'R')}…`
          : `🏁 Résultats finaux ${timestampTag(state.nextAt, 'R')}…`,
      ]
        .filter((line) => line !== '')
        .join('\n'),
      color: THEME.colors.info,
      footer: `Elysia • mini-jeux • ${RULES}`,
    });
    return { embeds: [embed], components: [] };
  }

  const embed = baseEmbed({
    title: `🧠 Quiz — question ${state.index + 1}/${state.questions.length}`,
    description: [
      header,
      `⏱️ Fin de la question ${timestampTag(state.deadline, 'R')}`,
      '',
      `**${question.question}**`,
      '',
      ...question.answers.map((answer, index) => `${LETTERS[index]} ${answer}`),
      '',
      `📝 ${answered} réponse(s) enregistrée(s)`,
      '',
      `🏆 **Classement**\n${scoreboard(state)}`,
    ].join('\n'),
    color: THEME.colors.primary,
    footer: `Elysia • mini-jeux • ${RULES}`,
  });

  if (options.disabled) return { embeds: [embed], components: [] };
  const answers: ButtonSpec[] = question.answers.map((_, index) => ({
    id: cid(session, 'a', state.index, index),
    emoji: LETTERS[index],
    style: 'primary',
  }));
  const rows = [
    ...buttonRows(answers),
    ...buttonRows([
      { id: cid(session, 'skip'), label: 'Passer (hôte)', emoji: '⏭️', style: 'secondary' },
      { id: cid(session, 'stop'), label: 'Arrêter (hôte)', emoji: '🛑', style: 'danger' },
    ]),
  ];
  return { embeds: [embed], components: rows };
}

function recordResults(session: GameSession<QuizSessionState>): void {
  const ranking = leaderboard(session.state);
  const top = ranking[0]?.points ?? 0;
  ranking.forEach((entry) => {
    // Seul : pas de vainqueur ; à plusieurs : les ex æquo en tête gagnent tous.
    const result = ranking.length >= 2 ? (entry.points === top && top > 0 ? 'win' : 'loss') : 'draw';
    gameService.record({
      guildId: session.guildId,
      userId: entry.userId,
      tag: entry.name,
      game: 'quiz',
      result,
      points: Math.round(entry.points / 2),
      best: entry.points,
      betterIf: 'higher',
    });
  });
}

function finishQuiz(session: GameSession<QuizSessionState>, reason: string): void {
  const { state } = session;
  state.phase = 'ended';
  const ranking = leaderboard(state);
  const top = ranking[0]?.points ?? 0;
  let winnerLine = '';
  if (ranking.length > 0 && top === 0) {
    winnerLine = '😶 Personne n’a marqué le moindre point !';
  } else if (ranking.length >= 2 && ranking[1].points === top) {
    const tied = ranking.filter((entry) => entry.points === top).map((entry) => mention(entry.userId));
    winnerLine = `🤝 Égalité en tête (${top} pts) entre ${nameList(tied, 8)} !`;
  } else if (ranking.length > 0) {
    winnerLine = `🏆 ${mention(ranking[0].userId)} remporte le quiz avec **${top}** points !`;
  }
  gameService.finish(session, [reason, winnerLine].filter(Boolean).join('\n'));
  recordResults(session);
}

/** Met à jour le compteur « N réponse(s) » du message, au plus une fois toutes les 2 s. */
function scheduleAnswerRefresh(session: GameSession<QuizSessionState>): void {
  const { state } = session;
  if (state.refreshPending) return;
  state.refreshPending = true;
  const index = state.index;
  gameService.schedule(session, ANSWER_REFRESH_MS, async () => {
    state.refreshPending = false;
    if (session.status !== 'playing' || state.phase !== 'question' || state.index !== index) return;
    await gameService.refreshMessage(session);
  });
}

function askQuestion(session: GameSession<QuizSessionState>): void {
  const { state } = session;
  state.phase = 'question';
  state.answers = {};
  state.lastReveal = [];
  state.refreshPending = false;
  state.askedAt = Date.now();
  state.deadline = state.askedAt + state.questionMs;
  gameService.touch(session);
  const expectedIndex = state.index;
  gameService.schedule(session, state.questionMs, () => endQuestion(session, expectedIndex));
}

async function endQuestion(session: GameSession<QuizSessionState>, expectedIndex: number): Promise<void> {
  const { state } = session;
  if (session.status !== 'playing' || state.phase !== 'question' || state.index !== expectedIndex) return;
  resolveQuestion(state);
  state.nextAt = Date.now() + REVEAL_MS;
  gameService.touch(session);
  await gameService.refreshMessage(session);
  gameService.schedule(session, REVEAL_MS, () => advance(session, expectedIndex));
}

async function advance(session: GameSession<QuizSessionState>, fromIndex: number): Promise<void> {
  const { state } = session;
  if (session.status !== 'playing' || state.phase !== 'reveal' || state.index !== fromIndex) return;
  if (state.index + 1 >= state.questions.length) {
    finishQuiz(session, `🏁 Quiz terminé — ${state.questions.length} question(s) posée(s).`);
  } else {
    state.index += 1;
    askQuestion(session);
  }
  await gameService.refreshMessage(session);
}

export interface QuizParams {
  guildId: string;
  channelId: string;
  host: GamePlayer;
  theme?: QuizTheme | 'mix';
  difficulty?: QuizDifficulty;
  count?: number;
  secondsPerQuestion?: number;
}

export function createQuizSession(params: QuizParams): GameSession<QuizSessionState> {
  const count = Math.max(3, Math.min(20, params.count ?? 5));
  const questionMs = Math.max(10, Math.min(60, params.secondsPerQuestion ?? 20)) * 1_000;
  const questions = pickQuestions(count, params.theme ?? 'mix', params.difficulty ?? 'mix');
  if (questions.length === 0) throw new BotError('Aucune question ne correspond à ces réglages. Essayez un autre thème ou la difficulté « mixte ».');
  const state: QuizSessionState = {
    questions,
    index: 0,
    questionMs,
    askedAt: Date.now(),
    answers: {},
    scores: {},
    phase: 'question',
    lastReveal: [],
    theme: params.theme ?? 'mix',
    difficulty: params.difficulty ?? 'mix',
    requested: count,
    deadline: Date.now() + questionMs,
    nextAt: 0,
    refreshPending: false,
  };
  const session = gameService.createSession<QuizSessionState>({
    game: 'quiz',
    guildId: params.guildId,
    channelId: params.channelId,
    host: params.host,
    state,
    idleTimeoutMs: 30 * 60_000,
  });
  askQuestion(session);
  return session;
}

export const quizGame: GameDefinition<QuizSessionState> = {
  id: 'quiz',
  label: 'Quiz',
  emoji: '🧠',
  description: 'Quiz multijoueur chronométré : 7 thèmes, bonus de rapidité, podium final.',
  idleTimeoutMs: 30 * 60_000,
  render,

  async handle(interaction, session, args) {
    const [action, rawIndex, rawChoice] = args;
    const { state } = session;
    const isHost = interaction.user.id === session.hostId;

    if (action === 'rematch') {
      if (!(await canRematch(interaction, session, false))) return;
      if (!isHost) return deny(interaction, 'Seul l’hôte peut relancer ce quiz. Lancez le vôtre avec `/jeu quiz` !');
      const fresh = createQuizSession({
        guildId: session.guildId,
        channelId: session.channelId,
        host: session.players[0],
        theme: state.theme,
        difficulty: state.difficulty,
        count: state.requested,
        secondsPerQuestion: state.questionMs / 1_000,
      });
      linkRematch(session, fresh, interaction);
      await updateGame(interaction, render(fresh));
      return;
    }

    if (session.status === 'finished') return deny(interaction, 'Ce quiz est terminé.');
    rememberMessage(session, interaction);

    if (action === 'stop') {
      if (!isHost) return deny(interaction, 'Seul l’hôte peut arrêter le quiz.');
      finishQuiz(session, `🛑 Quiz arrêté par ${mention(session.hostId)} après ${state.index + (state.phase === 'reveal' ? 1 : 0)} question(s).`);
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'skip') {
      if (!isHost) return deny(interaction, 'Seul l’hôte peut passer une question.');
      if (state.phase !== 'question') return deny(interaction, 'La question est déjà en cours de révélation.');
      resolveQuestion(state);
      state.nextAt = Date.now() + REVEAL_MS;
      gameService.touch(session);
      const index = state.index;
      gameService.schedule(session, REVEAL_MS, () => advance(session, index));
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'a') {
      if (interaction.user.bot) return deny(interaction, 'Les bots ne participent pas au quiz.');
      const questionIndex = Number.parseInt(rawIndex ?? '', 10);
      const choice = Number.parseInt(rawChoice ?? '', 10);
      if (state.phase !== 'question' || questionIndex !== state.index) {
        // Le message affiché est en retard (rafraîchissement raté ou clic tardif) :
        // on le remet à jour avant d'expliquer le refus.
        await updateGame(interaction, render(session));
        await deny(interaction, 'Trop tard, cette question est close !', '⏱️ Question close');
        return;
      }
      if (!Number.isInteger(choice) || choice < 0 || choice > 3) return deny(interaction, 'Réponse invalide.');

      const previous = state.answers[interaction.user.id];
      state.answers[interaction.user.id] = { choice, elapsedMs: Math.max(0, Date.now() - state.askedAt) };
      state.scores[interaction.user.id] ??= { points: 0, correct: 0, name: interaction.user.username };
      if (!previous) scheduleAnswerRefresh(session);
      const question = currentQuestion(state);
      await whisper(
        interaction,
        baseEmbed({
          title: previous ? '🔁 Réponse modifiée' : '📝 Réponse enregistrée',
          description: `${LETTERS[choice]} **${question?.answers[choice] ?? '?'}**\nVous pouvez encore changer d’avis jusqu’à la fin du temps ${timestampTag(state.deadline, 'R')}.`,
          color: THEME.colors.info,
        }),
      );
      return;
    }

    await deny(interaction, 'Action inconnue.');
  },

  onExpire(session) {
    if (session.status !== 'playing') return;
    finishQuiz(session, '⌛ Quiz interrompu (inactivité prolongée).');
  },
};
