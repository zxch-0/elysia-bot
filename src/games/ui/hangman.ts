import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import type { ComponentMessage } from '../../core/types';
import { gameService } from '../../services/gameService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows, selectMenu, type SelectOptionSpec } from '../../ui/components';
import { codeBlock } from '../../utils/format';
import {
  GALLOWS,
  HANGMAN_THEMES,
  MAX_ERRORS,
  createHangman,
  guessLetter,
  guessWord,
  isLost,
  isWon,
  maskedWord,
  remainingLetters,
  type HangmanState,
  type HangmanTheme,
} from '../engine/hangman';
import type { GameDefinition, GamePlayer, GameSession } from '../types';
import { canRematch, cid, deny, endRows, isPlayer, linkRematch, mention, quitButton, rememberMessage, sessionFooterLine, updateGame } from './common';

export interface HangmanSessionState extends HangmanState {
  mode: 'solo' | 'tous';
  requestedTheme: HangmanTheme | 'aleatoire';
  lastEvent: string | null;
  /** Pseudos des participants (mode coopératif) pour les statistiques. */
  names: Record<string, string>;
}

const RULES = 'Devinez le mot lettre par lettre — 6 erreurs et c’est perdu !';

function letterEmoji(letter: string): string {
  return String.fromCodePoint(0x1f1e6 + (letter.charCodeAt(0) - 65));
}

function canPlay(session: GameSession<HangmanSessionState>, userId: string): boolean {
  return session.state.mode === 'tous' || isPlayer(session, userId);
}

function recordOutcome(session: GameSession<HangmanSessionState>, won: boolean): void {
  const { state } = session;
  const livesLeft = MAX_ERRORS - state.errors;
  if (state.mode === 'solo') {
    const host = session.players[0];
    gameService.record({
      guildId: session.guildId,
      userId: host.id,
      tag: host.name,
      game: 'pendu',
      result: won ? 'win' : 'loss',
      points: won ? 5 + livesLeft : 0,
      best: won ? state.errors : undefined,
      betterIf: 'lower',
    });
    return;
  }
  if (!won) return;
  const contributors = new Set([...Object.keys(state.contributions), ...(state.solvedBy ? [state.solvedBy] : [])]);
  for (const userId of contributors) {
    const letters = state.contributions[userId] ?? 0;
    const solver = state.solvedBy === userId;
    gameService.record({
      guildId: session.guildId,
      userId,
      tag: state.names[userId] ?? userId,
      game: 'pendu',
      result: solver ? 'win' : 'draw',
      points: letters + (solver ? 5 + livesLeft : 0),
    });
  }
}

function conclude(session: GameSession<HangmanSessionState>): boolean {
  const { state } = session;
  if (isWon(state)) {
    const by = state.solvedBy ? ` grâce à ${mention(state.solvedBy)}` : '';
    gameService.finish(session, `🎉 Mot trouvé${by} : **${state.display}** — ${MAX_ERRORS - state.errors} vie(s) restante(s).`);
    recordOutcome(session, true);
    return true;
  }
  if (isLost(state)) {
    gameService.finish(session, `💀 Pendu ! Le mot était **${state.display}**.`);
    recordOutcome(session, false);
    return true;
  }
  return false;
}

function render(session: GameSession<HangmanSessionState>, options: { disabled?: boolean } = {}): ComponentMessage {
  const { state } = session;
  const finished = session.status === 'finished';
  const theme = HANGMAN_THEMES[state.theme];
  const tried = state.guessed.filter((letter) => !state.word.includes(letter));
  const found = state.guessed.filter((letter) => state.word.includes(letter));

  const lines = [
    codeBlock(GALLOWS[Math.min(state.errors, GALLOWS.length - 1)], 'text'),
    `**\`${finished ? state.display.split('').join(' ') : maskedWord(state)}\`**`,
    `*Mot de ${state.word.length} lettres • thème ${theme.emoji} ${theme.label}*`,
    '',
    `❤️ Vies : **${MAX_ERRORS - state.errors}/${MAX_ERRORS}**  •  ❌ Ratées : ${tried.length ? tried.join(', ') : '—'}  •  ✅ Trouvées : ${found.length ? found.join(', ') : '—'}`,
    state.wrongWords.length ? `🚫 Mots refusés : ${state.wrongWords.map((word) => `~~${word}~~`).join(', ')}` : '',
    state.mode === 'tous' ? '👥 **Tout le monde** peut proposer des lettres !' : `🎯 Joueur : ${mention(session.players[0])}`,
    state.lastEvent && !finished ? `\n${state.lastEvent}` : '',
    finished ? `\n${session.outcome ?? 'Partie terminée.'}` : '',
    '',
    sessionFooterLine(session),
  ].filter((line) => line !== '');

  const embed = baseEmbed({
    title: '🪢 Pendu',
    description: lines.join('\n'),
    color: finished ? (isWon(state) ? THEME.colors.success : THEME.colors.error) : THEME.colors.primary,
    footer: `Elysia • mini-jeux • ${RULES}`,
  });

  if (options.disabled) return { embeds: [embed], components: [] };
  if (finished) return { embeds: [embed], components: endRows(session, { rematchLabel: 'Nouveau mot' }) };

  const remaining = remainingLetters(state);
  const toOptions = (letters: string[]): SelectOptionSpec[] =>
    letters.map((letter) => ({ value: letter, label: letter, emoji: letterEmoji(letter) }));
  const firstHalf = remaining.filter((letter) => letter <= 'M');
  const secondHalf = remaining.filter((letter) => letter > 'M');

  const rows: ComponentMessage['components'] = [];
  if (firstHalf.length > 0) rows.push(selectMenu({ id: cid(session, 'letter', 1), placeholder: 'Choisir une lettre (A → M)', options: toOptions(firstHalf) }));
  if (secondHalf.length > 0) rows.push(selectMenu({ id: cid(session, 'letter', 2), placeholder: 'Choisir une lettre (N → Z)', options: toOptions(secondHalf) }));
  rows.push(
    ...buttonRows([
      { id: cid(session, 'wordmodal'), label: 'Proposer le mot', emoji: '🔤', style: 'primary' },
      quitButton(session),
    ]),
  );
  return { embeds: [embed], components: rows };
}

