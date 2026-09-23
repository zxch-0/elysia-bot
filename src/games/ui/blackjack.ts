import type { ComponentMessage } from '../../core/types';
import { economyService, CURRENCY_EMOJI } from '../../services/economyService';
import { gameService } from '../../services/gameService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows, type ButtonSpec } from '../../ui/components';
import { humanizeNumber } from '../../utils/format';
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

const BETS = [5, 10, 25, 50] as const;
const MIN_BET = 1;
const RULES = 'Approchez 21 sans le dépasser. Le croupier tire jusqu’à 17. Blackjack payé 3:2 — mises en argent réel.';

export interface BlackjackTableState {
  bet: number;
  hand: BlackjackState | null;
  phase: 'bet' | 'hand' | 'settled';
  hands: number;
  won: number;
  lost: number;
  pushed: number;
  /** Gain net cumulé sur cette table (peut être négatif). */
  net: number;
  /** Meilleur gain net atteint pendant la table. */
  peak: number;
  lastMessage: string | null;
}

function walletOf(session: GameSession<BlackjackTableState>): number {
  return economyService.balance(session.guildId, session.players[0].id);
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
      return `🃏 **Blackjack !** Vous gagnez **${humanizeNumber(gain)}** ${CURRENCY_EMOJI}.`;
    case 'win':
      return `✅ Main gagnée : **+${humanizeNumber(gain)}** ${CURRENCY_EMOJI}.`;
    case 'push':
      return '🤝 Égalité — mise rendue.';
    case 'loss':
      return handValue(hand.player).total > 21
        ? `💥 Vous avez sauté : **${humanizeNumber(gain)}** ${CURRENCY_EMOJI}.`
        : `❌ Main perdue : **${humanizeNumber(gain)}** ${CURRENCY_EMOJI}.`;
    default:
      return '';
  }
}

/** Restitue la mise et le gain net sur le portefeuille, puis met à jour la table. */
function settleHand(session: GameSession<BlackjackTableState>): void {
  const { state } = session;
  const hand = state.hand;
  if (!hand || !hand.finished || state.phase === 'settled') return;
  const gain = payout(hand);
  const host = session.players[0];
  // La mise avait été retirée au moment de la donne (et du doublet) :
  // on restitue la mise totale avec le gain net.
  economyService.settleBet(session.guildId, host.id, host.name, hand.bet, gain);
  state.net += gain;
  state.hands += 1;
  if (gain > 0) state.won += 1;
  else if (gain < 0) state.lost += 1;
  else state.pushed += 1;
  state.peak = Math.max(state.peak, state.net);
  state.phase = 'settled';
  state.lastMessage = describeOutcome(hand);
}

/** Pose une mise (débitée du portefeuille) et distribue les cartes. */
function deal(session: GameSession<BlackjackTableState>, bet: number): boolean {
  const { state } = session;
  const host = session.players[0];
  if (!economyService.tryBet(session.guildId, host.id, host.name, bet)) return false;
  state.bet = bet;
  state.hand = createBlackjack(bet);
  state.phase = 'hand';
  state.lastMessage = null;
  if (state.hand.finished) settleHand(session);
  return true;
}

function tablePoints(state: BlackjackTableState): number {
  return Math.max(0, Math.round(state.net / 5)) + state.won;
}

function recordTable(session: GameSession<BlackjackTableState>): void {
  const { state } = session;
  if (state.hands === 0) return;
  const host = session.players[0];
  gameService.record({
    guildId: session.guildId,
    userId: host.id,
    tag: host.name,
    game: 'blackjack',
    result: state.net > 0 ? 'win' : state.net < 0 ? 'loss' : 'draw',
    points: tablePoints(state),
    best: state.net,
    betterIf: 'higher',
  });
}

function closeTable(session: GameSession<BlackjackTableState>, reason: string): void {
  const { state } = session;
  const sign = state.net > 0 ? `+${humanizeNumber(state.net)}` : humanizeNumber(state.net);
  gameService.finish(
    session,
    `${reason}\n💰 Bilan : **${sign}** ${CURRENCY_EMOJI} en ${state.hands} main(s) — ${state.won} ✅ ${state.lost} ❌ ${state.pushed} 🤝 • +${tablePoints(state)} pts de classement.`,
  );
  recordTable(session);
}

