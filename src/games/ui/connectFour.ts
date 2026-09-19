import type { ComponentMessage } from '../../core/types';
import { gameService } from '../../services/gameService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows, type ButtonSpec } from '../../ui/components';
import { humanizeNumber } from '../../utils/format';
import { randomIntSecure } from '../../utils/random';
import {
  COLS,
  ROWS,
  bestMove,
  canPlay,
  createBoard,
  isFull,
  play,
  winningLine,
  type C4Board,
  type ConnectFourLevel,
} from '../engine/connectFour';
import type { GameDefinition, GamePlayer, GameSession } from '../types';
import {
  AI_LEVEL_LABEL,
  AI_PLAYER,
  DIGIT_EMOJI,
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

export interface ConnectFourState {
  started: boolean;
  board: C4Board;
  turn: 0 | 1;
  starter: 0 | 1;
  level: ConnectFourLevel | null;
  winner: 0 | 1 | null;
  draw: boolean;
  line: number[] | null;
  lastColumn: number | null;
  aiInfo: { depth: number; nodes: number } | null;
}

const DISC = ['🔴', '🟡'] as const;
const WIN_DISC = ['🟥', '🟨'] as const;
const RULES = 'Alignez quatre jetons (horizontal, vertical ou diagonal). Les jetons tombent au plus bas de la colonne.';
const AI_POINTS: Record<ConnectFourLevel, number> = { facile: 5, normal: 10, difficile: 20, expert: 35 };

function points(state: ConnectFourState, result: 'win' | 'draw', vsAi: boolean): number {
  if (!vsAi) return result === 'win' ? 15 : 5;
  const base = AI_POINTS[state.level ?? 'normal'];
  return result === 'win' ? base : Math.ceil(base / 2);
}

function recordOutcome(session: GameSession<ConnectFourState>): void {
  const { state } = session;
  const vsAi = isAi(session.players[1]);
  session.players.forEach((player, index) => {
    if (isAi(player)) return;
    const result = state.draw ? 'draw' : state.winner === index ? 'win' : 'loss';
    gameService.record({
      guildId: session.guildId,
      userId: player.id,
      tag: player.name,
      game: 'puissance4',
      result,
      points: result === 'loss' ? 0 : points(state, result, vsAi),
    });
  });
}

function applyMove(session: GameSession<ConnectFourState>, column: number): void {
  const { state } = session;
  const disc = state.turn === 0 ? 1 : 2;
  const row = play(state.board, column, disc);
  state.lastColumn = column;
  const line = winningLine(state.board, row, column);
  if (line) {
    state.winner = state.turn;
    state.line = line;
    return;
  }
  if (isFull(state.board)) {
    state.draw = true;
    return;
  }
  state.turn = state.turn === 0 ? 1 : 0;
}

function aiTurn(session: GameSession<ConnectFourState>): void {
  const { state } = session;
  const move = bestMove(state.board, state.turn === 0 ? 1 : 2, state.level ?? 'normal');
  state.aiInfo = { depth: move.depth, nodes: move.nodes };
  applyMove(session, move.column);
}

function concludeIfOver(session: GameSession<ConnectFourState>): boolean {
  const { state } = session;
  if (state.winner === null && !state.draw) return false;
  const outcome = state.draw
    ? '🤝 Grille pleine : match nul !'
    : `🏆 ${DISC[state.winner!]} ${mention(session.players[state.winner!])} aligne quatre jetons et remporte la partie !`;
  gameService.finish(session, outcome);
  recordOutcome(session);
  return true;
}

function renderGrid(state: ConnectFourState): string {
  const header = Array.from({ length: COLS }, (_, col) => DIGIT_EMOJI[col + 1]).join('');
  const rows: string[] = [];
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    let line = '';
    for (let col = 0; col < COLS; col += 1) {
      const index = row * COLS + col;
      const cell = state.board.cells[index];
      if (cell === 0) line += '⚫';
      else if (state.line?.includes(index)) line += WIN_DISC[cell - 1];
      else line += DISC[cell - 1];
    }
    rows.push(line);
  }
  return [header, ...rows].join('\n');
}

