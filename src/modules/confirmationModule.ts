import { MessageFlags, type ButtonInteraction } from 'discord.js';
import type { InteractionModule } from '../core/types';
import type { ElysiaClient } from '../core/client';
import { logger } from '../core/logger';
import { errorEmbed, successEmbed } from '../ui/embeds';

const log = logger.child('confirm');

export interface PendingConfirmation {
  userId: string;
  createdAt: number;
  expiresAt: number;
  onConfirm: (interaction: ButtonInteraction) => Promise<void>;
  onCancel?: (interaction: ButtonInteraction) => Promise<void>;
  /** Message affiché si l'utilisateur clique sur « non ». */
  cancelMessage?: string;
}

/** Confirmations en attente (boutons oui/non), nettoyées automatiquement. */
const pending = new Map<string, PendingConfirmation>();

export function registerConfirmation(token: string, confirmation: PendingConfirmation): void {
  pending.set(token, confirmation);
  // Nettoyage paresseux
  const now = Date.now();
  for (const [key, entry] of pending) if (entry.expiresAt < now) pending.delete(key);
  setTimeout(() => pending.delete(token), Math.max(confirmation.expiresAt - now, 0)).unref?.();
}

export function getPendingConfirmation(token: string): PendingConfirmation | undefined {
  const entry = pending.get(token);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    pending.delete(token);
    return undefined;
  }
  return entry;
}

/**
 * Module gérant les boutons `confirm:<token>:<yes|no>`.
 * Utilisé par les commandes destructrices (purge, reset de config, suppression
 * de giveaway, débannissement en masse…).
 */
export const confirmationModule: InteractionModule = {
  prefix: 'confirm',
  async handle(interaction, _client: ElysiaClient, args) {
    if (!interaction.isButton()) return;
    const [token, action] = args;
    const confirmation = getPendingConfirmation(token);

    if (!confirmation) {
      await interaction.reply({
        embeds: [errorEmbed('Cette confirmation a expiré. Relancez la commande.', 'Session expirée')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (confirmation.userId !== interaction.user.id) {
      await interaction.reply({
        embeds: [errorEmbed('Seul l’auteur de la commande peut confirmer cette action.', 'Action protégée')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === 'no') {
      pending.delete(token);
      await interaction.update({
        embeds: [successEmbed('Action annulée', confirmation.cancelMessage ?? 'Aucune modification n’a été appliquée.')],
        components: [],
      });
      await confirmation.onCancel?.(interaction).catch(() => undefined);
      return;
    }

    pending.delete(token);
    await interaction.deferUpdate();
    try {
      await confirmation.onConfirm(interaction);
    } catch (error) {
      log.error('Action confirmée en échec', error as Error);
      await interaction
        .followUp({ embeds: [errorEmbed('L’action a échoué. Vérifiez mes permissions puis réessayez.')], flags: MessageFlags.Ephemeral })
        .catch(() => undefined);
    }
  },
};