function render(session: GameSession<BlackjackTableState>, options: { disabled?: boolean } = {}): ComponentMessage {
  const { state } = session;
  const finished = session.status === 'finished';
  const hand = state.hand;
  const hidden = state.phase === 'hand' && hand !== null && !hand.finished;
  const wallet = walletOf(session);

  const lines = [
    `${mention(session.players[0])} • 💰 Solde : **${humanizeNumber(wallet)}** ${CURRENCY_EMOJI}${
      state.phase !== 'bet' ? ` • Mise : **${humanizeNumber(state.bet)}**${hand?.doubled ? ' (doublée)' : ''}` : ''
    } • Mains : ${state.hands} (${state.won} ✅ ${state.lost} ❌ ${state.pushed} 🤝)`,
    '',
    hand ? handLine('🎩 Croupier :', hand.dealer, hidden) : '🎩 Croupier : *en attente de votre mise…*',
    hand ? handLine('🙂 Vous :', hand.player, false) : '',
    state.lastMessage ? `\n${state.lastMessage}` : '',
    wallet <= 0 && state.phase !== 'hand' && !finished
      ? `\n💸 **Portefeuille vide !** Gagnez de l’argent en discutant puis revenez miser.`
      : '',
    finished ? `\n${session.outcome ?? 'Table fermée.'}` : '',
    '',
    sessionFooterLine(session),
  ].filter((line) => line !== '');

  const embed = baseEmbed({
    title: '🃏 Blackjack — mises en argent réel',
    description: lines.join('\n'),
    color: finished
      ? THEME.colors.neutral
      : state.phase === 'settled' && hand
        ? payout(hand) > 0
          ? THEME.colors.success
          : payout(hand) < 0
            ? THEME.colors.error
            : THEME.colors.info
        : THEME.colors.primary,
    footer: `Elysia • mini-jeux • ${RULES}`,
  });

  if (options.disabled) return { embeds: [embed], components: [] };
  if (finished) return { embeds: [embed], components: endRows(session, { rematchLabel: 'Nouvelle table' }) };

  const leave: ButtonSpec = { id: cid(session, 'quit'), label: 'Quitter la table', emoji: '🚪', style: 'danger' };

  if (state.phase === 'bet' || (state.phase === 'settled' && wallet > 0)) {
    const bets: ButtonSpec[] = BETS.map((amount) => ({
      id: cid(session, 'bet', amount),
      label: `Miser ${amount}`,
      emoji: '💰',
      style: amount === state.bet ? 'primary' : 'secondary',
      disabled: amount > wallet,
    }));
    if (wallet >= MIN_BET && BETS.every((amount) => amount > wallet)) {
      bets.push({ id: cid(session, 'bet', wallet), label: `Tout miser (${wallet})`, emoji: '🎲', style: 'primary' });
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
      { id: cid(session, 'double'), label: 'Doubler', emoji: '⏫', style: 'secondary', disabled: !hand || !canDouble(hand) || wallet < state.bet },
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
      bet: BETS[1],
      hand: null,
      phase: 'bet',
      hands: 0,
      won: 0,
      lost: 0,
      pushed: 0,
      net: 0,
      peak: 0,
      lastMessage: `Bienvenue à la table ! Misez l’argent gagné en discutant — solde actuel : **${humanizeNumber(economyService.balance(params.guildId, params.host.id))}** ${CURRENCY_EMOJI}.`,
    },
  });
}

export const blackjackGame: GameDefinition<BlackjackTableState> = {
  id: 'blackjack',
  label: 'Blackjack',
  emoji: '🃏',
  description: 'Blackjack contre le croupier : miser son argent réel, gagné en discutant.',
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
        settleHand(session);
      }
      closeTable(session, '🚪 Vous quittez la table.');
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'bet') {
      if (state.phase === 'hand') return deny(interaction, 'Terminez la main en cours avant de miser.');
      const amount = Number.parseInt(rawAmount ?? '', 10);
      if (!Number.isInteger(amount) || amount < MIN_BET) return deny(interaction, 'Mise invalide.');
      if (!deal(session, amount)) {
        return deny(
          interaction,
          `Solde insuffisant : vous avez **${humanizeNumber(walletOf(session))}** ${CURRENCY_EMOJI}. Gagnez de l’argent en discutant (\`/argent voir\`).`,
          '💸 Paris refusés',
        );
      }
      gameService.touch(session);
      await updateGame(interaction, render(session));
      return;
    }

    const hand = state.hand;
    if (state.phase !== 'hand' || !hand || hand.finished) return deny(interaction, 'Aucune main en cours : choisissez d’abord une mise.');

    if (action === 'hit') hit(hand);
    else if (action === 'stand') stand(hand);
    else if (action === 'double') {
      if (!canDouble(hand)) return deny(interaction, 'On ne peut doubler qu’avec ses deux premières cartes.');
      const host = session.players[0];
      if (!economyService.tryBet(session.guildId, host.id, host.name, state.bet)) {
        return deny(
          interaction,
          `Solde insuffisant pour doubler (**${humanizeNumber(walletOf(session))}** ${CURRENCY_EMOJI} disponibles).`,
          '💸 Double refusé',
        );
      }
      doubleDown(hand);
      state.bet = hand.bet;
    } else return deny(interaction, 'Action inconnue.');

    if (hand.finished) settleHand(session);
    gameService.touch(session);
    await updateGame(interaction, render(session));
  },

  onExpire(session) {
    const { state } = session;
    if (session.status !== 'playing') return;
    if (state.phase === 'hand' && state.hand && !state.hand.finished) {
      state.hand.outcome = 'loss';
      state.hand.finished = true;
      settleHand(session);
    }
    closeTable(session, '⌛ Table fermée pour inactivité.');
  },
};
