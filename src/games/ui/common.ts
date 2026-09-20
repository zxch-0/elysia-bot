import { MessageFlags, type EmbedBuilder, type User } from 'discord.js';
import type { ComponentMessage } from '../../core/types';
import { isIgnorableError } from '../../core/errors';
import { logger } from '../../core/logger';
import { gameService } from '../../services/gameService';
import { baseEmbed, errorEmbed, THEME } from '../../ui/embeds';
import { buttonRows, type ButtonSpec } from '../../ui/components';
import { formatDuration, timestampTag } from '../../utils/duration';
import type { GameComponentInteraction, GameDefinition, GamePlayer, GameSession } from '../types';

const log = logger.child('games:ui');

/** Délai d'acceptation d'un défi / d'une partie ouverte. */
export const LOBBY_TIMEOUT_MS = 3 * 60_000;

export const DIGIT_EMOJI = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'] as const;
export const MEDALS = ['🥇', '🥈', '🥉'] as const;

export function toPlayer(user: User): GamePlayer {
  return { id: user.id, name: user.username };
}

/** Adversaire virtuel (l'identifiant ne peut pas entrer en collision avec un vrai membre). */
export const AI_PLAYER: GamePlayer = { id: 'ai', name: 'Elysia' };

export function isAi(player: GamePlayer | undefined): boolean {
  return player?.id === AI_PLAYER.id;
}

export function mention(player: GamePlayer | string): string {
  const id = typeof player === 'string' ? player : player.id;
  if (id === AI_PLAYER.id) return '🤖 **Elysia**';
  return `<@${id}>`;
}

export function isPlayer(session: GameSession<any>, userId: string): boolean {
  return session.players.some((player) => player.id === userId);
}

export function playerIndex(session: GameSession<any>, userId: string): number {
  return session.players.findIndex((player) => player.id === userId);
}

/** Identifiant de composant : `g:<jeu>:<session>:<action>:<args…>`. */
export function cid(session: GameSession<any>, action: string, ...args: Array<string | number>): string {
  return ['g', session.game, session.id, action, ...args.map(String)].join(':');
}

/** Réponse privée d'erreur (fonctionne avant ou après un accusé de réception). */
export async function deny(interaction: GameComponentInteraction, message: string, title = 'Action impossible'): Promise<void> {
  const payload = { embeds: [errorEmbed(message, title)], flags: MessageFlags.Ephemeral } as const;
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (error) {
    if (!isIgnorableError(error)) log.warn('Réponse privée impossible', error);
  }
}

/** Réponse privée informative. */
export async function whisper(interaction: GameComponentInteraction, embed: EmbedBuilder): Promise<void> {
  const payload = { embeds: [embed], flags: MessageFlags.Ephemeral } as const;
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (error) {
    if (!isIgnorableError(error)) log.warn('Réponse privée impossible', error);
  }
}

