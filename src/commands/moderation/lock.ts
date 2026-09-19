import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { moderationService } from '../../services/moderationService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { humanizeNumber } from '../../utils/format';
import { confirmRow } from '../../ui/components';
import { registerConfirmation } from '../../modules/confirmationModule';
import { shortCode } from '../../utils/random';

/** Verrouillage / déverrouillage de salons (unitaire ou global). */
const lockCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Verrouille ou déverrouille un salon (ou tout le serveur)')
    .addSubcommand((sub) =>
      sub
        .setName('verrouiller')
        .setDescription('Empêche @everyone d’écrire dans un salon')
        .addChannelOption((option) => option.setName('salon').setDescription('Salon à verrouiller').addChannelTypes(ChannelType.GuildText))
        .addStringOption((option) => option.setName('raison').setDescription('Motif du verrouillage').setMaxLength(300)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('deverrouiller')
        .setDescription('Rétablit l’écriture pour @everyone')
        .addChannelOption((option) => option.setName('salon').setDescription('Salon à déverrouiller').addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('tout')
        .setDescription('Verrouille TOUS les salons textuels du serveur (confirmation requise)')
        .addStringOption((option) => option.setName('raison').setDescription('Motif (ex. raid, incident)').setMaxLength(300)),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),
  category: 'moderation',
  summary: 'Verrouillage de salons',
  usage: ['/lock verrouiller salon:#général raison:raid', '/lock tout raison:raid en cours'],
  permissions: { user: [PermissionFlagsBits.ManageChannels], bot: [PermissionFlagsBits.ManageChannels] },
  cooldown: 5,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'verrouiller';

    if (sub === 'verrouiller' || sub === 'deverrouiller') {
      const channel =
        (ctx.interaction.options.getChannel('salon') as import('discord.js').TextChannel | null) ??
        (ctx.interaction.channel as import('discord.js').TextChannel);
      const reason = ctx.interaction.options.getString('raison');

      if (sub === 'verrouiller') {
        await moderationService.lock({ guild: ctx.guild, channel, moderator: ctx.interaction.user, reason });
      } else {
        await moderationService.unlock({ guild: ctx.guild, channel, moderator: ctx.interaction.user, reason });
      }

      return ctx.send(
        baseEmbed({
          title: sub === 'verrouiller' ? '🔒 Salon verrouillé' : '🔓 Salon déverrouillé',
          description: [
            `**Salon :** <#${channel.id}>`,
            `**Par :** ${ctx.interaction.user}`,
            sub === 'verrouiller' ? '`@everyone` ne peut plus écrire ici.' : '`@everyone` peut de nouveau écrire ici.',
            reason ? `**Raison :** ${reason}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          color: sub === 'verrouiller' ? THEME.colors.error : THEME.colors.success,
        }),
      );
    }

    // Verrouillage global
    const reason = ctx.interaction.options.getString('raison') ?? 'Verrouillage global';
    const channels = ctx.guild.channels.cache.filter(
      (channel) => channel.type === ChannelType.GuildText && channel.permissionsFor(ctx.guild.roles.everyone)?.has(PermissionFlagsBits.SendMessages),
    );

    const token = shortCode(10);
    registerConfirmation(token, {
      userId: ctx.interaction.user.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + 90_000,
      cancelMessage: 'Aucun salon n’a été modifié.',
      onConfirm: async (buttonInteraction) => {
        let locked = 0;
        for (const channel of [...channels.values()].slice(0, 40)) {
          try {
            await moderationService.lock({
              guild: ctx.guild,
              channel: channel as import('discord.js').TextChannel,
              moderator: ctx.interaction.user,
              reason,
            });
            locked += 1;
          } catch {
            /* on continue même si un salon échoue */
          }
        }
        await buttonInteraction.editReply({
          embeds: [
            baseEmbed({
              title: '🔒 Verrouillage global terminé',
              description: `${humanizeNumber(locked)} salon(s) verrouillé(s).\nUtilisez \`/lock deverrouiller\` sur chaque salon, ou \`/unlockall\` (module premium), pour tout rouvrir.`,
              color: THEME.colors.error,
            }),
          ],
          components: [],
        });
      },
    });

    return ctx.interaction.editReply({
      embeds: [
        baseEmbed({
          title: '⚠️ Confirmation — verrouillage global',
          description: [
            `Vous allez verrouiller **${humanizeNumber(channels.size)}** salon(s) textuel(s) (40 maximum par exécution).`,
            '',
            `**Raison :** ${reason}`,
            '',
            'Les membres ne pourront plus écrire avant déverrouillage manuel. Confirmez-vous ?',
          ].join('\n'),
          color: THEME.colors.warning,
        }),
      ],
      components: [confirmRow(token, { yes: 'Verrouiller tout', no: 'Annuler' })],
    });
  },
};

export default lockCommand;
