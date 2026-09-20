import type { ComponentMessage } from '../../core/types';
import { gameService } from '../../services/gameService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows, type ButtonSpec } from '../../ui/components';
import {
  canDouble,
  createBlackjack,
  doubleDown,
  formatCard,
  handValue,
  hit,
  isBlackjack,
  payout,
  stand,
  type BlackjackState,
} from '../engine/blackjack';
import type { GameDefinition, GamePlayer, GameSession } from '../types';
import { canRematch, cid, deny, endRows, isPlayer, linkRematch, mention, rememberMessage, sessionFooterLine, updateGame } from './common';

export const STARTING_CHIPS = 100;
const BETS = [5, 10, 25, 50] as const;
const RULES = 'Approchez 21 sans le dépasser. Le croupier tire jusqu’à 17. Blackjack payé 3:2.';

export interface BlackjackTableState {
  chips: number;
  bet: number;
  hand: BlackjackState | null;
  phase: 'bet' | 'hand' | 'settled';
  hands: number;
  won: number;
  lost: number;
  pushed: number;
  peak: number;
  lastMessage: string | null;
}

function handLine(label: string, cards: BlackjackState['player'], hidden: boolean): string {
  const shown = cards.map((card, index) => (hidden && index === 1 ? '🎴' : `\`${formatCard(card)}\``)).join(' ');
  if (hidden) return `${label} ${shown} = **${handValue([cards[0]]).total}** + ?`;
  const value = handValue(cards);
  const bj = isBlackjack(cards) ? ' • **Blackjack !**' : value.total > 21 ? ' • 💥 sauté' : value.soft ? ' (souple)' : '';
  return `${label} ${shown} = **${value.total}**${bj}`;
}

function describeOutcome(hand: BlackjackState): string {
  const gain = payout(hand);
  switch (hand.outcome) {
    case 'blackjack':
      return `🃏 **Blackjack !** Vous gagnez **${gain}** jetons.`;
    case 'win':
      return `✅ Main gagnée : **+${gain}** jetons.`;
    case 'push':
      return '🤝 Égalité — mise rendue.';
    case 'loss':
      return handValue(hand.player).total > 21 ? `💥 Vous avez sauté : **${gain}** jetons.` : `❌ Main perdue : **${gain}** jetons.`;
    default:
      return '';
  }
}

function settleHand(state: BlackjackTableState): void {
  const hand = state.hand;
  if (!hand || !hand.finished || state.phase === 'settled') return;
  const gain = payout(hand);
  // La mise avait été retirée au moment de la donne : on la restitue avec le gain net.
  state.chips += hand.bet + gain;
  state.hands += 1;
  if (gain > 0) state.won += 1;
  else if (gain < 0) state.lost += 1;
  else state.pushed += 1;
  state.peak = Math.max(state.peak, state.chips);
  state.phase = 'settled';
  state.lastMessage = describeOutcome(hand);
}

function deal(state: BlackjackTableState, bet: number): void {
  state.bet = bet;
  state.chips -= bet;
  state.hand = createBlackjack(bet);
  state.phase = 'hand';
  state.lastMessage = null;
  if (state.hand.finished) settleHand(state);
}

function tablePoints(state: BlackjackTableState): number {
  const profit = state.chips - STARTING_CHIPS;
  return Math.max(0, Math.round(profit / 5)) + state.won;
}

function recordTable(session: GameSession<BlackjackTableState>): void {
  const { state } = session;
  if (state.hands === 0) return;
  const host = session.players[0];
  const profit = state.chips - STARTING_CHIPS;
  gameService.record({
    guildId: session.guildId,
    userId: host.id,
    tag: host.name,
    game: 'blackjack',
    result: profit > 0 ? 'win' : profit < 0 ? 'loss' : 'draw',
    points: tablePoints(state),
    best: state.peak,
    betterIf: 'higher',
  });
}

function closeTable(session: GameSession<BlackjackTableState>, reason: string): void {
  const { state } = session;
  const profit = state.chips - STARTING_CHIPS;
  const sign = profit > 0 ? `+${profit}` : `${profit}`;
  gameService.finish(
    session,
    `${reason}\n💰 Bilan : **${state.chips}** jetons (${sign}) en ${state.hands} main(s) — ${state.won} ✅ ${state.lost} ❌ ${state.pushed} 🤝 • +${tablePoints(state)} pts de classement.`,
  );
  recordTable(session);
}

