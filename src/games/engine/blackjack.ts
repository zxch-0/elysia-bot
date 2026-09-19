import { shuffle } from '../../utils/random';

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type BlackjackOutcome = 'blackjack' | 'win' | 'push' | 'loss';

export interface BlackjackState {
  deck: Card[];
  player: Card[];
  dealer: Card[];
  doubled: boolean;
  /** Main du joueur terminée (le croupier a joué). */
  finished: boolean;
  outcome: BlackjackOutcome | null;
  /** Mise virtuelle (jetons) — sert uniquement au calcul des points. */
  bet: number;
}

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(decks = 1): Card[] {
  const cards: Card[] = [];
  for (let copy = 0; copy < decks; copy += 1) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  }
  return shuffle(cards);
}

export function cardValue(card: Card): number {
  if (card.rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return Number.parseInt(card.rank, 10);
}

/** Valeur d'une main : les as valent 11 puis 1 tant que l'on dépasse 21. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = cards.reduce((sum, card) => sum + cardValue(card), 0);
  let aces = cards.filter((card) => card.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: Card[]): boolean {
  return handValue(cards).total > 21;
}

export function draw(state: BlackjackState): Card {
  if (state.deck.length === 0) state.deck = createDeck();
  return state.deck.pop() as Card;
}

export function createBlackjack(bet = 10): BlackjackState {
  const state: BlackjackState = { deck: createDeck(2), player: [], dealer: [], doubled: false, finished: false, outcome: null, bet };
  state.player.push(draw(state));
  state.dealer.push(draw(state));
  state.player.push(draw(state));
  state.dealer.push(draw(state));
  // Blackjack naturel : la main se règle immédiatement.
  if (isBlackjack(state.player) || isBlackjack(state.dealer)) settle(state);
  return state;
}

/** Le croupier tire jusqu'à 17 (il reste sur un 17 souple). */
export function dealerPlay(state: BlackjackState): void {
  while (handValue(state.dealer).total < 17) state.dealer.push(draw(state));
}

export function settle(state: BlackjackState): BlackjackOutcome {
  const player = handValue(state.player).total;
  if (player > 21) {
    state.outcome = 'loss';
  } else {
    if (!isBlackjack(state.player) || isBlackjack(state.dealer)) dealerPlay(state);
    const dealer = handValue(state.dealer).total;
    const playerBj = isBlackjack(state.player);
    const dealerBj = isBlackjack(state.dealer);
    if (playerBj && !dealerBj) state.outcome = 'blackjack';
    else if (dealerBj && !playerBj) state.outcome = 'loss';
    else if (dealer > 21 || player > dealer) state.outcome = 'win';
    else if (player === dealer) state.outcome = 'push';
    else state.outcome = 'loss';
  }
  state.finished = true;
  return state.outcome;
}

export function hit(state: BlackjackState): void {
  if (state.finished) return;
  state.player.push(draw(state));
  if (isBust(state.player) || handValue(state.player).total === 21) settle(state);
}

export function stand(state: BlackjackState): void {
  if (state.finished) return;
  settle(state);
}

export function canDouble(state: BlackjackState): boolean {
  return !state.finished && state.player.length === 2;
}

export function doubleDown(state: BlackjackState): void {
  if (!canDouble(state)) return;
  state.doubled = true;
  state.bet *= 2;
  state.player.push(draw(state));
  settle(state);
}

export function formatCard(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function formatHand(cards: Card[], hideSecond = false): string {
  return cards.map((card, index) => (hideSecond && index === 1 ? '🂠' : `\`${formatCard(card)}\``)).join(' ');
}

/** Gain net en jetons virtuels (blackjack payé 3:2). */
export function payout(state: BlackjackState): number {
  switch (state.outcome) {
    case 'blackjack':
      return Math.round(state.bet * 1.5);
    case 'win':
      return state.bet;
    case 'push':
      return 0;
    case 'loss':
      return -state.bet;
    default:
      return 0;
  }
}
