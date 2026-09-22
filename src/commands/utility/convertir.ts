import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, errorEmbed, THEME } from '../../ui/embeds';
import { UNITS, UNIT_CATEGORIES, convertUnits, describeUnits, type UnitCategory } from '../../utils/units';
import { formatNumber } from '../../utils/mathEval';
import { UsageError } from '../../core/errors';

/** Suggestions croisées : les conversions les plus demandées. */
const POPULAR: Array<[string, string]> = [
  ['km', 'mi'],
  ['cm', 'in'],
  ['kg', 'lb'],
  ['c', 'f'],
  ['l', 'gal'],
  ['kmh', 'mph'],
  ['mo', 'go'],
  ['min', 'h'],
  ['m2', 'ft2'],
];

/** Discord limite les listes de choix à 25 entrées : on utilise
 *  l'autocomplétion, qui couvre les 45 unités (et accepte les symboles). */
function unitChoices(query: string): Array<{ name: string; value: string }> {
  const needle = query.trim().toLowerCase();
  const scored = UNITS.map((unit) => {
    const haystack = `${unit.id} ${unit.symbol} ${unit.label}`.toLowerCase();
    const score = needle.length === 0 ? 1 : haystack.startsWith(needle) ? 3 : haystack.includes(needle) ? 2 : 0;
    return { unit, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.unit.label.localeCompare(b.unit.label, 'fr'))
    .slice(0, 25);

  return scored.map(({ unit }) => ({
    name: `${unit.label} (${unit.symbol}) — ${UNIT_CATEGORIES[unit.category].emoji}`.slice(0, 100),
    value: unit.id,
  }));
}

/**
 * Convertisseur d'unités : longueurs, masses, températures, volumes, vitesses,
 * données informatiques, durées et surfaces — 8 catégories, 45 unités.
 */
const convertCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('convertir')
    .setDescription('Convertit une valeur entre deux unités (longueurs, masses, °C/°F, données, durées…)')
    .setDMPermission(false)
    .addNumberOption((option) => option.setName('valeur').setDescription('Valeur à convertir').setRequired(true))
    .addStringOption((option) =>
      option.setName('de').setDescription('Unité de départ (km, cm, °C, Go, mph…)').setRequired(true).setAutocomplete(true),
    )
    .addStringOption((option) =>
      option.setName('vers').setDescription('Unité d’arrivée (mi, in, °F, Mo, km/h…)').setRequired(true).setAutocomplete(true),
    ),
  category: 'utility',
  summary: 'Convertisseur d’unités',
  usage: ['/convertir valeur:42 de:km vers:mi', '/convertir valeur:20 de:c vers:f'],
  cooldown: 3,
  async run(ctx: CommandContext) {
    const value = ctx.number('valeur');
    const from = ctx.string('de');
    const to = ctx.string('vers');

    if (from === to) {
      return ctx.send(errorEmbed('L’unité de départ et celle d’arrivée sont identiques.', 'Conversion inutile'));
    }

    try {
      const { result, from: source, to: target } = convertUnits(value, from, to);
      const category = UNIT_CATEGORIES[source.category];

      const embed = baseEmbed({
        title: `${category.emoji} Conversion ${category.label.toLowerCase()}`,
        description: `**${formatNumber(value)} ${source.symbol} = ${formatNumber(result)} ${target.symbol}**`,
        color: THEME.colors.info,
        footer: `${source.label} → ${target.label}`,
      });

      // Tableau comparatif : mêmes conversions depuis la valeur de départ.
      const siblings = UNITS.filter((unit) => unit.category === source.category && unit.id !== source.id).slice(0, 8);
      embed.addFields({
        name: '📊 Équivalences',
        value: siblings
          .map((unit) => {
            const converted = convertUnits(value, source.id, unit.id);
            return `• ${formatNumber(converted.result)} ${unit.symbol}`;
          })
          .join('\n'),
        inline: true,
      });

      const reverse = convertUnits(result, target.id, source.id);
      embed.addFields(
        { name: '🔁 Conversion inverse', value: `1 ${target.symbol} = ${formatNumber(reverse.result / (value || 1))} ${source.symbol}`, inline: true },
        { name: '🧭 Catégorie', value: `${category.label} — base : ${category.base}`, inline: true },
      );

      return ctx.send(embed);
    } catch (error) {
      if (error instanceof Error && /catégories différentes/.test(error.message)) {
        throw new UsageError(error.message);
      }
      return ctx.send(
        errorEmbed(
          [
            error instanceof Error ? error.message : 'Conversion impossible.',
            '',
            '**Unités disponibles :**',
            ...Object.entries(UNIT_CATEGORIES).map(
              ([id, meta]) => `${meta.emoji} **${meta.label}** — ${describeUnits(id as UnitCategory)}`,
            ),
          ].join('\n'),
          'Conversion refusée',
        ),
      );
    }
  },

  /** Autocomplétion des unités (les 45 unités ne tiennent pas dans les 25 choix de Discord). */
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (!['de', 'vers'].includes(focused.name)) {
      await interaction.respond([]);
      return;
    }
    await interaction.respond(unitChoices(String(focused.value ?? '')));
  },
};

export { POPULAR };
export default convertCommand;