function render(session: GameSession<BlackjackTableState>, options: { disabled?: boolean } = {}): ComponentMessage {
  const { state } = session;
  const finished = session.status === 'finished';
  const hand = state.hand;
  const hidden = state.phase === 'hand' && hand !== null && !hand.finished;

  const lines = [
    `${mention(session.players[0])} • 💰 Jetons : **${state.chips}**${state.phase !== 'bet' ? ` • Mise : **${state.bet}**${hand?.doubled ? ' (doublée)' : ''}` : ''} • Mains : ${state.hands} (${state.won} ✅ ${state.lost} ❌ ${state.pushed} 🤝)`,
    '',
    hand ? handLine('🎩 Croupier :', hand.dealer, hidden) : '🎩 Croupier : *en attente de votre mise…*',
    hand ? handLine('🙂 Vous :', hand.player, false) : '',
    state.lastMessage ? `\n${state.lastMessage}` : '',
    finished ? `\n${session.outcome ?? 'Table fermée.'}` : '',
    '',
    sessionFooterLine(session),
  ].filter((line) => line !== '');

  const embed = baseEmbed({
    title: '🃏 Blackjack',
    description: lines.join('\n'),
    color: finished ? THEME.colors.neutral : state.phase === 'settled' && hand ? (payout(hand) > 0 ? THEME.colors.success : payout(hand) < 0 ? THEME.colors.error : THEME.colors.info) : THEME.colors.primary,
    footer: `Elysia • mini-jeux • ${RULES}`,
  });

  if (options.disabled) return { embeds: [embed], components: [] };
  if (finished) return { embeds: [embed], components: endRows(session, { rematchLabel: 'Nouvelle table' }) };

  const leave: ButtonSpec = { id: cid(session, 'quit'), label: 'Quitter la table', emoji: '🚪', style: 'danger' };
  if (state.phase === 'bet' || (state.phase === 'settled' && state.chips > 0)) {
    const bets: ButtonSpec[] = BETS.map((amount) => ({
      id: cid(session, 'bet', amount),
      label: `Miser ${amount}`,
      emoji: '💰',
      style: amount === state.bet ? 'primary' : 'secondary',
      disabled: amount > state.chips,
    }));
    if (state.chips > 0 && BETS.every((amount) => amount > state.chips)) {
      bets.push({ id: cid(session, 'bet', state.chips), label: `Tout miser (${state.chips})`, emoji: '🎲', style: 'primary' });
    }
    return { embeds: [embed], components: [...buttonRows(bets), ...buttonRows([leave])] };
  }
  if (state.phase === 'settled') {
    return { embeds: [embed], components: buttonRows([leave]) };
  }
  return {
    embeds: [embed],
    components: buttonRows([
      { id: cid(session, 'hit'), label: 'Tirer', emoji: '🃏', style: 'primary' },
      { id: cid(session, 'stand'), label: 'Rester', emoji: '✋', style: 'success' },
      { id: cid(session, 'double'), label: 'Doubler', emoji: '⏫', style: 'secondary', disabled: !hand || !canDouble(hand) || state.chips < state.bet },
      leave,
    ]),
  };
}

export interface BlackjackParams {
  guildId: string;
  channelId: string;
  host: GamePlayer;
}

export function createBlackjackSession(params: BlackjackParams): GameSession<BlackjackTableState> {
  return gameService.createSession<BlackjackTableState>({
    game: 'blackjack',
    guildId: params.guildId,
    channelId: params.channelId,
    host: params.host,
    state: {
      chips: STARTING_CHIPS,
      bet: 10,
      hand: null,
      phase: 'bet',
      hands: 0,
      won: 0,
      lost: 0,
      pushed: 0,
      peak: STARTING_CHIPS,
      lastMessage: `Bienvenue à la table ! Vous disposez de **${STARTING_CHIPS}** jetons virtuels. Choisissez votre mise.`,
    },
  });
}

export const blackjackGame: GameDefinition<BlackjackTableState> = {
  id: 'blackjack',
  label: 'Blackjack',
  emoji: '🃏',
  description: 'Table de blackjack avec jetons virtuels : tirer, rester, doubler.',
  idleTimeoutMs: 10 * 60_000,
  render,

  async handle(interaction, session, args) {
    const [action, rawAmount] = args;
    const { state } = session;

    if (action === 'rematch') {
      if (!(await canRematch(interaction, session))) return;
      const fresh = createBlackjackSession({ guildId: session.guildId, channelId: session.channelId, host: session.players[0] });
      linkRematch(session, fresh, interaction);
      await updateGame(interaction, render(fresh));
      return;
    }

    if (session.status === 'finished') return deny(interaction, 'Cette table est fermée.');
    if (!isPlayer(session, interaction.user.id)) return deny(interaction, 'Cette table appartient à un autre membre. Ouvrez la vôtre avec `/jeu blackjack` !');
    rememberMessage(session, interaction);

    if (action === 'quit') {
      if (state.phase === 'hand' && state.hand && !state.hand.finished) {
        // Quitter en pleine main = abandonner la mise.
        state.hand.outcome = 'loss';
        state.hand.finished = true;
        settleHand(state);
      }
      closeTable(session, '🚪 Vous quittez la table.');
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'bet') {
      if (state.phase === 'hand') return deny(interaction, 'Terminez la main en cours avant de miser.');
      const amount = Number.parseInt(rawAmount ?? '', 10);
      if (!Number.isInteger(amount) || amount <= 0 || amount > state.chips) return deny(interaction, 'Mise invalide ou jetons insuffisants.');
      deal(state, amount);
      if (state.phase === 'settled' && state.chips <= 0) {
        closeTable(session, '💸 Plus aucun jeton : la table ferme.');
      } else {
        gameService.touch(session);
      }
      await updateGame(interaction, render(session));
      return;
    }

    const hand = state.hand;
    if (state.phase !== 'hand' || !hand || hand.finished) return deny(interaction, 'Aucune main en cours : choisissez d’abord une mise.');

    if (action === 'hit') hit(hand);
    else if (action === 'stand') stand(hand);
    else if (action === 'double') {
      if (!canDouble(hand)) return deny(interaction, 'On ne peut doubler qu’avec ses deux premières cartes.');
      if (state.chips < state.bet) return deny(interaction, 'Jetons insuffisants pour doubler.');
      state.chips -= state.bet;
      doubleDown(hand);
      state.bet = hand.bet;
    } else return deny(interaction, 'Action inconnue.');

    if (hand.finished) settleHand(state);
    if (hand.finished && state.chips <= 0) {
      closeTable(session, '💸 Plus aucun jeton : la table ferme.');
    } else {
      gameService.touch(session);
    }
    await updateGame(interaction, render(session));
  },

  onExpire(session) {
    const { state } = session;
    if (session.status !== 'playing') return;
    if (state.phase === 'hand' && state.hand && !state.hand.finished) {
      state.hand.outcome = 'loss';
      state.hand.finished = true;
      settleHand(state);
    }
    closeTable(session, '⌛ Table fermée pour inactivité.');
  },
};
