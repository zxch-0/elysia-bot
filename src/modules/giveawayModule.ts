import { MessageFlags, type InteractionReplyOptions } from 'discord.js';
import type { InteractionModule } from '../core/types';
import type { ElysiaClient } from '../core/client';
import { logger } from '../core/logger';
import { giveawayService, checkEntryRequirements, computeTickets } from '../services/giveawayService';
import { guildService } from '../services/guildService';
import { canManageGiveaways } from '../utils/permissions';
import { baseEmbed, errorEmbed, THEME } from '../ui/embeds';
import { formatDuration, timestampTag } from '../utils/duration';
import { humanizeNumber, paginateText } from '../utils/format';

const log = logger.child('giveaway');

function ephemeral(payload: InteractionReplyOptions): InteractionReplyOptions {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

/** CustomIds : `gw:join|leave|list|reroll:<guildId>:<giveawayNumber>`. */
export const giveawayModule: InteractionModule = {
  prefix: 'gw',
  async handle(interaction, _client: ElysiaClient, args) {
    const [action] = args;
    const guild = interaction.guild;
    if (!guild) return;

    // Le message porteur permet de retrouver le giveaway même si le customId
    // contient un identifiant obsolète (message déplacé, redémarrage…).
    const fromMessage = interaction.message
      ? giveawayService.resolveFromMessage(guild.id, interaction.channelId ?? '', interaction.message.id)
      : undefined;
    const fromArgs =
      args[2] !== undefined ? giveawayService.get(`${args[1]}:${args[2]}`) : giveawayService.get(args[1] ?? '');
    const giveaway = fromMessage ?? fromArgs;

    if (!giveaway) {
      await interaction.reply(
        ephemeral({ embeds: [errorEmbed('Ce giveaway est introuvable (il a peut-être été supprimé de la base).')] }),
      );
      return;
    }

    const refreshMessage = async (updated = giveawayService.get(giveaway.id) ?? giveaway) => {
      const channel = guild.channels.cache.get(updated.channelId);
      if (!channel?.isTextBased() || !updated.messageId) return;
      const message = await channel.messages.fetch(updated.messageId).catch(() => null);
      await message
        ?.edit({ embeds: [giveawayService.buildEmbed(updated, guild)], components: giveawayService.buildComponents(updated) })
        .catch(() => undefined);
    };

    if (action === 'join') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const settings = guildService.get(guild.id);
      const member = await guild.members.fetch(interaction.user.id);
      const check = checkEntryRequirements(giveaway, member, settings);

      if (!check.ok) {
        await interaction.editReply({ embeds: [errorEmbed(check.reason, 'Participation refusée')] });
        return;
      }
      if (giveaway.ended) {
        await interaction.editReply({ embeds: [errorEmbed('Ce giveaway est déjà terminé.', 'Trop tard')] });
        return;
      }
      if (giveaway.entries.includes(member.id)) {
        await interaction.editReply({
          embeds: [
            baseEmbed({
              title: '🎟️ Déjà inscrit',
              description: `Vous participez déjà à **${giveaway.prize}**.\nTickets : **${computeTickets(giveaway, member)}**\nTirage ${timestampTag(giveaway.endsAt, 'R')}.`,
              color: THEME.colors.info,
            }),
          ],
        });
        return;
      }

      const updated = giveawayService.addEntry(giveaway.id, member.id);
      await refreshMessage(updated);

      const tickets = computeTickets(updated, member);
      await interaction.editReply({
        embeds: [
          baseEmbed({
            title: '🎉 Participation enregistrée !',
            description: [
              `**Lot :** ${updated.prize}`,
              `**Vos tickets :** ${tickets}${tickets > 1 ? ' 🍀 (bonus de rôles)' : ''}`,
              `**Participants :** ${humanizeNumber(updated.entries.length)}`,
              `**Tirage :** ${timestampTag(updated.endsAt, 'R')}`,
            ].join('\n'),
            color: THEME.colors.success,
          }),
        ],
      });
      return;
    }

    if (action === 'leave') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const updated = giveawayService.removeEntry(giveaway.id, interaction.user.id);
      await refreshMessage(updated);
      const wasIn = giveaway.entries.includes(interaction.user.id);
      await interaction.editReply({
        embeds: [
          baseEmbed({
            title: wasIn ? '🚪 Participation retirée' : 'ℹ️ Vous ne participiez pas',
            description: wasIn
              ? `Vous ne participez plus à **${updated.prize}**.`
              : `Vous n’étiez pas inscrit à **${updated.prize}**.\nCliquez sur **Participer** pour tenter votre chance !`,
            color: wasIn ? THEME.colors.warning : THEME.colors.info,
          }),
        ],
      });
      return;
    }

    if (action === 'list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const entries = giveaway.entries;
      const lines = entries.map((userId, index) => {
        const member = guild.members.cache.get(userId);
        const tickets = member ? computeTickets(giveaway, member) : 1;
        return `${String(index + 1).padStart(3, ' ')}. <@${userId}>${tickets > 1 ? ` — 🎟️ x${tickets}` : ''}`;
      });
      const pages = paginateText(lines, 3_000);
      await interaction.editReply({
        embeds: [
          baseEmbed({
            title: `🎟️ Participants — ${giveaway.prize}`,
            description:
              entries.length === 0
                ? '*Personne pour le moment… soyez le premier !*'
                : `${humanizeNumber(entries.length)} participant(s)\n\n${pages[0]}`,
            color: THEME.colors.giveaway,
            footer: pages.length > 1 ? `Page 1/${pages.length} • Liste tronquée` : undefined,
          }),
        ],
      });
      return;
    }

    if (action === 'reroll') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const member = await guild.members.fetch(interaction.user.id);
      const settings = guildService.get(guild.id);
      if (!canManageGiveaways(member, settings)) {
        await interaction.editReply({
          embeds: [errorEmbed('Seuls les administrateurs (ou les rôles hôtes configurés) peuvent relancer un giveaway.')],
        });
        return;
      }
      if (!giveaway.ended) {
        await interaction.editReply({ embeds: [errorEmbed('Ce giveaway n’est pas encore terminé.')] });
        return;
      }

      try {
        const winners = giveawayService.reroll(giveaway, guild, giveaway.winnerCount);
        const updated = giveawayService.get(giveaway.id)!;
        await refreshMessage(updated);

        await interaction.editReply({
          embeds: [
            baseEmbed({
              title: '🔄 Nouveau tirage effectué',
              description: winners.length
                ? winners.map((id) => `🎉 <@${id}> remporte **${updated.prize}** !`).join('\n')
                : '*Aucun participant restant pour un nouveau tirage.*',
              color: THEME.colors.giveaway,
            }),
          ],
        });

        const channel = guild.channels.cache.get(updated.channelId);
        if (channel?.isTextBased() && winners.length > 0) {
          await channel
            .send({
              content: `🔄 Nouveau tirage pour **${updated.prize}** : ${winners.map((id) => `<@${id}>`).join(', ')} 🎉`,
              allowedMentions: { parse: ['users'] },
            })
            .catch(() => undefined);
        }
        log.info(`Reroll du giveaway ${updated.id} par ${member.user.tag}`);
      } catch (error) {
        log.warn('Reroll impossible', error);
        await interaction.editReply({ embeds: [errorEmbed('Impossible de relancer : plus assez de participants.')] });
      }
      return;
    }

    log.warn(`Action de giveaway inconnue : ${args.join(':')}`);
  },
};

export { formatDuration };
