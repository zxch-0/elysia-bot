import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { moderationService } from '../../services/moderationService';

const kickCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse un membre du serveur (il peut revenir avec une invitation)')
    .addUserOption((option) => option.setName('membre').setDescription('Le membre à expulser').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Raison de l’expulsion').setMaxLength(480))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),
  category: 'moderation',
  summary: 'Expulsion d’un membre',
  usage: ['/kick membre:@Léo raison:comportement irrespectueux'],
  permissions: { user: [PermissionFlagsBits.KickMembers], bot: [PermissionFlagsBits.KickMembers] },
  cooldown: 4,
  async run(ctx: CommandContext) {
    const target = ctx.memberOf('membre');
    const reason = ctx.interaction.options.getString('raison') ?? 'Aucune raison fournie';

    const result = await moderationService.kick({
      guild: ctx.guild,
      moderator: ctx.interaction.user,
      moderatorMember: ctx.member,
      target,
      reason,
    });

    return ctx.success('Expulsion effectuée', result.message);
  },
};

export default kickCommand;
