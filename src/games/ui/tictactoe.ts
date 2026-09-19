import type { ComponentMessage } from '../../core/types';
import { gameService } from '../../services/gameService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows, type ButtonSpec } from '../../ui/components';
import {
  availableMoves,
  bestMove,
  createBoard,
  findWinner,
  isFull,
  type Board,
  type TicTacToeLevel,
} from '../engine/tictactoe';
import { randomIntSecure } from '../../utils/random';
import type { GameDefinition, GamePlayer, GameSession } from '../types';
import {
  AI_LEVEL_LABEL,
  AI_PLAYER,
  LOBBY_TIMEOUT_MS,
  cid,
  deny,
  endRows,
  handleLobbyAction,
  isAi,
  isPlayer,
  lobbyPayload,
  mention,
  quitButton,
  rememberMessage,
  sessionFooterLine,
  updateGame,
} from './common';

export interface TicTacToeState {
  started: boolean;
  board: Board;
  /** Index du joueur (0 = ❌, 1 = ⭕) qui doit jouer. */
  turn: 0 | 1;
  starter: 0 | 1;
  level: TicTacToeLevel | null;
  winner: 0 | 1 | null;
  draw: boolean;
  line: readonly number[] | null;
  lastMove: number | null;
}

const MARK_EMOJI = ['❌', '⭕'] as const;
const RULES = 'Alignez trois symboles (ligne, colonne ou diagonale) avant votre adversaire.';

function points(state: TicTacToeState, result: 'win' | 'draw', vsAi: boolean): number {
  if (!vsAi) return result === 'win' ? 10 : 3;
  if (result === 'draw') return state.level === 'imbattable' ? 4 : 1;
  return state.level === 'facile' ? 3 : state.level === 'normal' ? 6 : 15;
}

function recordOutcome(session: GameSession<TicTacToeState>): void {
  const { state } = session;
  const vsAi = isAi(session.players[1]);
  session.players.forEach((player, index) => {
    if (isAi(player)) return;
    const result = state.draw ? 'draw' : state.winner === index ? 'win' : 'loss';
    gameService.record({
      guildId: session.guildId,
      userId: player.id,
      tag: player.name,
      game: 'morpion',
      result,
      points: result === 'loss' ? 0 : points(state, result, vsAi),
    });
  });
}

function applyMove(session: GameSession<TicTacToeState>, index: number): void {
  const { state } = session;
  state.board[index] = state.turn === 0 ? 1 : 2;
  state.lastMove = index;
  const winner = findWinner(state.board);
  if (winner) {
    state.winner = state.turn;
    state.line = winner.line;
    return;
  }
  if (isFull(state.board)) {
    state.draw = true;
    return;
  }
  state.turn = state.turn === 0 ? 1 : 0;
}

function concludeIfOver(session: GameSession<TicTacToeState>): boolean {
  const { state } = session;
  if (state.winner === null && !state.draw) return false;
  const outcome = state.draw
    ? '🤝 Match nul ! Personne n’a réussi à aligner trois symboles.'
    : `🏆 ${MARK_EMOJI[state.winner!]} ${mention(session.players[state.winner!])} remporte la partie !`;
  gameService.finish(session, outcome);
  recordOutcome(session);
  return true;
}

function render(session: GameSession<TicTacToeState>, options: { disabled?: boolean } = {}): ComponentMessage {
  const { state } = session;
  if (!state.started) {
    return lobbyPayload(session, ticTacToeGame, { rules: RULES, details: ['❌ joue en premier, ⭕ en second — un tirage décide qui commence.'] });
  }

  const [first, second] = session.players;
  const finished = session.status === 'finished';
  const lines = [
    `❌ ${mention(first)}  •  ⭕ ${mention(second)}${state.level ? `  *(IA ${AI_LEVEL_LABEL[state.level]})*` : ''}`,
    '',
    finished
      ? (session.outcome ?? 'Partie terminée.')
      : `➜ Au tour de ${MARK_EMOJI[state.turn]} ${mention(session.players[state.turn])}`,
    '',
    sessionFooterLine(session),
  ];

  const embed = baseEmbed({
    title: '⭕ Morpion',
    description: lines.join('\n'),
    color: finished ? (state.draw ? THEME.colors.neutral : THEME.colors.success) : THEME.colors.primary,
    footer: `Elysia • mini-jeux • ${RULES}`,
  });

  const cells: ButtonSpec[] = state.board.map((mark, index) => {
    const onLine = state.line?.includes(index) ?? false;
    return {
      id: cid(session, 'cell', index),
      emoji: mark === 0 ? '⬜' : MARK_EMOJI[mark - 1],
      style: onLine ? 'success' : mark === 1 ? 'danger' : mark === 2 ? 'primary' : 'secondary',
      disabled: options.disabled || finished || mark !== 0,
    };
  });
  const rows = [
    ...buttonRows(cells.slice(0, 3)),
    ...buttonRows(cells.slice(3, 6)),
    ...buttonRows(cells.slice(6, 9)),
  ];
  if (!options.disabled) {
    if (finished) rows.push(...endRows(session, { rematchLabel: 'Revanche' }));
    else rows.push(...buttonRows([quitButton(session)]));
  }
  return { embeds: [embed], components: rows };
}

