import type { ComponentMessage } from '../../core/types';
import { gameService } from '../../services/gameService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows, type ButtonSpec } from '../../ui/components';
import { createMemory, flip, hideMismatch, isComplete, nextTurn, soloPoints, type MemoryState } from '../engine/memory';
import type { GameDefinition, GamePlayer, GameSession } from '../types';
import {
  LOBBY_TIMEOUT_MS,
  canRematch,
  cid,
  deny,
  endRows,
  formatElapsed,
  handleLobbyAction,
  isPlayer,
  linkRematch,
  lobbyPayload,
  mention,
  quitButton,
  rematchPair,
  rememberMessage,
  sessionFooterLine,
  updateGame,
} from './common';

export interface MemorySessionState extends MemoryState {
  started: boolean;
  duel: boolean;
  winner: 0 | 1 | null;
  finishedAt: number | null;
  lastMessage: string | null;
}

const PEEK_MS = 2_500;
const RULES = 'Retournez deux cartes : si elles sont identiques, la paire est gagnée.';

function columns(state: MemoryState): number {
  return state.cards.length % 5 === 0 ? 5 : 4;
}

function recordOutcome(session: GameSession<MemorySessionState>): void {
  const { state } = session;
  if (!state.duel) {
    const host = session.players[0];
    gameService.record({
      guildId: session.guildId,
      userId: host.id,
      tag: host.name,
      game: 'memory',
      result: isComplete(state) ? 'win' : 'loss',
      points: isComplete(state) ? soloPoints(state) : 0,
      best: isComplete(state) ? state.moves : undefined,
      betterIf: 'lower',
    });
    return;
  }
  session.players.forEach((player, index) => {
    const result = state.winner === null ? 'draw' : state.winner === index ? 'win' : 'loss';
    gameService.record({
      guildId: session.guildId,
      userId: player.id,
      tag: player.name,
      game: 'memory',
      result,
      points: result === 'win' ? 10 : result === 'draw' ? 4 : 0,
    });
  });
}

function concludeIfOver(session: GameSession<MemorySessionState>): boolean {
  const { state } = session;
  if (!isComplete(state)) return false;
  state.finishedAt = Date.now();
  const elapsed = formatElapsed(state.finishedAt - state.startedAt);
  if (!state.duel) {
    gameService.finish(session, `🎉 Toutes les paires trouvées en **${state.moves}** coups et ${elapsed} — +${soloPoints(state)} points !`);
  } else if (state.found[0] === state.found[1]) {
    state.winner = null;
    gameService.finish(session, `🤝 Égalité parfaite **${state.found[0]} – ${state.found[1]}** en ${elapsed} !`);
  } else {
    state.winner = state.found[0] > state.found[1] ? 0 : 1;
    gameService.finish(session, `🏆 ${mention(session.players[state.winner])} remporte le duel **${state.found[0]} – ${state.found[1]}** en ${elapsed} !`);
  }
  recordOutcome(session);
  return true;
}

function render(session: GameSession<MemorySessionState>, options: { disabled?: boolean } = {}): ComponentMessage {
  const { state } = session;
  if (!state.started) {
    return lobbyPayload(session, memoryGame, { rules: RULES, details: [`${state.pairs} paires à trouver — celui qui en trouve le plus gagne.`] });
  }

  const finished = session.status === 'finished';
  const found = state.matched.filter(Boolean).length / 2;
  const header = state.duel
    ? `${mention(session.players[0])} **${state.found[0]}** — **${state.found[1]}** ${mention(session.players[1])} • ${found}/${state.pairs} paires`
    : `${mention(session.players[0])} • ${found}/${state.pairs} paires • **${state.moves}** coup(s)`;

  const lines = [
    header,
    `⏱️ ${formatElapsed((state.finishedAt ?? Date.now()) - state.startedAt)}`,
    !finished && state.duel ? `➜ Au tour de ${mention(session.players[state.turn])}` : '',
    state.lastMessage && !finished ? state.lastMessage : '',
    finished ? `\n${session.outcome ?? 'Partie terminée.'}` : '',
    '',
    sessionFooterLine(session),
  ].filter((line) => line !== '');

  const embed = baseEmbed({
    title: '🧩 Memory',
    description: lines.join('\n'),
    color: finished ? THEME.colors.success : THEME.colors.primary,
    footer: `Elysia • mini-jeux • ${RULES}`,
  });

  const cols = columns(state);
  const rows: ComponentMessage['components'] = [];
  for (let start = 0; start < state.cards.length; start += cols) {
    const cells: ButtonSpec[] = state.cards.slice(start, start + cols).map((symbol, offset) => {
      const index = start + offset;
      const id = cid(session, 'flip', index);
      if (state.matched[index]) return { id, emoji: symbol, style: 'success', disabled: true };
      if (state.faceUp.includes(index)) return { id, emoji: symbol, style: 'primary', disabled: true };
      return { id, emoji: '🟦', style: 'secondary', disabled: options.disabled || finished };
    });
    rows.push(...buttonRows(cells));
  }
  if (options.disabled) return { embeds: [embed], components: finished ? rows : [] };
  if (finished) rows.push(...endRows(session, { rematchLabel: state.duel ? 'Revanche' : 'Rejouer' }));
  else rows.push(...buttonRows([quitButton(session)]));
  return { embeds: [embed], components: rows };
}

