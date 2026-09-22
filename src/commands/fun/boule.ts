import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { BALL_ANSWERS } from '../../fun/content';
import { randomIntSecure } from '../../utils/random';
import { truncate } from '../../utils/format';

const MOOD_STYLES = {
  positif: { emoji: '🟢', color: THEME.colors.success },
  neutre: { emoji: '🟡', color: THEME.colors.warning },
  negatif: { emoji: '🔴', color: THEME.colors.error },
} as const;

/**
 * Boule magique : une réponse (parfois très tranchée) à n'importe quelle
 * question fermée. 16 réponses pondérées en positif / neutre / négatif.
 */
const ballCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Pose une question à la boule magique 🎱')
    .setDMPermission(false)
    .addStringOption((option) => option.setName('question').setDescription('Votre question (oui/non)').setRequired(true).setMaxLength(300)),
  category: 'fun',
  summary: 'Boule magique 🎱',
  usage: ['/8ball question:Est-ce que je devrais coder ce soir ?'],
  cooldown: 3,
  async run(ctx: CommandContext) {
    const question = ctx.string('question');
    const answer = BALL_ANSWERS[randomIntSecure(BALL_ANSWERS.length)];
    const style = MOOD_STYLES[answer.mood];

    const embed = baseEmbed({
      title: '🎱 Boule magique',
      description: [
        `**Question :** ${truncate(question, 280)}`,
        '',
        `> ${style.emoji} **${answer.text}**`,
      ].join('\n'),
      color: style.color,
      footer: `Posée par ${ctx.interaction.user.tag} • ${BALL_ANSWERS.length} réponses possibles`,
    });

    return ctx.send(embed);
  },
};

export default ballCommand;