function beginGame(session: GameSession<TicTacToeState>): void {
  const { state } = session;
  state.started = true;
  state.turn = state.starter;
  // L'IA commence si le tirage l'a désignée.
  if (isAi(session.players[state.turn])) applyMove(session, bestMove(state.board, state.turn === 0 ? 1 : 2, state.level ?? 'normal'));
}

export interface TicTacToeParams {
  guildId: string;
  channelId: string;
  host: GamePlayer;
  opponent?: GamePlayer | null;
  open?: boolean;
  level?: TicTacToeLevel;
  starter?: 0 | 1;
}

export function createTicTacToe(params: TicTacToeParams): GameSession<TicTacToeState> {
  const vsAi = !params.opponent && !params.open;
  const players = params.opponent ? [params.host, params.opponent] : vsAi ? [params.host, AI_PLAYER] : [params.host];
  const state: TicTacToeState = {
    started: false,
    board: createBoard(),
    turn: 0,
    starter: params.starter ?? (randomIntSecure(2) as 0 | 1),
    level: vsAi ? (params.level ?? 'normal') : null,
    winner: null,
    draw: false,
    line: null,
    lastMove: null,
  };
  const session = gameService.createSession<TicTacToeState>({
    game: 'morpion',
    guildId: params.guildId,
    channelId: params.channelId,
    host: params.host,
    players,
    state,
    status: vsAi ? 'playing' : 'waiting',
    idleTimeoutMs: vsAi ? undefined : LOBBY_TIMEOUT_MS,
  });
  if (vsAi) beginGame(session);
  return session;
}

export const ticTacToeGame: GameDefinition<TicTacToeState> = {
  id: 'morpion',
  label: 'Morpion',
  emoji: '⭕',
  description: 'Le classique 3×3, contre un ami ou une IA imbattable.',
  idleTimeoutMs: 5 * 60_000,
  render,

  async handle(interaction, session, args) {
    const [action, rawIndex] = args;
    const { state } = session;

    if (await handleLobbyAction(interaction, session, ticTacToeGame, action, beginGame)) return;

    if (action === 'rematch') {
      if (session.status !== 'finished') return deny(interaction, 'La partie est encore en cours.');
      if (!isPlayer(session, interaction.user.id)) return deny(interaction, 'Seuls les joueurs de cette partie peuvent demander une revanche.');
      const [first, second] = session.players;
      const fresh = createTicTacToe({
        guildId: session.guildId,
        channelId: session.channelId,
        host: first,
        opponent: isAi(second) ? null : second,
        level: state.level ?? undefined,
        starter: state.starter === 0 ? 1 : 0,
      });
      // Revanche entre humains : pas de nouvelle salle d'attente, on démarre directement.
      if (fresh.status === 'waiting') {
        fresh.status = 'playing';
        gameService.touch(fresh);
        beginGame(fresh);
      }
      fresh.messageId = interaction.message?.id ?? null;
      await updateGame(interaction, render(fresh));
      return;
    }

    if (session.status === 'finished') return deny(interaction, 'Cette partie est terminée.');
    if (!isPlayer(session, interaction.user.id)) return deny(interaction, 'Vous ne participez pas à cette partie. Lancez la vôtre avec `/jeu morpion` !');
    rememberMessage(session, interaction);

    if (action === 'quit') {
      const quitter = session.players.findIndex((player) => player.id === interaction.user.id);
      const other = session.players[quitter === 0 ? 1 : 0];
      state.winner = quitter === 0 ? 1 : 0;
      gameService.finish(session, `🏳️ ${mention(session.players[quitter])} abandonne — ${mention(other)} remporte la partie.`);
      recordOutcome(session);
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'cell') {
      const index = Number.parseInt(rawIndex ?? '', 10);
      if (session.players[state.turn].id !== interaction.user.id) return deny(interaction, 'Ce n’est pas votre tour !');
      if (!Number.isInteger(index) || !availableMoves(state.board).includes(index)) return deny(interaction, 'Cette case n’est pas disponible.');

      applyMove(session, index);
      let over = concludeIfOver(session);
      if (!over && isAi(session.players[state.turn])) {
        applyMove(session, bestMove(state.board, state.turn === 0 ? 1 : 2, state.level ?? 'normal'));
        over = concludeIfOver(session);
      }
      if (!over) gameService.touch(session);
      await updateGame(interaction, render(session));
      return;
    }

    await deny(interaction, 'Action inconnue.');
  },

  onExpire(session) {
    const { state } = session;
    if (!state.started || session.status !== 'playing') return;
    const idle = state.turn;
    const other = idle === 0 ? 1 : 0;
    state.winner = other;
    gameService.finish(session, `⌛ ${mention(session.players[idle])} n’a pas joué à temps — ${mention(session.players[other])} gagne par forfait.`);
    if (!isAi(session.players[1])) recordOutcome(session);
  },
};
