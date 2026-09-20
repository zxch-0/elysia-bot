import type { ComponentMessage } from '../../core/types';
import { gameService } from '../../services/gameService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows, type ButtonSpec } from '../../ui/components';
import {
  RPS_META,
  createRps,
  describeRound,
  isValidMove,
  matchWinner,
  movesFor,
  playRound,
  randomMove,
  type RpsMove,
  type RpsState,
  type RpsVariant,
} from '../engine/rps';
import type { GameDefinition, GamePlayer, GameSession } from '../types';
import {
  AI_PLAYER,
  DIGIT_EMOJI,
  LOBBY_TIMEOUT_MS,
  canRematch,
  cid,
  deny,
  endRows,
  handleLobbyAction,
  isAi,
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

export interface RpsSessionState extends RpsState {
  started: boolean;
  bestOf: number;
  lastRound: string | null;
  winner: 0 | 1 | null;
}

const RULES_CLASSIC = 'Pierre casse ciseaux, ciseaux coupent feuille, feuille recouvre pierre.';
const RULES_EXTENDED = 'Variante Lézard-Spock : cinq coups, chaque coup en bat deux autres.';

function rules(variant: RpsVariant): string {
  return variant === 'lezard-spock' ? RULES_EXTENDED : RULES_CLASSIC;
}

function recordOutcome(session: GameSession<RpsSessionState>): void {
  const { state } = session;
  const vsAi = isAi(session.players[1]);
  session.players.forEach((player, index) => {
    if (isAi(player)) return;
    const won = state.winner === index;
    gameService.record({
      guildId: session.guildId,
      userId: player.id,
      tag: player.name,
      game: 'pfc',
      result: won ? 'win' : 'loss',
      points: won ? (vsAi ? 2 + state.target : 5 + 2 * state.target) : 0,
    });
  });
}

function concludeIfOver(session: GameSession<RpsSessionState>): boolean {
  const { state } = session;
  const winner = matchWinner(state);
  if (winner === null) return false;
  state.winner = winner;
  gameService.finish(session, `🏆 ${mention(session.players[winner])} remporte le match **${state.score[0]} – ${state.score[1]}** !`);
  recordOutcome(session);
  return true;
}

function resolvePending(session: GameSession<RpsSessionState>): void {
  const { state } = session;
  const a = state.pending[0];
  const b = state.pending[1];
  if (!a || !b) return;
  const round = playRound(state, a, b);
  const verdict = round.winner === 0 ? 'manche nulle' : `point pour ${mention(session.players[round.winner - 1])}`;
  state.lastRound = `${describeRound(a, b)} → ${verdict}.`;
}

function render(session: GameSession<RpsSessionState>, options: { disabled?: boolean } = {}): ComponentMessage {
  const { state } = session;
  if (!state.started) {
    return lobbyPayload(session, rpsGame, {
      rules: rules(state.variant),
      details: [`Match au meilleur des **${state.bestOf}** (premier à ${state.target}).`],
    });
  }

  const [first, second] = session.players;
  const finished = session.status === 'finished';
  const pendingLine = session.players
    .map((player, index) => (state.pending[index as 0 | 1] ? `✅ ${mention(player)} a choisi` : `⏳ ${mention(player)} réfléchit…`))
    .join(' • ');
  const history = state.rounds
    .map((round, index) => `${DIGIT_EMOJI[index + 1] ?? `${index + 1}.`} ${RPS_META[round.moves[0]].emoji}/${RPS_META[round.moves[1]].emoji}`)
    .join('  ');

  const lines = [
    `${mention(first)} **${state.score[0]}** — **${state.score[1]}** ${mention(second)} • au meilleur des ${state.bestOf}`,
    '',
    finished ? '' : `**Manche ${state.rounds.length + 1}** : ${pendingLine}`,
    state.lastRound ? `Dernière manche : ${state.lastRound}` : '',
    history ? `Historique : ${history}` : '',
    finished ? `\n${session.outcome ?? 'Match terminé.'}` : '',
    '',
    sessionFooterLine(session),
  ].filter((line) => line !== '');

  const embed = baseEmbed({
    title: `✂️ Pierre-Feuille-Ciseaux${state.variant === 'lezard-spock' ? ' — Lézard-Spock' : ''}`,
    description: lines.join('\n'),
    color: finished ? THEME.colors.success : THEME.colors.primary,
    footer: `Elysia • mini-jeux • ${rules(state.variant)}`,
  });

  if (options.disabled) return { embeds: [embed], components: [] };
  if (finished) return { embeds: [embed], components: endRows(session, { rematchLabel: 'Revanche' }) };

  const moves: ButtonSpec[] = movesFor(state.variant).map((move) => ({
    id: cid(session, 'play', move),
    label: RPS_META[move].label,
    emoji: RPS_META[move].emoji,
    style: 'primary',
  }));
  return { embeds: [embed], components: [...buttonRows(moves), ...buttonRows([quitButton(session)])] };
}

function beginGame(session: GameSession<RpsSessionState>): void {
  session.state.started = true;
}

export interface RpsParams {
  guildId: string;
  channelId: string;
  host: GamePlayer;
  opponent?: GamePlayer | null;
  open?: boolean;
  variant?: RpsVariant;
  bestOf?: number;
}

export function createRpsSession(params: RpsParams): GameSession<RpsSessionState> {
  const vsAi = !params.opponent && !params.open;
  const players = params.opponent ? [params.host, params.opponent] : vsAi ? [params.host, AI_PLAYER] : [params.host];
  const bestOf = [1, 3, 5, 7].includes(params.bestOf ?? 3) ? (params.bestOf ?? 3) : 3;
  const state: RpsSessionState = {
    ...createRps(params.variant ?? 'classique', bestOf, vsAi),
    started: false,
    bestOf,
    lastRound: null,
    winner: null,
  };
  const session = gameService.createSession<RpsSessionState>({
    game: 'pfc',
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

export const rpsGame: GameDefinition<RpsSessionState> = {
  id: 'pfc',
  label: 'Pierre-Feuille-Ciseaux',
  emoji: '✂️',
  description: 'Duel en plusieurs manches, variante Lézard-Spock, choix simultanés et secrets.',
  idleTimeoutMs: 5 * 60_000,
  render,

  async handle(interaction, session, args) {
    const [action, rawMove] = args;
    const { state } = session;

    if (await handleLobbyAction(interaction, session, rpsGame, action, beginGame)) return;

    if (action === 'rematch') {
      if (!(await canRematch(interaction, session))) return;
      const { me, other } = rematchPair(session, interaction.user.id);
      const fresh = createRpsSession({
        guildId: session.guildId,
        channelId: session.channelId,
        host: me,
        opponent: isAi(other) ? null : other,
        open: !other,
        variant: state.variant,
        bestOf: state.bestOf,
      });
      linkRematch(session, fresh, interaction);
      await updateGame(interaction, render(fresh));
      return;
    }

    if (session.status === 'finished') return deny(interaction, 'Ce match est terminé.');
    if (!isPlayer(session, interaction.user.id)) return deny(interaction, 'Vous ne participez pas à ce match. Lancez le vôtre avec `/jeu pfc` !');
    rememberMessage(session, interaction);

    const me = session.players.findIndex((player) => player.id === interaction.user.id) as 0 | 1;

    if (action === 'quit') {
      const other = me === 0 ? 1 : 0;
      state.winner = other;
      gameService.finish(session, `🏳️ ${mention(session.players[me])} abandonne — ${mention(session.players[other])} remporte le match.`);
      recordOutcome(session);
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'play') {
      const move = rawMove ?? '';
      if (!isValidMove(state.variant, move)) return deny(interaction, 'Coup invalide pour cette variante.');
      if (state.pending[me]) return deny(interaction, 'Vous avez déjà choisi pour cette manche : attendez votre adversaire.');
      state.pending[me] = move as RpsMove;
      if (state.vsBot) state.pending[1] = randomMove(state.variant);
      resolvePending(session);
      if (!concludeIfOver(session)) gameService.touch(session);
      await updateGame(interaction, render(session));
      return;
    }

    await deny(interaction, 'Action inconnue.');
  },

  onExpire(session) {
    const { state } = session;
    if (!state.started || session.status !== 'playing') return;
    if (isAi(session.players[1])) {
      gameService.finish(session, '⌛ Match interrompu par inactivité.');
      return;
    }
    // Le joueur qui n'a pas joué perd par forfait ; si personne n'a joué, match annulé.
    const idle = ([0, 1] as const).filter((index) => !state.pending[index]);
    if (idle.length === 1) {
      const other = idle[0] === 0 ? 1 : 0;
      state.winner = other;
      gameService.finish(session, `⌛ ${mention(session.players[idle[0]])} n’a pas joué à temps — ${mention(session.players[other])} gagne par forfait.`);
      recordOutcome(session);
    } else {
      gameService.finish(session, '⌛ Match annulé : aucun joueur n’a joué à temps.');
    }
  },
};
