import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { moderationService } from '../../services/moderationService';
import { baseEmbed, THEME, warningEmbed } from '../../ui/embeds';
import { guildService } from '../../services/guildService';

/**
 * Avertissement : ajoute une case, notifie l'auteur par MP et déclenche
 * automatiquement le seuil configuré (`/config seuils`) si atteint.
 */
const warnCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avertit un membre (les seuils de sanctions automatiques s’appliquent)')
    .addUserOption((option) => option.setName('membre').setDescription('Le membre à avertir').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Motif de l’avertissement').setRequired(true).setMaxLength(480))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
  category: 'moderation',
  summary: 'Avertissement + sanctions automatiques par palier',
  usage: ['/warn membre:@Léo raison:langage inapproprié'],
  permissions: { user: [PermissionFlagsBits.ModerateMembers] },
  cooldown: 3,
  async run(ctx: CommandContext) {
    const target = ctx.memberOf('membre');
    const reason = ctx.string('raison');

    const result = await moderationService.warn({
      guild: ctx.guild,
      moderator: ctx.interaction.user,
      moderatorMember: ctx.member,
      target,
      reason,
    });

    const settings = guildService.get(ctx.guild.id);
    const nextThreshold = settings.warnings.thresholds
      .filter((entry) => entry.count > result.totalWarnings)
      .sort((a, b) => a.count - b.count)[0];

    const embed = baseEmbed({
      title: '⚠️ Avertissement enregistré',
      description: result.message,
      color: THEME.colors.warning,
      footer: nextThreshold
        ? `Prochain palier : ${nextThreshold.count} avertissements → ${nextThreshold.action}`
        : 'Aucun palier de sanction configuré au-delà',
    });

    embed.addFields({
      name: 'Historique du membre',
      value: [
        `**${result.totalWarnings}** avertissement(s) au total`,
        result.triggered ? `🚨 Sanction automatique déclenchée : **${result.triggered}**` : 'Aucune sanction automatique déclenchée',
      ].join('\n'),
    });

    if (result.triggered) {
      await ctx.interaction.followUp({
        embeds: [warningEmbed('Sanction automatique appliquée', `Le seuil de **${result.totalWarnings} avertissements** a déclenché : **${result.triggered}**.`)],
      });
    }

    return ctx.send(embed);
  },
};

export default warnCommand;
