import { MessageFlags } from 'discord.js';
import type { InteractionModule } from '../core/types';
import type { ElysiaClient } from '../core/client';
import { errorEmbed, successEmbed, warningEmbed } from '../ui/embeds';
import { reminderService } from '../services/reminderService';

/**
 * Module des rappels (`/rappel`).
 * CustomIds : `rem:<action>:<identifiant>[:minutes]`.
 */
export const reminderModule: InteractionModule = {
  prefix: 'rem',
  async handle(interaction, _client: ElysiaClient, args) {
    if (!interaction.isButton()) return;
    const [action, reminderId] = args;
    const reminder = reminderId ? reminderService.get(reminderId) : undefined;

    if (!reminder) {
      await interaction.reply({
        embeds: [errorEmbed('Ce rappel n’existe plus (déjà déclenché ou supprimé).', 'Rappel introuvable')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.user.id !== reminder.userId) {
      await interaction.reply({
        embeds: [errorEmbed('Ce rappel appartient à quelqu’un d’autre.', 'Action refusée')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === 'cancel') {
      reminderService.delete(reminder.id);
      await interaction.update({
        embeds: [successEmbed('Rappel supprimé', `Le rappel \`${reminder.id}\` a bien été annulé.`)],
        components: [],
      });
      return;
    }

    if (action === 'snooze') {
      const minutes = Number.parseInt(args[2] ?? '15', 10);
      const delay = Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 15 * 60_000;
      const updated = reminderService.snooze(reminder.id, reminder.dueAt > Date.now() ? reminder.dueAt - Date.now() + delay : delay);

      await interaction.reply({
        embeds: [
          successEmbed(
            'Rappel décalé',
            `Nouvelle échéance : ${updated ? `<t:${Math.floor(updated.dueAt / 1_000)}:R>` : `dans ${minutes} minutes`}.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === 'done') {
      reminderService.delete(reminder.id);
      await interaction.update({
        embeds: [successEmbed('Parfait !', 'Ce rappel est marqué comme traité et n’apparaîtra plus.')],
        components: [],
      });
      return;
    }

    if (action === 'later') {
      // Bouton « plus tard » de la notification : report de 10 minutes.
      reminderService.snooze(reminder.id, 10 * 60_000);
      await interaction.update({
        embeds: [successEmbed('Rappel reporté', 'Nouvelle alerte dans **10 minutes**.')],
        components: [],
      });
      return;
    }

    await interaction.reply({
      embeds: [warningEmbed('Action inconnue', 'Aucune modification n’a été appliquée.')],
      flags: MessageFlags.Ephemeral,
    });
  },
};
