import { MessageFlags } from 'discord.js';
import type { InteractionModule } from '../core/types';
import type { ElysiaClient } from '../core/client';
import { baseEmbed, errorEmbed, THEME } from '../ui/embeds';
import { buttonRows } from '../ui/components';
import { countdownService } from '../services/countdownService';
import { formatDuration, timestampTag } from '../utils/duration';

/**
 * Module des comptes à rebours (`/compte-a-rebours`).
 * CustomIds : `cd:<action>:<identifiant>`.
 */
export const countdownModule: InteractionModule = {
  prefix: 'cd',
  async handle(interaction, _client: ElysiaClient, args) {
    const [action, countdownId] = args;
    const entry = countdownId ? countdownService.get(countdownId) : undefined;

    if (!entry) {
      await interaction.reply({
        embeds: [errorEmbed('Ce compte à rebours n’existe plus.', 'Introuvable')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === 'time') {
      const remaining = entry.targetAt - Date.now();
      await interaction.reply({
        embeds: [
          baseEmbed({
            title: `⏳ ${entry.title}`,
            description:
              remaining > 0
                ? [
                    `**Temps restant :** ${formatDuration(remaining, { compact: true })}`,
                    `**Échéance :** ${timestampTag(entry.targetAt, 'F')} (${timestampTag(entry.targetAt, 'R')})`,
                  ].join('\n')
                : '🎉 L’échéance est déjà atteinte !',
            color: THEME.colors.info,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === 'notify') {
      const remaining = entry.targetAt - Date.now();
      if (remaining <= 0) {
        await interaction.reply({ content: '⏰ C’est déjà l’heure !', flags: MessageFlags.Ephemeral });
        return;
      }

      // Le rappel personnel est enregistré via le service de rappels (persistant).
      const { reminderService } = await import('../services/reminderService');
      if (remaining < 30_000) {
        await interaction.reply({ content: '⌛ Moins de 30 secondes restantes : restez connecté !', flags: MessageFlags.Ephemeral });
        return;
      }

      const reminder = reminderService.create({
        guildId: entry.guildId,
        channelId: entry.channelId,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        text: `⏳ ${entry.title} — c’est maintenant !`,
        dueAt: entry.targetAt,
        mention: true,
      });

      await interaction.reply({
        content:
          reminderService.countPending(entry.guildId, interaction.user.id) > 0
            ? `🔔 Je vous préviendrai à l’échéance (rappel \`${reminder.id}\`).`
            : '🔔 Rappel programmé.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({ content: '❌ Action inconnue.', flags: MessageFlags.Ephemeral });
  },
};

/** Boutons attachés au message public d'un compte à rebours. */
export function countdownButtons(countdownId: string) {
  return buttonRows([
    { id: `cd:time:${countdownId}`, label: 'Temps restant', emoji: '⏱️', style: 'primary' },
    { id: `cd:notify:${countdownId}`, label: 'Me prévenir', emoji: '🔔', style: 'secondary' },
  ]);
}
