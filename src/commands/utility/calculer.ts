import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, errorEmbed, THEME } from '../../ui/embeds';
import { codeBlock, humanizeNumber } from '../../utils/format';
import { evaluateExpression, formatNumber, MathEvalError } from '../../utils/mathEval';

/** Exemples affichés en cas d'erreur de syntaxe. */
const EXAMPLES = ['2 + 3 * 4', 'sqrt(144) + 2^10', '15% de 240', '(3+4)! / 2', 'sin(pi/2)', 'round(19.99 * 1.2)'];

/**
 * Calculatrice complète (aucun `eval` : analyseur syntaxique maison) :
 * opérateurs, parenthèses, puissances, factorielles, fonctions scientifiques
 * et pourcentages à la française (« 15% de 240 »).
 */
const calcCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('calculer')
    .setDescription('Calculatrice : opérateurs, fonctions scientifiques, pourcentages, factorielles')
    .setDMPermission(false)
    .addStringOption((option) =>
      option.setName('expression').setDescription('Expression à calculer (ex. sqrt(144) + 2^10)').setRequired(true).setMaxLength(300),
    )
    .addBooleanOption((option) => option.setName('public').setDescription('Afficher le résultat à tout le monde')),
  category: 'utility',
  summary: 'Calculatrice scientifique',
  usage: ['/calculer expression:2^10', '/calculer expression:15% de 240'],
  cooldown: 2,
  async run(ctx: CommandContext) {
    const expression = ctx.string('expression');
    const isPublic = ctx.interaction.options.getBoolean('public') ?? false;

    try {
      const result = evaluateExpression(expression);
      const embed = baseEmbed({
        title: '🧮 Résultat',
        description: [`${codeBlock(expression)}`, `**= ${formatNumber(result)}**`].join('\n'),
        color: THEME.colors.success,
        footer: isPublic ? 'Calcul public' : 'Visible uniquement par vous',
      });

      // Informations complémentaires utiles (arrondis, forme scientifique).
      if (!Number.isInteger(result)) {
        embed.addFields(
          { name: 'Arrondi', value: `Entier : ${humanizeNumber(Math.round(result))} • 2 décimales : ${formatNumber(Number(result.toFixed(2)))}`, inline: true },
          { name: 'Scientifique', value: result.toExponential(4), inline: true },
        );
      }
      if (Math.abs(result) > 1e15) {
        embed.addFields({ name: '⚠️ Précision', value: 'Le résultat dépasse 10¹⁵ : les décimales peuvent être approximatives.', inline: false });
      }

      return ctx.send(embed);
    } catch (error) {
      if (error instanceof MathEvalError) {
        return ctx.send(
          errorEmbed(
            [
              `**${error.message}**`,
              '',
              '**Exemples valides :**',
              ...EXAMPLES.map((example) => `• \`${example}\``),
              '',
              '*Fonctions :* sqrt, abs, round, floor, ceil, sin, cos, tan, log, ln, exp, min, max, pow, hypot, avg, sign',
            ].join('\n'),
            'Expression invalide',
          ),
        );
      }
      throw error;
    }
  },
};

export default calcCommand;
