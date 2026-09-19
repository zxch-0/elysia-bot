import { AttachmentBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { caseService, type CaseType } from '../../services/caseService';
import { SANCTION_META } from '../../services/moderationService';
import { baseEmbed, modActionEmbed, THEME } from '../../ui/embeds';
import { humanizeNumber, bulletList } from '../../utils/format';
import { timestampTag } from '../../utils/duration';
import { confirmRow } from '../../ui/components';
import { registerConfirmation } from '../../modules/confirmationModule';
import { shortCode } from '../../utils/random';

/** Gestion complète des cases de modération (liste, détail, suppression, export). */
const casesCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('cases')
    .setDescription('Consulte et gère les cases de modération du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('liste')
        .setDescription('Liste les dernières cases du serveur')
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('Filtrer par type de sanction')
            .addChoices(
              { name: 'Bannissements', value: 'ban' },
              { name: 'Expulsions', value: 'kick' },
              { name: 'Timeouts / Mutes', value: 'mute' },
              { name: 'Avertissements', value: 'warn' },
              { name: 'Débannissements', value: 'unban' },
            ),
        )
        .addUserOption((option) => option.setName('membre').setDescription('Filtrer sur un membre précis')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('detail')
        .setDescription('Affiche le détail d’une case')
        .addIntegerOption((option) => option.setName('numero').setDescription('Numéro de la case').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('supprimer')
        .setDescription('Supprime définitivement une case (réservé aux administrateurs)')
        .addIntegerOption((option) => option.setName('numero').setDescription('Numéro de la case').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sub) => sub.setName('exporter').setDescription('Exporte toutes les cases du serveur en JSON')),
  category: 'moderation',
  summary: 'Gestion des cases de modération',
  usage: ['/cases liste type:warn', '/cases detail numero:12', '/cases exporter'],
  permissions: { user: [PermissionFlagsBits.ModerateMembers] },
  cooldown: 5,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'liste';

    if (sub === 'liste') {
      const type = ctx.interaction.options.getString('type') as CaseType | null;
      const member = ctx.interaction.options.getUser('membre');
      let entries = caseService.listGuild(ctx.guild.id);
      if (type) entries = entries.filter((entry) => entry.type === type || (type === 'mute' && entry.type === 'timeout'));
      if (member) entries = entries.filter((entry) => entry.targetId === member.id);

      const embed = baseEmbed({
        title: '📁 Cases de modération',
        color: THEME.colors.info,
        footer: `${humanizeNumber(entries.length)} case(s)${type ? ` • filtre : ${type}` : ''}`,
      });

      embed.setDescription(
        entries.length === 0
          ? 'Aucune case ne correspond à ce filtre.'
          : bulletList(
              entries
                .slice(0, 20)
                .map(
                  (entry) =>
                    `**#${entry.caseNumber}** ${SANCTION_META[entry.type]?.emoji ?? '•'} <@${entry.targetId}> — ${entry.reason.slice(0, 60)} *(par ${entry.moderatorTag})*`,
                ),
              { max: 20 },
            ),
      );

      const counts = entries.reduce<Record<string, number>>((accumulator, entry) => {
        accumulator[entry.type] = (accumulator[entry.type] ?? 0) + 1;
        return accumulator;
      }, {});
      if (Object.keys(counts).length > 0) {
        embed.addFields({
          name: 'Répartition',
          value: Object.entries(counts)
            .map(([key, count]) => `${SANCTION_META[key]?.emoji ?? '•'} ${SANCTION_META[key]?.label ?? key} : **${count}**`)
            .join(' • '),
        });
      }

      const rows = await import('../../ui/components').then((module) =>
        module.buttonRows([
          { id: `case:view:${ctx.guild.id}:${entries[0]?.caseNumber ?? 0}`, label: 'Dernière case', emoji: '📄', style: 'primary', disabled: entries.length === 0 },
          { id: `case:audit:${ctx.guild.id}:${member?.id ?? '0'}`, label: 'Audit membre', emoji: '🔎', style: 'secondary', disabled: !member },
        ]),
      );
      return ctx.send(embed, rows);
    }

    if (sub === 'detail') {
      const numero = ctx.integer('numero');
      const entry = caseService.get(ctx.guild.id, numero);
      if (!entry) return ctx.error(`Aucune case #${numero} sur ce serveur.`);

      const meta = SANCTION_META[entry.type] ?? { label: entry.type, emoji: '🛡️', color: THEME.colors.neutral };
      return ctx.send(
        modActionEmbed({
          action: meta.label,
          emoji: meta.emoji,
          color: meta.color,
          caseId: entry.caseNumber,
          target: entry.targetTag,
          targetId: entry.targetId,
          moderator: entry.moderatorTag,
          reason: entry.reason,
          duration: entry.duration,
          expiresAt: entry.expiresAt || undefined,
          extra: [
            { name: 'Statut', value: entry.active ? '🟢 Active' : '⚪ Close', inline: true },
            { name: 'Créée', value: timestampTag(entry.createdAt, 'f'), inline: true },
            { name: 'Type', value: `\`${entry.type}\``, inline: true },
          ],
        }),
      );
    }

    if (sub === 'supprimer') {
      const numero = ctx.integer('numero');
      const entry = caseService.get(ctx.guild.id, numero);
      if (!entry) return ctx.error(`Aucune case #${numero} sur ce serveur.`);
      if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return ctx.error('Seuls les administrateurs peuvent supprimer une case.');
      }

      const token = shortCode(10);
      registerConfirmation(token, {
        userId: ctx.interaction.user.id,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        cancelMessage: `La case #${numero} est conservée.`,
        onConfirm: async (buttonInteraction) => {
          caseService.delete(ctx.guild.id, numero);
          await buttonInteraction.editReply({
            embeds: [baseEmbed({ title: '🗑️ Case supprimée', description: `La case **#${numero}** a été effacée définitivement.`, color: THEME.colors.error })],
            components: [],
          });
        },
      });

      return ctx.interaction.editReply({
        embeds: [
          baseEmbed({
            title: '⚠️ Confirmation requise',
            description: [
              `Vous êtes sur le point de supprimer définitivement la case **#${numero}**.`,
              '',
              `**Membre :** ${entry.targetTag} (\`${entry.targetId}\`)`,
              `**Type :** ${SANCTION_META[entry.type]?.label ?? entry.type}`,
              `**Raison :** ${entry.reason}`,
              '',
              'Cette action est irréversible et la case disparaîtra des logs internes.',
            ].join('\n'),
            color: THEME.colors.warning,
          }),
        ],
        components: [confirmRow(token, { yes: 'Supprimer définitivement', no: 'Conserver' })],
      });
    }

    if (sub === 'exporter') {
      const entries = caseService.listGuild(ctx.guild.id);
      if (entries.length === 0) return ctx.error('Aucune case à exporter sur ce serveur.');
      const file = new AttachmentBuilder(Buffer.from(JSON.stringify(entries, null, 2), 'utf8'), {
        name: `cases-${ctx.guild.id}.json`,
        description: `Export de ${entries.length} case(s) de modération`,
      });
      return ctx.interaction.editReply({
        embeds: [
          baseEmbed({
            title: '📤 Export terminé',
            description: `${humanizeNumber(entries.length)} case(s) exportée(s) au format JSON.`,
            color: THEME.colors.success,
          }),
        ],
        files: [file],
      });
    }

    return ctx.error('Sous-commande inconnue.');
  },
};

export default casesCommand;
