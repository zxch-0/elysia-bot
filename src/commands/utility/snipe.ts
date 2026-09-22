import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME, warningEmbed } from '../../ui/embeds';
import { snipeService } from '../../services/snipeService';
import { timestampTag } from '../../utils/duration';
import { truncate } from '../../utils/format';

/**
 * Retrouve le dernier message supprimé (ou modifié) du salon — indispensable
 * quand un membre efface une insulte avant que le staff ne voie le message.
 * Les données ne vivent qu'en mémoire (30 minutes) : rien n'est écrit sur disque.
 */
const snipeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('snipe')
    .setDescription('Affiche le dernier message supprimé ou modifié dans ce salon')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Type d’événement à retrouver')
        .addChoices({ name: '🗑️ Message supprimé', value: 'supprime' }, { name: '✏️ Message modifié', value: 'modifie' }),
    )
    .addIntegerOption((option) => option.setName('position').setDescription('0 = le plus récent, 1 = le précédent…').setMinValue(0).setMaxValue(9))
    .addBooleanOption((option) => option.setName('historique').setDescription('Lister les 10 derniers événements du salon'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  category: 'utility',
  summary: 'Dernier message supprimé/modifié',
  usage: ['/snipe', '/snipe type:modifie position:1', '/snipe historique:true'],
  permissions: { user: [PermissionFlagsBits.ManageMessages] },
  cooldown: 3,
  async run(ctx: CommandContext) {
    const kind = (ctx.interaction.options.getString('type') ?? 'supprime') as 'supprime' | 'modifie';
    const index = ctx.interaction.options.getInteger('position') ?? 0;
    const withHistory = ctx.interaction.options.getBoolean('historique') ?? false;

    if (withHistory) {
      const history = snipeService.history(ctx.interaction.channelId);
      if (history.length === 0) {
        return ctx.send(warningEmbed('Rien à afficher', 'Aucun message supprimé ou modifié n’a été détecté dans ce salon (mémoire de 30 minutes).'));
      }
      const embed = baseEmbed({
        title: '🕵️ Historique du salon',
        description: history
          .slice(0, 10)
          .map(
            (entry, position) =>
              `**${position + 1}.** ${entry.kind === 'supprime' ? '🗑️' : '✏️'} **${entry.authorTag}** ${timestampTag(entry.occurredAt, 'R')}\n┕ ${truncate(entry.content.replace(/\n/g, ' '), 120) || '*pièce jointe*'}`,
          )
          .join('\n'),
        color: THEME.colors.primary,
        footer: `${history.length} événement(s) en mémoire pour ce salon`,
      });
      return ctx.send(embed);
    }

    const entry = snipeService.last(ctx.interaction.channelId, kind, index);
    if (!entry) {
      return ctx.send(
        warningEmbed(
          'Rien à afficher',
          `Aucun message **${kind === 'supprime' ? 'supprimé' : 'modifié'}** mémorisé ici.\nLe bot ne garde que les **30 dernières minutes** et uniquement les messages qu’il a vus passer.`,
        ),
      );
    }

    const embed = baseEmbed({
      title: kind === 'supprime' ? '🗑️ Message supprimé' : '✏️ Message modifié',
      description: entry.content ? truncate(entry.content, 3_000) : '*contenu non disponible (message non mis en cache)*',
      color: kind === 'supprime' ? THEME.colors.error : THEME.colors.warning,
      thumbnail: entry.authorAvatar,
      footer: `${entry.authorTag} • ${entry.kind} ${timestampTag(entry.occurredAt, 'R')} • ${index === 0 ? 'le plus récent' : `position ${index}`}`,
    });

    embed.addFields(
      { name: 'Auteur', value: `<@${entry.authorId}> (\`${entry.authorId}\`)`, inline: true },
      { name: 'Envoyé', value: timestampTag(entry.createdAt, 'R'), inline: true },
      { name: 'Salon', value: `<#${entry.channelId}>`, inline: true },
    );

    if (entry.kind === 'modifie') {
      embed.addFields({ name: 'Nouveau contenu', value: truncate(entry.after ?? '*vide*', 1_000) });
    }
    if (entry.attachments > 0) {
      embed.addFields({ name: '📎 Pièces jointes', value: `${entry.attachments} fichier(s) supprimé(s) avec le message.`, inline: true });
    }

    return ctx.send(embed);
  },
};

export default snipeCommand;
