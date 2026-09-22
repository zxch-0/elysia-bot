import type { AnySelectMenuInteraction, ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import type { ElysiaClient } from '../core/client';
import type { ComponentMessage } from '../core/types';

/** Identifiants des mini-jeux (utilisés dans les customIds et les statistiques). */
export type GameId =
  | 'morpion'
  | 'puissance4'
  | 'pendu'
  | 'motus'
  | 'quiz'
  | 'demineur'
  | '2048'
  | 'blackjack'
  | 'pfc'
  | 'memory';

export const GAME_IDS: readonly GameId[] = [
  'morpion',
  'puissance4',
  'pendu',
  'motus',
  'quiz',
  'demineur',
  '2048',
  'blackjack',
  'pfc',
  'memory',
];

export type SessionStatus = 'waiting' | 'playing' | 'finished';

export interface GamePlayer {
  id: string;
  name: string;
}

/**
 * Partie en cours, gardée en mémoire (les statistiques, elles, sont persistées).
 * `state` est propre à chaque jeu ; `timers` regroupe les minuteries internes
 * (quiz, memory) pour les annuler proprement à la fin.
 */
export interface GameSession<S = unknown> {
  id: string;
  game: GameId;
  guildId: string;
  channelId: string;
  messageId: string | null;
  hostId: string;
  players: GamePlayer[];
  status: SessionStatus;
  state: S;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  /** Résumé affiché à la fin (victoire, abandon, expiration…). */
  outcome: string | null;
  /**
   * Identifiant de la partie qui a remplacé celle-ci sur le même message
   * (revanche). Une partie remplacée ne rafraîchit plus jamais son message et
   * ne peut pas être relancée une seconde fois.
   */
  supersededBy: string | null;
  timers: Set<NodeJS.Timeout>;
}

export type GameComponentInteraction = ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

/** Contrat implémenté par chaque mini-jeu (rendu + gestion des clics). */
export interface GameDefinition<S = unknown> {
  id: GameId;
  label: string;
  emoji: string;
  description: string;
  /** Inactivité maximale avant expiration automatique de la partie. */
  idleTimeoutMs: number;
  /** Construit le message (embed + composants) correspondant à l'état courant. */
  render(session: GameSession<S>, options?: { disabled?: boolean }): ComponentMessage;
  /** Traite une interaction (`g:<jeu>:<session>:<action>:<args…>`). */
  handle(interaction: GameComponentInteraction, session: GameSession<S>, args: string[], client: ElysiaClient): Promise<void>;
  /** Détermine l'issue d'une partie expirée par inactivité (optionnel). */
  onExpire?(session: GameSession<S>): void;
}

export type GameResult = 'win' | 'loss' | 'draw';

/** Statistiques d'un joueur pour un jeu donné. */
export interface GameRecord {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  /** Meilleure performance (score, temps…) — sens défini par le jeu. */
  best: number | null;
  /** Série de victoires en cours et record de série. */
  streak: number;
  bestStreak: number;
}

export function emptyRecord(): GameRecord {
  return { played: 0, wins: 0, losses: 0, draws: 0, points: 0, best: null, streak: 0, bestStreak: 0 };
}

/**
 * Fusionne les statistiques de plusieurs jeux en un bilan « toutes catégories »
 * (classement général du site intégré).
 * `best` reste indéfini entre jeux (« plus petit » vs « plus grand est
 * meilleur ») et vaut donc `null` ; les séries conservent le maximum.
 */
export function mergeRecords(records: GameRecord[]): GameRecord {
  const merged = emptyRecord();
  for (const record of records) {
    merged.played += record.played;
    merged.wins += record.wins;
    merged.losses += record.losses;
    merged.draws += record.draws;
    merged.points += record.points;
    merged.streak = Math.max(merged.streak, record.streak);
    merged.bestStreak = Math.max(merged.bestStreak, record.bestStreak);
  }
  return merged;
}
