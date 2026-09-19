import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type Message } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { moderationService } from '../../services/moderationService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { humanizeNumber } from '../../utils/format';

/**
 * Nettoyage de messages en masse, avec filtres intelligents
 * (bots, images, liens, épinglés, membre précis).
 */
const purgeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Supprime des messages en masse dans un salon')
    .addIntegerOption((option) =>
      option.setName('nombre').setDescription('Nombre de messages à examiner (1-1000)').setRequired(true).setMinValue(1).setMaxValue(1000),
    )
    .addUserOption((option) => option.setName('membre').setDescription('Ne supprimer que les messages de ce membre'))
    .addStringOption((option) =>
      option
        .setName('filtre')
        .setDescription('Filtre appliqué aux messages')
        .addChoices(
          { name: 'Tous les messages', value: 'tous' },
          { name: 'Messages des bots', value: 'bots' },
          { name: 'Messages des humains', value: 'humains' },
          { name: 'Messages avec image', value: 'images' },
          { name: 'Messages avec lien', value: 'liens' },
          { name: 'Messages avec invite Discord', value: 'invitations' },
        ),
    )
    .addChannelOption((option) =>
      option.setName('salon').setDescription('Salon ciblé (par défaut : salon courant)').addChannelTypes(ChannelType.GuildText),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),
  category: 'moderation',
  summary: 'Purge de messages avec filtres',
  usage: ['/purge nombre:100 filtre:bots', '/purge nombre:50 membre:@Léo'],
  permissions: { user: [PermissionFlagsBits.ManageMessages], bot: [PermissionFlagsBits.ManageMessages] },
  cooldown: 5,
  async run(ctx: CommandContext) {
    const amount = ctx.integer('nombre');
    const channel = ctx.channel('salon', undefined, [ChannelType.GuildText]) as import('discord.js').TextChannel;
    const target = ctx.interaction.options.getUser('membre');
    const filterName = ctx.interaction.options.getString('filtre') ?? 'tous';

    const predicates: Record<string, (message: Message) => boolean> = {
      tous: () => true,
      bots: (message) => message.author.bot,
      humains: (message) => !message.author.bot,
      images: (message) => message.attachments.some((attachment) => /image|video/.test(attachment.contentType ?? '')),
      liens: (message) => /https?:\/\//i.test(message.content),
      invitations: (message) => /(discord\.gg|discord(?:app)?\.com\/invite)\//i.test(message.content),
    };

    const filter = (message: Message): boolean => {
      if (message.pinned && filterName === 'tous') return false;
      if (target && message.author.id !== target.id) return false;
      return (predicates[filterName] ?? predicates.tous)(message);
    };

    const targetChannel = channel ?? (ctx.interaction.channel as import('discord.js').TextChannel);
    const { deleted, caseEntry } = await moderationService.purge({
      channel: targetChannel,
      moderator: ctx.interaction.user,
      amount,
      filter,
    });

    return ctx.send(
      baseEmbed({
        title: '🧽 Purge terminée',
        description: [
          `**Messages supprimés :** ${humanizeNumber(deleted)} / ${humanizeNumber(amount)} examinés`,
          `**Salon :** <#${targetChannel.id}>`,
          `**Filtre :** \`${filterName}\`${target ? ` • auteur : <@${target.id}>` : ''}`,
          '',
          `*Case #${caseEntry.caseNumber} — les messages de plus de 14 jours ne peuvent pas être supprimés en masse par Discord.*`,
        ].join('\n'),
        color: THEME.colors.success,
      }),
    );
  },
};

export default purgeCommand;
