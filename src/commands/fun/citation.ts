import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { QUOTES, QUOTE_THEMES, type QuoteTheme } from '../../fun/content';
import { randomIntSecure } from '../../utils/random';

const THEME_CHOICES = Object.entries(QUOTE_THEMES).map(([value, meta]) => ({
  name: `${meta.emoji} ${meta.label}`,
  value,
}));

/**
 * Citation inspirante, drôle ou absurde — avec 5 thèmes et une couleur
 * d'embed qui change selon le thème choisi.
 */
const quoteCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('citation')
    .setDescription('Affiche une citation aléatoire (motivation, sagesse, code…)')
    .setDMPermission(false)
    .addStringOption((option) => option.setName('theme').setDescription('Thème des citations').addChoices(...THEME_CHOICES)),
  category: 'fun',
  summary: 'Citation aléatoire',
  usage: ['/citation', '/citation theme:motivation'],
  cooldown: 3,
  async run(ctx: CommandContext) {
    const theme = ctx.interaction.options.getString('theme') as QuoteTheme | null;
    const pool = theme ? QUOTES.filter((quote) => quote.theme === theme) : QUOTES;
    const quote = pool[randomIntSecure(pool.length)];
    const meta = QUOTE_THEMES[quote.theme];

    const embed = baseEmbed({
      title: `${meta.emoji} Citation ${meta.label.toLowerCase()}`,
      description: [`> *${quote.text}*`, '', `— **${quote.author}**`].join('\n'),
      color: quote.theme === 'absurde' ? THEME.colors.warning : THEME.colors.primary,
      footer: `${QUOTES.length} citations embarquées • /citation theme:${quote.theme} pour ce thème`,
    });

    return ctx.send(embed);
  },
};

export default quoteCommand;
