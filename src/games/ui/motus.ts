import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import type { ComponentMessage } from '../../core/types';
import { gameService } from '../../services/gameService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows } from '../../ui/components';
import {
  LETTER_EMOJI,
  MOTUS_LENGTH,
  MOTUS_MAX_ATTEMPTS,
  createMotus,
  isExhausted,
  isSolved,
  keyboardState,
  normalizeGuess,
  submitGuess,
  type MotusState,
} from '../engine/motus';
import type { GameDefinition, GamePlayer, GameSession } from '../types';
import { cid, deny, endRows, formatElapsed, isPlayer, mention, quitButton, rememberMessage, sessionFooterLine, updateGame } from './common';

export interface MotusSessionState extends MotusState {
  lastMessage: string | null;
}

const RULES = 'Trouvez le mot de 5 lettres en 6 essais : 🟩 bien placée, 🟨 présente ailleurs, ⬛ absente.';

function pointsFor(attempts: number): number {
  return 2 + (MOTUS_MAX_ATTEMPTS + 1 - attempts) * 2;
}

function recordOutcome(session: GameSession<MotusSessionState>, won: boolean): void {
  const host = session.players[0];
  gameService.record({
    guildId: session.guildId,
    userId: host.id,
    tag: host.name,
    game: 'motus',
    result: won ? 'win' : 'loss',
    points: won ? pointsFor(session.state.attempts.length) : 0,
    best: won ? session.state.attempts.length : undefined,
    betterIf: 'lower',
  });
}

function renderGrid(state: MotusState): string {
  const rows = state.attempts.map(
    (attempt) => `${attempt.states.map((letterState) => LETTER_EMOJI[letterState]).join('')} \`${attempt.word.split('').join(' ')}\``,
  );
  for (let index = state.attempts.length; index < MOTUS_MAX_ATTEMPTS; index += 1) {
    rows.push(`${'⬜'.repeat(MOTUS_LENGTH)} \`${Array.from({ length: MOTUS_LENGTH }, () => '_').join(' ')}\``);
  }
  return rows.join('\n');
}

function renderKeyboard(state: MotusState): string {
  const known = keyboardState(state);
  const alphabet = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
  const group = (filter: (letter: string) => boolean): string => {
    const letters = alphabet.filter(filter);
    return letters.length ? letters.join(' ') : '—';
  };
  return [
    `🟩 ${group((letter) => known[letter] === 'correct')}`,
    `🟨 ${group((letter) => known[letter] === 'present')}`,
    `⬛ ${group((letter) => known[letter] === 'absent')}`,
    `❔ ${group((letter) => !known[letter])}`,
  ].join('\n');
}

function render(session: GameSession<MotusSessionState>, options: { disabled?: boolean } = {}): ComponentMessage {
  const { state } = session;
  const finished = session.status === 'finished';
  const solved = isSolved(state);

  const lines = [
    `${mention(session.players[0])} — essai **${Math.min(state.attempts.length + (finished ? 0 : 1), MOTUS_MAX_ATTEMPTS)}/${MOTUS_MAX_ATTEMPTS}**`,
    '',
    renderGrid(state),
    '',
    renderKeyboard(state),
    state.lastMessage && !finished ? `\n${state.lastMessage}` : '',
    finished ? `\n${session.outcome ?? 'Partie terminée.'}` : '',
    '',
    sessionFooterLine(session),
  ].filter((line) => line !== '');

  const embed = baseEmbed({
    title: '🟩 Motus',
    description: lines.join('\n'),
    color: finished ? (solved ? THEME.colors.success : THEME.colors.error) : THEME.colors.primary,
    footer: `Elysia • mini-jeux • ${RULES}`,
  });

  if (options.disabled) return { embeds: [embed], components: [] };
  if (finished) return { embeds: [embed], components: endRows(session, { rematchLabel: 'Nouveau mot' }) };
  return {
    embeds: [embed],
    components: buttonRows([{ id: cid(session, 'guessmodal'), label: 'Proposer un mot', emoji: '✏️', style: 'primary' }, quitButton(session)]),
  };
}