export interface HangmanParams {
  guildId: string;
  channelId: string;
  host: GamePlayer;
  theme?: HangmanTheme | 'aleatoire' | null;
  mode?: 'solo' | 'tous';
}

export function createHangmanSession(params: HangmanParams): GameSession<HangmanSessionState> {
  const state: HangmanSessionState = {
    ...createHangman(params.theme),
    mode: params.mode ?? 'solo',
    requestedTheme: params.theme ?? 'aleatoire',
    lastEvent: null,
    names: { [params.host.id]: params.host.name },
  };
  return gameService.createSession<HangmanSessionState>({
    game: 'pendu',
    guildId: params.guildId,
    channelId: params.channelId,
    host: params.host,
    state,
  });
}

export const hangmanGame: GameDefinition<HangmanSessionState> = {
  id: 'pendu',
  label: 'Pendu',
  emoji: '🪢',
  description: 'Devinez un mot français par thème, seul ou avec tout le salon.',
  idleTimeoutMs: 10 * 60_000,
  render,

  async handle(interaction, session, args) {
    const [action] = args;
    const { state } = session;

    if (action === 'rematch') {
      // Mode « tous » : n'importe quel membre peut relancer un mot et devient l'hôte.
      if (!(await canRematch(interaction, session, state.mode === 'solo'))) return;
      const fresh = createHangmanSession({
        guildId: session.guildId,
        channelId: session.channelId,
        host: state.mode === 'tous' ? { id: interaction.user.id, name: interaction.user.username } : session.players[0],
        theme: state.requestedTheme,
        mode: state.mode,
      });
      linkRematch(session, fresh, interaction);
      await updateGame(interaction, render(fresh));
      return;
    }

    if (session.status === 'finished') return deny(interaction, 'Cette partie est terminée.');
    if (!canPlay(session, interaction.user.id)) {
      return deny(interaction, 'Cette partie est en mode solo. Lancez la vôtre avec `/jeu pendu` (ou demandez le mode « tous ») !');
    }

    if (action === 'quit') {
      if (!isPlayer(session, interaction.user.id)) return deny(interaction, 'Seul l’hôte peut abandonner la partie.');
      gameService.finish(session, `🏳️ Partie abandonnée par ${mention(interaction.user.id)}. Le mot était **${state.display}**.`);
      if (state.mode === 'solo') recordOutcome(session, false);
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'wordmodal') {
      if (!interaction.isButton()) return;
      const modal = new ModalBuilder()
        .setCustomId(cid(session, 'word'))
        .setTitle('Proposer le mot entier')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('mot')
              .setLabel(`Mot de ${state.word.length} lettres`)
              .setStyle(TextInputStyle.Short)
              .setMinLength(2)
              .setMaxLength(32)
              .setRequired(true)
              .setPlaceholder(`Thème : ${HANGMAN_THEMES[state.theme].label} — une mauvaise réponse coûte une vie !`.slice(0, 100)),
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    rememberMessage(session, interaction);
    state.names[interaction.user.id] = interaction.user.username;

    if (action === 'word' && interaction.isModalSubmit()) {
      const attempt = interaction.fields.getTextInputValue('mot');
      const correct = guessWord(state, attempt, interaction.user.id);
      state.lastEvent = correct ? null : `❌ ${mention(interaction.user.id)} a proposé un mot incorrect (−1 vie).`;
      if (!conclude(session)) gameService.touch(session);
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'letter' && interaction.isStringSelectMenu()) {
      const letter = interaction.values[0] ?? '';
      const outcome = guessLetter(state, letter, interaction.user.id);
      if (outcome === 'invalid') return deny(interaction, 'Lettre invalide.');
      if (outcome === 'repeat') return deny(interaction, `La lettre **${letter}** a déjà été proposée.`);
      const who = state.mode === 'tous' ? `${mention(interaction.user.id)} ` : '';
      state.lastEvent =
        outcome === 'hit'
          ? `✅ ${who}**${letter}** est dans le mot !`
          : `❌ ${who}**${letter}** n’est pas dans le mot (−1 vie).`;
      if (!conclude(session)) gameService.touch(session);
      await updateGame(interaction, render(session));
      return;
    }

    await deny(interaction, 'Action inconnue.');
  },

  onExpire(session) {
    if (session.status !== 'playing') return;
    gameService.finish(session, `⌛ Partie expirée par inactivité. Le mot était **${session.state.display}**.`);
  },
};
