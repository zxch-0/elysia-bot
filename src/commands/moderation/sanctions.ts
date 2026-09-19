import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { caseService } from '../../services/caseService';
import { SANCTION_META } from '../../services/moderationService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { humanizeNumber, bulletList } from '../../utils/format';
import { timestampTag } from '../../utils/duration';

/** Consulte l'historique de modération d'un membre. */
const sanctionsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('sanctions')
    .setDescription('Affiche l’historique de modération d’un membre')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à consulter').setRequired(true))
    .addBooleanOption((option) => option.setName('detaille').setDescription('Afficher les détails de chaque sanction'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
  category: 'moderation',
  summary: 'Casier judiciaire d’un membre',
  usage: ['/sanctions membre:@Léo detaille:true'],
  permissions: { user: [PermissionFlagsBits.ModerateMembers] },
  cooldown: 4,
  async run(ctx: CommandContext) {
    const target = ctx.memberOf('membre');
    const detailed = ctx.interaction.options.getBoolean('detaille') ?? false;
    const entries = caseService.listUser(ctx.guild.id, target.id);

    const grouped = entries.reduce<Record<string, number>>((accumulator, entry) => {
      accumulator[entry.type] = (accumulator[entry.type] ?? 0) + 1;
      return accumulator;
    }, {});

    const embed = baseEmbed({
      title: `📁 Historique de ${target.user.tag}`,
      color: entries.length > 0 ? THEME.colors.warning : THEME.colors.success,
      thumbnail: target.user.displayAvatarURL({ size: 256 }),
      footer: `Identifiant : ${target.id}`,
    });

    embed.addFields({
      name: 'Résumé',
      value: entries.length === 0
        ? '✨ Aucune sanction enregistrée — casier vierge.'
        : `${humanizeNumber(entries.length)} sanction(s) :\n${bulletList(
            Object.entries(grouped).map(([type, count]) => `${SANCTION_META[type]?.emoji ?? '•'} ${SANCTION_META[type]?.label ?? type} : **${count}**`),
          )}`,
    });

    if (detailed && entries.length > 0) {
      embed.addFields({
        name: 'Détail des dernières sanctions',
        value: entries
          .slice(0, 8)
          .map(
            (entry) =>
              `**#${entry.caseNumber}** ${SANCTION_META[entry.type]?.emoji ?? '•'} ${SANCTION_META[entry.type]?.label ?? entry.type}` +
              ` — ${timestampTag(entry.createdAt, 'R')}\n┕ par **${entry.moderatorTag}** : ${entry.reason.slice(0, 120)}`,
          )
          .join('\n')
          .slice(0, 1024),
      });
    }

    const activeWarnings = caseService.countActiveWarnings(ctx.guild.id, target.id);
    embed.addFields({
      name: 'Statut actuel',
      value: [
        `Avertissements actifs : **${activeWarnings}**`,
        `Timeout en cours : **${target.isCommunicationDisabled() ? `oui (jusqu’à ${target.communicationDisabledUntil ? timestampTag(target.communicationDisabledUntil, 'R') : '?'})` : 'non'}**`,
        `Compte créé : ${timestampTag(target.user.createdTimestamp, 'R')}`,
        `A rejoint : ${target.joinedTimestamp ? timestampTag(target.joinedTimestamp, 'R') : 'inconnu'}`,
      ].join('\n'),
    });

    const rows = [
      ...(await import('../../ui/components')).buttonRows([
        { id: `case:audit:${ctx.guild.id}:${target.id}`, label: 'Audit complet', emoji: '🔎', style: 'primary' },
        { id: `case:view:${ctx.guild.id}:${entries[0]?.caseNumber ?? 0}`, label: 'Dernière case', emoji: '📄', style: 'secondary', disabled: entries.length === 0 },
      ]),
    ];

    return ctx.send(embed, rows);
  },
};

export default sanctionsCommand;