export interface MotusParams {
  guildId: string;
  channelId: string;
  host: GamePlayer;
}

export function createMotusSession(params: MotusParams): GameSession<MotusSessionState> {
  return gameService.createSession<MotusSessionState>({
    game: 'motus',
    guildId: params.guildId,
    channelId: params.channelId,
    host: params.host,
    state: { ...createMotus(), lastMessage: null },
  });
}

export const motusGame: GameDefinition<MotusSessionState> = {
  id: 'motus',
  label: 'Motus',
  emoji: '🟩',
  description: 'Le mot mystère de 5 lettres en 6 essais, façon Wordle.',
  idleTimeoutMs: 10 * 60_000,
  render,

  async handle(interaction, session, args) {
    const [action] = args;
    const { state } = session;

    if (action === 'rematch') {
      if (session.status !== 'finished') return deny(interaction, 'La partie est encore en cours.');
      if (!isPlayer(session, interaction.user.id)) return deny(interaction, 'Seul le joueur de cette partie peut relancer un mot. Lancez la vôtre avec `/jeu motus` !');
      const fresh = createMotusSession({ guildId: session.guildId, channelId: session.channelId, host: session.players[0] });
      fresh.messageId = interaction.message?.id ?? null;
      await updateGame(interaction, render(fresh));
      return;
    }

    if (session.status === 'finished') return deny(interaction, 'Cette partie est terminée.');
    if (!isPlayer(session, interaction.user.id)) return deny(interaction, 'Cette partie appartient à un autre membre. Lancez la vôtre avec `/jeu motus` !');

    if (action === 'quit') {
      gameService.finish(session, `🏳️ Partie abandonnée. Le mot était **${state.target}**.`);
      recordOutcome(session, false);
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'guessmodal') {
      if (!interaction.isButton()) return;
      const modal = new ModalBuilder()
        .setCustomId(cid(session, 'guess'))
        .setTitle(`Motus — essai ${state.attempts.length + 1}/${MOTUS_MAX_ATTEMPTS}`)
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('mot')
              .setLabel('Votre mot de 5 lettres')
              .setStyle(TextInputStyle.Short)
              .setMinLength(MOTUS_LENGTH)
              .setMaxLength(12)
              .setRequired(true)
              .setPlaceholder('Ex. : PIANO'),
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    if (action === 'guess' && interaction.isModalSubmit()) {
      rememberMessage(session, interaction);
      const guess = normalizeGuess(interaction.fields.getTextInputValue('mot'));
      if (!guess) return deny(interaction, `Le mot doit comporter exactement **${MOTUS_LENGTH} lettres** (A–Z, accents acceptés).`);
      if (state.attempts.some((attempt) => attempt.word === guess)) return deny(interaction, `Vous avez déjà essayé **${guess}**.`);

      submitGuess(state, guess);
      state.lastMessage = null;
      if (isSolved(state)) {
        const elapsed = formatElapsed(Date.now() - state.startedAt);
        gameService.finish(
          session,
          `🎉 Bravo ! **${state.target}** trouvé en **${state.attempts.length}** essai(s) et ${elapsed} — +${pointsFor(state.attempts.length)} points.`,
        );
        recordOutcome(session, true);
      } else if (isExhausted(state)) {
        gameService.finish(session, `😢 Essais épuisés… Le mot était **${state.target}**.`);
        recordOutcome(session, false);
      } else {
        gameService.touch(session);
      }
      await updateGame(interaction, render(session));
      return;
    }

    await deny(interaction, 'Action inconnue.');
  },

  onExpire(session) {
    if (session.status !== 'playing') return;
    gameService.finish(session, `⌛ Partie expirée par inactivité. Le mot était **${session.state.target}**.`);
  },
};
