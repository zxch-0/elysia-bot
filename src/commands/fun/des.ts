import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { DiceError, MAX_DICE, rollDice, rollGrade, type DiceRollResult } from '../../utils/dice';
import { humanizeNumber, percent } from '../../utils/format';

/** Affiche un lancer : dés individuels, modificateur, total et appréciation. */
function renderRoll(result: DiceRollResult, index?: number): string {
  const detail = result.rolls.flat().join(' + ');
  const grade = rollGrade(result);
  const prefix = index !== undefined ? `**Lancer ${index + 1}** — ` : '';
  return `${prefix}\`${result.notation}\` → ${detail || '0'}${result.modifier !== 0 ? ` ${result.modifier > 0 ? '+' : '−'} ${Math.abs(result.modifier)}` : ''} = **${humanizeNumber(result.total)}** ${grade.emoji} *${grade.label}*`;
}

/**
 * Lancer de dés complet : notation classique (`2d6+3`, `4d6`, `d100`),
 * plusieurs lancers d'un coup, seuil de réussite et statistiques.
 */
const diceCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('des')
    .setDescription('Lance des dés (notation 2d6+3, d20, 4d6…) avec statistiques')
    .setDMPermission(false)
    .addStringOption((option) => option.setName('notation').setDescription('Notation des dés, ex. 2d6+3 (d20 par défaut)').setMaxLength(40))
    .addIntegerOption((option) => option.setName('lancers').setDescription('Nombre de lancers (1-10)').setMinValue(1).setMaxValue(10))
    .addIntegerOption((option) => option.setName('seuil').setDescription('Seuil de réussite : compte les lancers ≥ cette valeur').setMinValue(1).setMaxValue(10_000))
    .addBooleanOption((option) => option.setName('prive').setDescription('Résultat visible seulement par vous')),
  category: 'fun',
  summary: 'Lanceur de dés avancé',
  usage: ['/des notation:2d6+3', '/des notation:4d6 lancers:6 seuil:15'],
  cooldown: 3,
  async run(ctx: CommandContext) {
    const notation = ctx.interaction.options.getString('notation') ?? 'd20';
    const count = ctx.interaction.options.getInteger('lancers') ?? 1;
    const threshold = ctx.interaction.options.getInteger('seuil');
    const isPrivate = ctx.interaction.options.getBoolean('prive') ?? false;

    let results: DiceRollResult[];
    try {
      results = Array.from({ length: count }, () => rollDice(notation));
    } catch (error) {
      if (error instanceof DiceError) {
        return ctx.error(
          [
            `**${error.message}**`,
            '',
            '**Formats valides :**',
            '• `d20` — un dé à 20 faces',
            '• `2d6+3` — deux dés à 6 faces plus 3',
            '• `4d6` — quatre dés à 6 faces',
            '• `1d100-5` — dé à 100 faces moins 5',
            `• Maximum ${MAX_DICE} dés par groupe.`,
          ].join('\n'),
          'Notation invalide',
        );
      }
      throw error;
    }

    const total = results.reduce((sum, result) => sum + result.total, 0);
    const best = results.reduce((max, result) => Math.max(max, result.total), Number.NEGATIVE_INFINITY);
    const worst = results.reduce((min, result) => Math.min(min, result.total), Number.POSITIVE_INFINITY);
    const successThreshold = threshold ?? null;
    const successes = successThreshold !== null ? results.filter((result) => result.total >= successThreshold).length : null;

    const embed = baseEmbed({
      title: `🎲 ${notation} — ${count > 1 ? `${humanizeNumber(count)} lancers` : 'lancer unique'}`,
      description: results.slice(0, 10).map((result, index) => renderRoll(result, count > 1 ? index : undefined)).join('\n'),
      color: results[0].total >= (results[0].max + results[0].min) / 2 ? THEME.colors.success : THEME.colors.primary,
      footer: isPrivate ? 'Résultat privé' : `Lancé par ${ctx.interaction.user.tag}`,
    });

    embed.addFields({
      name: '📊 Statistiques',
      value: [
        count > 1 ? `Total : **${humanizeNumber(total)}** • moyenne : ${(total / count).toFixed(1)}` : `Total : **${humanizeNumber(results[0].total)}**`,
        count > 1 ? `Meilleur : ${humanizeNumber(best)} • pire : ${humanizeNumber(worst)}` : `Intervalle possible : ${humanizeNumber(results[0].min)} → ${humanizeNumber(results[0].max)}`,
        successes !== null && successThreshold !== null
          ? `✅ Réussites (≥ ${humanizeNumber(successThreshold)}) : **${successes}/${count}** (${percent(successes, count)})`
          : '',
      ]
        .filter((line) => line !== '')
        .join('\n'),
    });

    if (count > 1 && results.length > 10) {
      embed.addFields({ name: 'ℹ️ Note', value: 'Seuls les 10 premiers lancers sont détaillés, les statistiques portent sur tous.' });
    }

    return ctx.send(embed);
  },
};

export default diceCommand;