/** Met à jour le message de la partie à partir d'un rendu. */
export async function updateGame(interaction: GameComponentInteraction, payload: ComponentMessage): Promise<void> {
  const body = {
    content: payload.content ?? '',
    embeds: payload.embeds ?? [],
    components: payload.components ?? [],
  };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(body);
    return;
  }
  if (interaction.isModalSubmit()) {
    if (interaction.isFromMessage()) await interaction.update(body);
    else await interaction.reply({ ...body, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.update(body);
}

/** Mémorise l'identifiant du message porteur (utile pour les minuteries et l'expiration). */
export function rememberMessage(session: GameSession<any>, interaction: GameComponentInteraction): void {
  const messageId = interaction.message?.id;
  if (messageId) session.messageId = messageId;
}

/** Durée écoulée lisible (« 1 min 12 s »), jamais « permanent » pour 0. */
export function formatElapsed(ms: number): string {
  if (ms < 1_000) return '< 1 s';
  return formatDuration(ms, { compact: true });
}

/** Ligne « statut » commune : identifiant + expiration relative. */
export function sessionFooterLine(session: GameSession<any>): string {
  if (session.status === 'finished') return `*Partie \`${session.id}\` terminée.*`;
  return `*Partie \`${session.id}\` • expire ${timestampTag(session.expiresAt, 'R')} sans action.*`;
}

/**
 * Installe une revanche sur le message de la partie précédente : l'ancienne
 * partie est marquée comme remplacée (plus de double revanche, plus de
 * rafraîchissement concurrent) et la nouvelle hérite du message.
 */
export function linkRematch(previous: GameSession<any>, fresh: GameSession<any>, interaction: GameComponentInteraction): void {
  gameService.supersede(previous, fresh, interaction.message?.id ?? null);
}

/** Vérifie qu'une revanche est possible ; répond en privé sinon. */
export async function canRematch(interaction: GameComponentInteraction, session: GameSession<any>, ownersOnly = true): Promise<boolean> {
  if (session.status !== 'finished') {
    await deny(interaction, 'La partie est encore en cours.');
    return false;
  }
  if (session.supersededBy) {
    await deny(interaction, 'Une revanche a déjà été lancée depuis cette partie.', '🔄 Partie remplacée');
    return false;
  }
  if (ownersOnly && !isPlayer(session, interaction.user.id)) {
    await deny(interaction, `Seuls les joueurs de cette partie peuvent la relancer. Lancez la vôtre avec \`/jeu ${session.game}\` !`);
    return false;
  }
  return true;
}

/** Le joueur qui clique et son partenaire (humain ou IA) dans une partie à deux. */
export function rematchPair(session: GameSession<any>, userId: string): { me: GamePlayer; other: GamePlayer | undefined } {
  const me = session.players.find((player) => player.id === userId) ?? session.players[0];
  const other = session.players.find((player) => player.id !== me.id);
  return { me, other };
}

/** Bouton d'abandon standard. */
export function quitButton(session: GameSession<any>, label = 'Abandonner'): ButtonSpec {
  return { id: cid(session, 'quit'), label, emoji: '🏳️', style: 'danger' };
}

/** Bouton « rejouer / revanche » affiché en fin de partie. */
export function rematchButton(session: GameSession<any>, label = 'Rejouer'): ButtonSpec {
  return { id: cid(session, 'rematch'), label, emoji: '🔄', style: 'primary' };
}

/** Rangée de fin de partie (revanche) — vide si la partie est expirée/désactivée. */
export function endRows(session: GameSession<any>, options: { disabled?: boolean; rematchLabel?: string } = {}) {
  if (options.disabled) return [];
  return buttonRows([rematchButton(session, options.rematchLabel)]);
}

// ── Salle d'attente (défis et parties ouvertes) ─────────────────────────────

export interface LobbyRenderOptions {
  disabled?: boolean;
  /** Courte description des règles affichée sous l'invitation. */
  rules?: string;
  /** Détails de la partie (manches, difficulté…). */
  details?: string[];
}

/** Vrai si la partie attend encore un adversaire (défi direct ou partie ouverte). */
export function isLobby(session: GameSession<any>): boolean {
  return session.status === 'waiting';
}

/** Message d'attente : défi direct (2 joueurs) ou partie ouverte (1 joueur). */
export function lobbyPayload(
  session: GameSession<any>,
  definition: GameDefinition<any>,
  options: LobbyRenderOptions = {},
): ComponentMessage {
  const host = session.players[0];
  const opponent = session.players[1];
  const duel = Boolean(opponent);
  const finished = session.status === 'finished';

  const lines: string[] = [];
  if (finished) {
    lines.push(session.outcome ?? 'Invitation close.');
  } else if (duel) {
    lines.push(`${mention(host)} défie ${mention(opponent)} au **${definition.label}** !`);
    lines.push(`${mention(opponent)}, acceptes-tu le défi ? *(expire ${timestampTag(session.expiresAt, 'R')})*`);
  } else {
    lines.push(`${mention(host)} cherche un adversaire au **${definition.label}** !`);
    lines.push(`Cliquez sur **Rejoindre** pour jouer contre ${mention(host)}. *(expire ${timestampTag(session.expiresAt, 'R')})*`);
  }
  if (options.details?.length) lines.push('', ...options.details);
  if (options.rules && !finished) lines.push('', `📖 ${options.rules}`);

  const embed = baseEmbed({
    title: `${definition.emoji} ${definition.label} — ${finished ? 'invitation close' : duel ? 'défi lancé' : 'partie ouverte'}`,
    description: lines.join('\n'),
    color: finished ? THEME.colors.neutral : THEME.colors.primary,
    footer: 'Elysia • mini-jeux',
  });

  if (finished || options.disabled) return { embeds: [embed], components: [] };

  const buttons: ButtonSpec[] = duel
    ? [
        { id: cid(session, 'accept'), label: 'Accepter', emoji: '✅', style: 'success' },
        { id: cid(session, 'decline'), label: 'Refuser', emoji: '❌', style: 'danger' },
        { id: cid(session, 'cancel'), label: 'Annuler (hôte)', emoji: '✖️', style: 'secondary' },
      ]
    : [
        { id: cid(session, 'join'), label: 'Rejoindre', emoji: '🎮', style: 'success' },
        { id: cid(session, 'cancel'), label: 'Annuler (hôte)', emoji: '✖️', style: 'secondary' },
      ];
  return { embeds: [embed], components: buttonRows(buttons) };
}

/**
 * Traite les boutons de la salle d'attente. Retourne `true` si l'action a été
 * consommée (le jeu n'a rien d'autre à faire), `false` sinon.
 */
export async function handleLobbyAction(
  interaction: GameComponentInteraction,
  session: GameSession<any>,
  definition: GameDefinition<any>,
  action: string,
  onStart: (session: GameSession<any>) => void,
): Promise<boolean> {
  if (!['accept', 'decline', 'join', 'cancel'].includes(action)) return false;
  const userId = interaction.user.id;
  const host = session.players[0];
  const opponent = session.players[1];

  if (session.status !== 'waiting') {
    await deny(interaction, 'Cette invitation n’est plus valable.');
    return true;
  }

  if (action === 'cancel') {
    if (userId !== host.id) {
      await deny(interaction, 'Seul l’hôte peut annuler l’invitation.');
      return true;
    }
    gameService.finish(session, `✖️ Invitation annulée par ${mention(host)}.`);
    await updateGame(interaction, definition.render(session));
    return true;
  }

  if (action === 'decline') {
    if (!opponent || userId !== opponent.id) {
      await deny(interaction, 'Seul le joueur défié peut refuser.');
      return true;
    }
    gameService.finish(session, `❌ ${mention(opponent)} a décliné le défi de ${mention(host)}.`);
    await updateGame(interaction, definition.render(session));
    return true;
  }

  if (action === 'accept') {
    if (!opponent || userId !== opponent.id) {
      await deny(interaction, 'Seul le joueur défié peut accepter ce défi.');
      return true;
    }
  }

  if (action === 'join') {
    if (opponent) {
      await deny(interaction, 'Cette partie a déjà trouvé son adversaire.');
      return true;
    }
    if (userId === host.id) {
      await deny(interaction, 'Vous êtes l’hôte : attendez qu’un autre membre rejoigne (ou annulez).');
      return true;
    }
    if (interaction.user.bot) {
      await deny(interaction, 'Les bots ne jouent pas… pour l’instant.');
      return true;
    }
    session.players.push(toPlayer(interaction.user));
  }

  session.status = 'playing';
  rememberMessage(session, interaction);
  gameService.touch(session);
  onStart(session);
  await updateGame(interaction, definition.render(session));
  return true;
}

/** Libellé de difficulté avec emoji. */
export const AI_LEVEL_LABEL: Record<string, string> = {
  facile: '🟢 Facile',
  normal: '🟡 Normal',
  difficile: '🟠 Difficile',
  expert: '🔴 Expert',
  imbattable: '🟣 Imbattable',
};
