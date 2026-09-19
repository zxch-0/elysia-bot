import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { successEmbed } from '../../ui/embeds';
import { formatDuration } from '../../utils/duration';

/** Active ou désactive le mode lent d'un salon. */
const slowmodeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Définit le mode lent d’un salon (0 pour le désactiver)')
    .addIntegerOption((option) =>
      option
        .setName('secondes')
        .setDescription('Délai entre deux messages (0 = désactivé)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21_600),
    )
    .addChannelOption((option) =>
      option.setName('salon').setDescription('Salon ciblé (par défaut : salon courant)').addChannelTypes(ChannelType.GuildText),
    )
    .addStringOption((option) => option.setName('raison').setDescription('Motif').setMaxLength(300))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),
  category: 'moderation',
  summary: 'Mode lent d’un salon',
  usage: ['/slowmode secondes:10 raison:calmer le débat'],
  permissions: { user: [PermissionFlagsBits.ManageChannels], bot: [PermissionFlagsBits.ManageChannels] },
  cooldown: 3,
  async run(ctx: CommandContext) {
    const seconds = ctx.integer('secondes');
    const channel =
      (ctx.interaction.options.getChannel('salon') as import('discord.js').TextChannel | null) ??
      (ctx.interaction.channel as import('discord.js').TextChannel);
    const reason = ctx.interaction.options.getString('raison') ?? 'Ajustement du mode lent';

    await channel.setRateLimitPerUser(seconds, `${ctx.interaction.user.tag} : ${reason}`);

    return ctx.send(
      successEmbed(
        seconds === 0 ? 'Mode lent désactivé' : 'Mode lent activé',
        seconds === 0
          ? `<#${channel.id}> : les membres peuvent écrire librement.`
          : `<#${channel.id}> : un message toutes les **${formatDuration(seconds * 1000) === '0 s' ? `${seconds} s` : formatDuration(seconds * 1000)}**.`,
      ),
    );
  },
};

export default slowmodeCommand;
