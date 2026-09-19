import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { moderationService } from '../../services/moderationService';
import { successEmbed } from '../../ui/embeds';
import { plural } from '../../utils/format';

const unmuteCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Retire immédiatement le mute (timeout et/ou rôle muet) d’un membre')
    .addUserOption((option) => option.setName('membre').setDescription('Le membre à libérer').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Motif de la levée').setMaxLength(480))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
  category: 'moderation',
  summary: 'Levée d’un mute ou d’un timeout',
  usage: ['/unmute membre:@Léo raison:excuses acceptées'],
  permissions: { user: [PermissionFlagsBits.ModerateMembers], bot: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageRoles] },
  cooldown: 3,
  async run(ctx: CommandContext) {
    const target = ctx.memberOf('membre');
    const reason = ctx.interaction.options.getString('raison');

    const { cases } = await moderationService.unmute({
      guild: ctx.guild,
      moderator: ctx.interaction.user,
      target,
      reason,
    });

    return ctx.send(
      successEmbed(
        'Mute levé',
        [
          `**${target.user.tag}** n’est plus réduit au silence.`,
          `${cases.length} ${plural(cases.length, 'case')} mise(s) à jour : ${cases.map((entry) => `#${entry.caseNumber}`).join(', ')}`,
        ].join('\n'),
      ),
    );
  },
};

export default unmuteCommand;
