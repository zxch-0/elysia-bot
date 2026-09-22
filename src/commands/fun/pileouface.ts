import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { flipCoins, type CoinSide } from '../../utils/dice';
import { humanizeNumber, percent } from '../../utils/format';

const SIDE_STYLES: Record<CoinSide, { emoji: string; label: string }> = {
  pile: { emoji: '🪙', label: 'Pile' },
  face: { emoji: '👑', label: 'Face' },
};

/** Représentation visuelle d'une série de lancers. */
function renderSeries(sides: CoinSide[]): string {
  return sides.map((side) => SIDE_STYLES[side].emoji).join(' ');
}

/**
 * Pile ou face : pari sur un côté, plusieurs lancers, série de victoires et
 * répartition. Le tirage utilise le générateur aléatoire cryptographique.
 */
const coinCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('pile-ou-face')
    .setDescription('Lance une pièce : pariez sur pile ou face (plusieurs lancers possibles)')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('pari')
        .setDescription('Votre pari')
        .addChoices({ name: '🪙 Pile', value: 'pile' }, { name: '👑 Face', value: 'face' }),
    )
    .addIntegerOption((option) => option.setName('lancers').setDescription('Nombre de lancers (1-50)').setMinValue(1).setMaxValue(50)),
  category: 'fun',
  summary: 'Pile ou face (avec paris)',
  usage: ['/pile-ou-face', '/pile-ou-face pari:face lancers:10'],
  cooldown: 3,
  async run(ctx: CommandContext) {
    const bet = ctx.interaction.options.getString('pari') as CoinSide | null;
    const count = ctx.interaction.options.getInteger('lancers') ?? 1;
    const sides = flipCoins(count);

    const pile = sides.filter((side) => side === 'pile').length;
    const face = sides.length - pile;
    const last = sides[sides.length - 1];
    const wins = bet ? sides.filter((side) => side === bet).length : null;

    const title = count === 1 ? `${SIDE_STYLES[last].emoji} ${SIDE_STYLES[last].label} !` : `🪙 ${humanizeNumber(count)} lancers`;
    const color = bet ? (wins && wins > count / 2 ? THEME.colors.success : THEME.colors.warning) : THEME.colors.primary;

    const embed = baseEmbed({
      title,
      description: [
        count > 1 ? renderSeries(sides.slice(0, 30)) + (sides.length > 30 ? ` … (+${sides.length - 30})` : '') : `La pièce est tombée sur **${SIDE_STYLES[last].label}** !`,
        '',
        count > 1 ? `Résultat final : ${SIDE_STYLES[last].emoji} **${SIDE_STYLES[last].label}**` : '',
      ]
        .filter((line) => line !== '')
        .join('\n'),
      color,
      footer: bet ? `Pari de ${ctx.interaction.user.tag} : ${SIDE_STYLES[bet].label}` : `Lancé par ${ctx.interaction.user.tag}`,
    });

    embed.addFields(
      { name: '🪙 Pile', value: `${humanizeNumber(pile)} (${percent(pile, count)})`, inline: true },
      { name: '👑 Face', value: `${humanizeNumber(face)} (${percent(face, count)})`, inline: true },
    );

    if (bet && wins !== null) {
      const verdict =
        wins > count / 2
          ? `🎉 Vous gagnez votre pari (${wins}/${count}) !`
          : wins === count / 2
            ? `🤝 Égalité parfaite (${wins}/${count}).`
            : `😅 Pari perdu (${wins}/${count}) — retentez votre chance !`;
      embed.addFields({ name: '🎯 Verdict', value: verdict });
    }

    return ctx.send(embed);
  },
};

export default coinCommand;
