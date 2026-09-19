import { Events, MessageFlags, type AnySelectMenuInteraction, type ButtonInteraction, type ModalSubmitInteraction } from 'discord.js';
import type { ElysiaClient } from '../client';
import { logger } from '../logger';
import { BotError, isIgnorableError, toUserMessage } from '../errors';
import { errorEmbed } from '../../ui/embeds';

const log = logger.child('router');

/** Durée de validité d'une interaction composant (sécurité anti-rejeu). */
const MAX_INTERACTION_AGE_MS = 15 * 60_000;

/**
 * Route les interactions de composants vers les modules enregistrés.
 * Le customId suit la convention `préfixe:action:args…`.
 */
export async function handleComponentInteraction(
  interaction: ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction,
  client: ElysiaClient,
): Promise<void> {
  const [prefix, ...args] = interaction.customId.split(':');
  client.stats.interactionsHandled += 1;

  // Anti-rejeu : on ignore les boutons très anciens.
  const age = Date.now() - interaction.createdTimestamp;
  if (age > MAX_INTERACTION_AGE_MS) {
    await safeReply(interaction, '⌛ Ce bouton est trop ancien, relancez la commande.', true);
    return;
  }

  const module = client.modules.get(prefix);
  if (!module) {
    log.debug(`Aucun module pour le customId « ${interaction.customId} »`);
    await safeReply(interaction, "❌ Ce composant n'est plus disponible (le bot a peut-être redémarré).", true);
    return;
  }

  try {
    await module.handle(interaction, client, args);
  } catch (error) {
    if (error instanceof BotError) {
      await safeReply(interaction, `❌ ${error.userMessage}`, true);
      return;
    }
    log.error(`Erreur du module « ${prefix} » (${interaction.customId})`, error as Error);
    await safeReply(interaction, `❌ ${toUserMessage(error)}`, true);
  }
}

async function safeReply(
  interaction: ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction,
  content: string,
  ephemeral: boolean,
): Promise<void> {
  try {
    const payload = {
      embeds: [errorEmbed(content.replace('❌ ', ''))],
      flags: ephemeral ? MessageFlags.Ephemeral : undefined,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload as any);
    } else {
      await interaction.reply(payload as any);
    }
  } catch (error) {
    if (!isIgnorableError(error)) log.warn('Réponse d’erreur impossible', error);
  }
}

/** Libellés lisibles des événements d'interaction. */
export function describeInteraction(event: unknown): string {
  if (event === Events.InteractionCreate) return 'interaction';
  return String(event);
}
