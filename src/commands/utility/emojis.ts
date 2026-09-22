import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { bulletList, chunk, humanizeNumber, truncate } from '../../utils/format';

/**
 * Inventaire des émojis et stickers du serveur, avec le nombre d'utilisations
 * recensées par Discord — pratique pour faire le ménage ou repérer les émojis
 * jamais utilisés.
 */
const emojisCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('emojis')
    .setDescription('Inventaire des émojis et stickers du serveur (tri, recherche, usages)')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Éléments à afficher')
        .addChoices(
          { name: '😀 Émojis', value: 'emojis' },
          { name: '🏷️ Stickers', value: 'stickers' },
          { name: '📦 Les deux', value: 'tous' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('tri')
        .setDescription('Ordre d’affichage')
        .addChoices(
          { name: '🏆 Utilisations', value: 'usages' },
          { name: '🔤 Nom', value: 'nom' },
          { name: '🕒 Date d’ajout', value: 'date' },
        ),
    )
    .addStringOption((option) => option.setName('recherche').setDescription('Filtrer sur une partie du nom').setMaxLength(40))
    .addIntegerOption((option) => option.setName('page').setDescription('Page à afficher').setMinValue(1)),
  category: 'utility',
  summary: 'Émojis et stickers du serveur',
  usage: ['/emojis tri:nom', '/emojis type:stickers'],
  cooldown: 5,
  async run(ctx: CommandContext) {
    const type = (ctx.interaction.options.getString('type') ?? 'tous') as 'emojis' | 'stickers' | 'tous';
    const sort = (ctx.interaction.options.getString('tri') ?? 'date') as 'nom' | 'date';
    const search = ctx.interaction.options.getString('recherche')?.toLowerCase() ?? null;
    const page = Math.max((ctx.interaction.options.getInteger('page') ?? 1) - 1, 0);

    const emojis = [...ctx.guild.emojis.cache.values()];
    const stickers = [...ctx.guild.stickers.cache.values()];

    const lines: string[] = [];

    if (type === 'emojis' || type === 'tous') {
      const matching = emojis.filter((emoji) => !search || emoji.name?.toLowerCase().includes(search));
      const sorted =
        sort === 'nom'
          ? [...matching].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'fr'))
          : [...matching].sort((a, b) => (b.createdTimestamp ?? 0) - (a.createdTimestamp ?? 0));

      for (const emoji of sorted) {
        const animated = emoji.animated ? ' ✨' : '';
        const author = emoji.author ? `par ${truncate(emoji.author.tag, 24)}` : 'auteur inconnu';
        lines.push(`${emoji.toString()} \`:${emoji.name}:\`${animated} • ${author}`);
      }
    }

    if (type === 'stickers' || type === 'tous') {
      const matching = stickers.filter((sticker) => !search || sticker.name.toLowerCase().includes(search));
      for (const sticker of matching) {
        lines.push(`🏷️ **${truncate(sticker.name, 32)}** • \`${sticker.id}\` • format ${sticker.format ?? 'inconnu'}`);
      }
    }

    const groups = chunk(lines, 12);
    const current = groups[Math.min(page, Math.max(groups.length - 1, 0))] ?? [];

    const animated = emojis.filter((emoji) => emoji.animated).length;
    const embed = baseEmbed({
      title: `😀 Émojis & stickers de ${ctx.guild.name}`,
      description: [
        `**${humanizeNumber(emojis.length)}** émoji(s) (dont **${animated}** animé(s)) • **${humanizeNumber(stickers.length)}** sticker(s)`,
        `Slots restants : ${Math.max(50 - emojis.filter((emoji) => !emoji.animated).length, 0)} statique(s) / ${Math.max(50 - animated, 0)} animé(s) *(selon le niveau de boost)*`,
        '',
        bulletList(current, { max: 12 }),
      ].join('\n'),
      color: THEME.colors.primary,
      thumbnail: ctx.guild.iconURL({ size: 128 }),
      footer: `Page ${page + 1}/${Math.max(groups.length, 1)} • ${humanizeNumber(lines.length)} élément(s) affiché(s)`,
    });

    return ctx.send(embed);
  },
};

export default emojisCommand;