function beginGame(session: GameSession<MemorySessionState>): void {
  session.state.started = true;
  session.state.startedAt = Date.now();
}

export interface MemoryParams {
  guildId: string;
  channelId: string;
  host: GamePlayer;
  opponent?: GamePlayer | null;
  open?: boolean;
  pairs?: number;
}

export function createMemorySession(params: MemoryParams): GameSession<MemorySessionState> {
  const duel = Boolean(params.opponent) || Boolean(params.open);
  const players = params.opponent ? [params.host, params.opponent] : [params.host];
  const state: MemorySessionState = {
    ...createMemory(params.pairs ?? 8),
    started: false,
    duel,
    winner: null,
    finishedAt: null,
    lastMessage: null,
  };
  const session = gameService.createSession<MemorySessionState>({
    game: 'memory',
    guildId: params.guildId,
    channelId: params.channelId,
    host: params.host,
    players,
    state,
    status: duel ? 'waiting' : 'playing',
    idleTimeoutMs: duel ? LOBBY_TIMEOUT_MS : undefined,
  });
  if (!duel) beginGame(session);
  return session;
}

export const memoryGame: GameDefinition<MemorySessionState> = {
  id: 'memory',
  label: 'Memory',
  emoji: '🧩',
  description: 'Retrouvez les paires d’emojis, en solo (chrono) ou en duel au tour par tour.',
  idleTimeoutMs: 5 * 60_000,
  render,

  async handle(interaction, session, args) {
    const [action, rawIndex] = args;
    const { state } = session;

    if (await handleLobbyAction(interaction, session, memoryGame, action, beginGame)) return;

    if (action === 'rematch') {
      if (!(await canRematch(interaction, session))) return;
      const { me, other } = rematchPair(session, interaction.user.id);
      // Duel : nouveau défi à accepter par l'autre joueur ; solo : on repart aussitôt.
      const fresh = createMemorySession({
        guildId: session.guildId,
        channelId: session.channelId,
        host: me,
        opponent: state.duel ? (other ?? null) : null,
        open: state.duel && !other,
        pairs: state.pairs,
      });
      linkRematch(session, fresh, interaction);
      await updateGame(interaction, render(fresh));
      return;
    }

    if (session.status === 'finished') return deny(interaction, 'Cette partie est terminée.');
    if (!isPlayer(session, interaction.user.id)) return deny(interaction, 'Vous ne participez pas à cette partie. Lancez la vôtre avec `/jeu memory` !');
    rememberMessage(session, interaction);

    if (action === 'quit') {
      if (state.duel) {
        const me = session.players.findIndex((player) => player.id === interaction.user.id);
        state.winner = me === 0 ? 1 : 0;
        state.finishedAt = Date.now();
        gameService.finish(session, `🏳️ ${mention(session.players[me])} abandonne — ${mention(session.players[state.winner])} remporte le duel.`);
      } else {
        state.finishedAt = Date.now();
        gameService.finish(session, `🏳️ Partie abandonnée après ${state.moves} coup(s).`);
      }
      recordOutcome(session);
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'flip') {
      if (state.duel && session.players[state.turn].id !== interaction.user.id) return deny(interaction, 'Ce n’est pas votre tour !');
      const index = Number.parseInt(rawIndex ?? '', 10);
      if (!Number.isInteger(index)) return deny(interaction, 'Carte invalide.');
      const outcome = flip(state, index);
      if (outcome === 'invalid') return deny(interaction, 'Cette carte est déjà retournée.');

      if (outcome === 'match') {
        state.lastMessage = `✨ Paire trouvée${state.duel ? ` par ${mention(interaction.user.id)} — il rejoue !` : ' !'}`;
      } else if (outcome === 'mismatch') {
        state.lastMessage = '❌ Pas de correspondance… les cartes se retournent dans un instant.';
        if (state.duel) nextTurn(state);
        const token = state.peekToken;
        gameService.schedule(session, PEEK_MS, async () => {
          if (session.status !== 'playing' || state.peekToken !== token || state.faceUp.length !== 2) return;
          hideMismatch(state);
          state.lastMessage = null;
          await gameService.refreshMessage(session);
        });
      } else {
        state.lastMessage = null;
      }

      if (!concludeIfOver(session)) gameService.touch(session);
      await updateGame(interaction, render(session));
      return;
    }

    await deny(interaction, 'Action inconnue.');
  },

  onExpire(session) {
    const { state } = session;
    if (!state.started || session.status !== 'playing') return;
    state.finishedAt = Date.now();
    if (state.duel) {
      const idle = state.turn;
      const other = idle === 0 ? 1 : 0;
      state.winner = other;
      gameService.finish(session, `⌛ ${mention(session.players[idle])} n’a pas joué à temps — ${mention(session.players[other])} gagne par forfait.`);
      recordOutcome(session);
    } else {
      gameService.finish(session, '⌛ Partie expirée par inactivité.');
    }
  },
};
