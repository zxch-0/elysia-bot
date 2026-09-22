import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { JOKES, JOKE_CATEGORIES, type JokeCategory } from '../../fun/content';
import { randomIntSecure } from '../../utils/random';
import { buttonRows } from '../../ui/components';

const CATEGORY_CHOICES = Object.entries(JOKE_CATEGORIES).map(([value, meta]) => ({
  name: `${meta.emoji} ${meta.label}`,
  value,
}));

/**
 * Blague aléatoire : la chute est d'abord masquée (spoil), avec un bouton
 * « Voir la chute » pour garder l'effet de surprise.
 */
const jokeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('blague')
    .setDescription('Raconte une blague (révélez la chute avec le bouton)')
    .setDMPermission(false)
    .addStringOption((option) => option.setName('categorie').setDescription('Catégorie de blague').addChoices(...CATEGORY_CHOICES))
    .addBooleanOption((option) => option.setName('direct').setDescription('Afficher la chute immédiatement')),
  category: 'fun',
  summary: 'Blague avec chute masquée',
  usage: ['/blague', '/blague categorie:dev direct:true'],
  cooldown: 3,
  async run(ctx: CommandContext) {
    const category = ctx.interaction.options.getString('categorie') as JokeCategory | null;
    const direct = ctx.interaction.options.getBoolean('direct') ?? false;

    const pool = category ? JOKES.filter((joke) => joke.category === category) : JOKES;
    const joke = pool[randomIntSecure(pool.length)];
    const meta = JOKE_CATEGORIES[joke.category];

    const embed = baseEmbed({
      title: `${meta.emoji} Blague ${meta.label.toLowerCase()}`,
      description: [`**${joke.setup}**`, '', direct ? `||${joke.punchline}||` : `||Chute masquée — cliquez sur « Voir la chute » !||`].join('\n'),
      color: THEME.colors.secondary,
      footer: `${JOKES.length} blagues embarquées • catégorie : ${meta.label}`,
    });

    // La chute n'est pas mise dans le customId (limite de 100 caractères) :
    // on transmet l'index de la blague, le module retrouve le texte.
    const rows = direct
      ? []
      : buttonRows([{ id: `fun:punchline:${JOKES.indexOf(joke)}`, label: 'Voir la chute', emoji: '🥁', style: 'primary' }]);

    return ctx.send(embed, rows);
  },
};

export default jokeCommand;