function render(session: GameSession<ConnectFourState>, options: { disabled?: boolean } = {}): ComponentMessage {
  const { state } = session;
  if (!state.started) {
    return lobbyPayload(session, connectFourGame, { rules: RULES, details: ['🔴 joue en premier, 🟡 en second — un tirage décide qui commence.'] });
  }

  const [first, second] = session.players;
  const finished = session.status === 'finished';
  const info: string[] = [];
  if (state.lastColumn !== null) info.push(`Dernier coup : colonne **${state.lastColumn + 1}**`);
  if (state.aiInfo && state.aiInfo.depth > 0) {
    info.push(`IA : profondeur ${state.aiInfo.depth} (${humanizeNumber(state.aiInfo.nodes)} positions)`);
  }

  const lines = [
    `${DISC[0]} ${mention(first)}  •  ${DISC[1]} ${mention(second)}${state.level ? `  *(IA ${AI_LEVEL_LABEL[state.level]})*` : ''}`,
    '',
    renderGrid(state),
    '',
    finished ? (session.outcome ?? 'Partie terminée.') : `➜ Au tour de ${DISC[state.turn]} ${mention(session.players[state.turn])}`,
    info.length ? `*${info.join(' • ')}*` : '',
    sessionFooterLine(session),
  ].filter((line) => line !== '');

  const embed = baseEmbed({
    title: '🔴 Puissance 4',
    description: lines.join('\n'),
    color: finished ? (state.draw ? THEME.colors.neutral : THEME.colors.success) : THEME.colors.primary,
    footer: `Elysia • mini-jeux • ${RULES}`,
  });

  const columns: ButtonSpec[] = Array.from({ length: COLS }, (_, col) => ({
    id: cid(session, 'col', col),
    emoji: DIGIT_EMOJI[col + 1],
    style: 'secondary',
    disabled: options.disabled || finished || !canPlay(state.board, col),
  }));
  const rows = [...buttonRows(columns.slice(0, 4)), ...buttonRows(columns.slice(4))];
  if (!options.disabled) {
    if (finished) rows.push(...endRows(session, { rematchLabel: 'Revanche' }));
    else rows.push(...buttonRows([quitButton(session)]));
  }
  return { embeds: [embed], components: rows };
}

function beginGame(session: GameSession<ConnectFourState>): void {
  const { state } = session;
  state.started = true;
  state.turn = state.starter;
  if (isAi(session.players[state.turn])) aiTurn(session);
}

export interface ConnectFourParams {
  guildId: string;
  channelId: string;
  host: GamePlayer;
  opponent?: GamePlayer | null;
  open?: boolean;
  level?: ConnectFourLevel;
  starter?: 0 | 1;
}

export function createConnectFour(params: ConnectFourParams): GameSession<ConnectFourState> {
  const vsAi = !params.opponent && !params.open;
  const players = params.opponent ? [params.host, params.opponent] : vsAi ? [params.host, AI_PLAYER] : [params.host];
  const state: ConnectFourState = {
    started: false,
    board: createBoard(),
    turn: 0,
    starter: params.starter ?? (randomIntSecure(2) as 0 | 1),
    level: vsAi ? (params.level ?? 'normal') : null,
    winner: null,
    draw: false,
    line: null,
    lastColumn: null,
    aiInfo: null,
  };
  const session = gameService.createSession<ConnectFourState>({
    game: 'puissance4',
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

export const connectFourGame: GameDefinition<ConnectFourState> = {
  id: 'puissance4',
  label: 'Puissance 4',
  emoji: '🔴',
  description: 'Alignez quatre jetons — IA alpha-bêta à quatre niveaux ou duel entre membres.',
  idleTimeoutMs: 6 * 60_000,
  render,

  async handle(interaction, session, args) {
    const [action, rawColumn] = args;
    const { state } = session;

    if (await handleLobbyAction(interaction, session, connectFourGame, action, beginGame)) return;

    if (action === 'rematch') {
      if (session.status !== 'finished') return deny(interaction, 'La partie est encore en cours.');
      if (!isPlayer(session, interaction.user.id)) return deny(interaction, 'Seuls les joueurs de cette partie peuvent demander une revanche.');
      const [first, second] = session.players;
      const fresh = createConnectFour({
        guildId: session.guildId,
        channelId: session.channelId,
        host: first,
        opponent: isAi(second) ? null : second,
        level: state.level ?? undefined,
        starter: state.starter === 0 ? 1 : 0,
      });
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
    if (!isPlayer(session, interaction.user.id)) return deny(interaction, 'Vous ne participez pas à cette partie. Lancez la vôtre avec `/jeu puissance4` !');
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

    if (action === 'col') {
      const column = Number.parseInt(rawColumn ?? '', 10);
      if (session.players[state.turn].id !== interaction.user.id) return deny(interaction, 'Ce n’est pas votre tour !');
      if (!Number.isInteger(column) || !canPlay(state.board, column)) return deny(interaction, 'Cette colonne est pleine ou invalide.');

      applyMove(session, column);
      let over = concludeIfOver(session);
      if (!over && isAi(session.players[state.turn])) {
        aiTurn(session);
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
