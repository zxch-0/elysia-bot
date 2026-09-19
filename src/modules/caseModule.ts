import { MessageFlags } from 'discord.js';
import type { InteractionModule } from '../core/types';
import type { ElysiaClient } from '../core/client';
import { caseService } from '../services/caseService';
import { guildService } from '../services/guildService';
import { SANCTION_META } from '../services/moderationService';
import { isGuildAdmin } from '../utils/permissions';
import { baseEmbed, errorEmbed, THEME } from '../ui/embeds';
import { modActionEmbed } from '../ui/embeds';
import { bulletList } from '../utils/format';

/**
 * Actions sur les cases de modération.
 * CustomIds : `case:view:<guildId>:<numéro>` et `case:audit:<guildId>|<userId>`.
 */
export const caseModule: InteractionModule = {
  prefix: 'case',
  async handle(interaction, _client: ElysiaClient, args) {
    const [action] = args;
    if (!interaction.isButton()) return;

    if (action === 'view') {
      const guildId = args[1];
      const caseNumber = Number.parseInt(args[2] ?? '', 10);
      const entry = caseService.get(guildId, caseNumber);
      if (!entry) {
        await interaction.reply({ embeds: [errorEmbed('Cette case n’existe plus.')], flags: MessageFlags.Ephemeral });
        return;
      }
      const meta = SANCTION_META[entry.type] ?? { label: entry.type, emoji: '🛡️', color: THEME.colors.neutral };
      await interaction.reply({
        embeds: [
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
              { name: 'Créée', value: `<t:${Math.floor(entry.createdAt / 1000)}:R>`, inline: true },
            ],
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === 'audit') {
      const guild = interaction.guild;
      if (!guild) return;
      const member = await guild.members.fetch(interaction.user.id);
      if (!isGuildAdmin(member, guildService.get(guild.id))) {
        await interaction.reply({
          embeds: [errorEmbed('Seuls les administrateurs peuvent consulter l’audit complet.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const userId = args[2] ?? '';
      const entries = caseService.listUser(guild.id, userId);
      const grouped = entries.reduce<Record<string, number>>((accumulator, entry) => {
        accumulator[entry.type] = (accumulator[entry.type] ?? 0) + 1;
        return accumulator;
      }, {});

      await interaction.reply({
        embeds: [
          baseEmbed({
            title: `🔎 Audit de <@${userId}>`,
            description: [
              `**Total :** ${entries.length} case(s)`,
              bulletList(Object.entries(grouped).map(([type, count]) => `${SANCTION_META[type]?.label ?? type} : **${count}**`), {
                emptyText: 'Aucune sanction enregistrée.',
              }),
              '',
              bulletList(
                entries.slice(0, 8).map((entry) => `#${entry.caseNumber} — ${SANCTION_META[entry.type]?.label ?? entry.type} par ${entry.moderatorTag}`),
              ),
            ].join('\n'),
            color: THEME.colors.info,
            footer: `Identifiant : ${userId}`,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  },
};
