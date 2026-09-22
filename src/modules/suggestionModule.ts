import { MessageFlags } from 'discord.js';
import type { InteractionModule } from '../core/types';
import type { ElysiaClient } from '../core/client';
import { errorEmbed } from '../ui/embeds';
import { suggestionService, type SuggestionStatus } from '../services/suggestionService';
import { renderSuggestion } from '../commands/community/suggestion';
import { isGuildAdmin } from '../utils/permissions';

/**
 * Module des suggestions (`/suggestion`).
 * CustomIds : `sug:<action>:<identifiant>`.
 */
export const suggestionModule: InteractionModule = {
  prefix: 'sug',
  async handle(interaction, _client: ElysiaClient, args) {
    // Toutes les interactions de suggestion sont des boutons.
    if (!interaction.isButton()) return;
    const [action, suggestionId] = args;
    const entry = suggestionId ? suggestionService.get(suggestionId) : undefined;

    if (!entry) {
      await interaction.reply({ embeds: [errorEmbed('Cette suggestion n’existe plus.', 'Introuvable')], flags: MessageFlags.Ephemeral });
      return;
    }

    if (action === 'up' || action === 'down') {
      const result = suggestionService.vote(entry.id, interaction.user.id, action);
      const messages: Record<string, string> = {
        up: '👍 Vote **pour** enregistré !',
        down: '👎 Vote **contre** enregistré !',
        changed: '🔄 Vote modifié.',
        removed: '🚪 Votre vote a été retiré.',
        invalid: '❌ Vote impossible sur cette suggestion.',
      };
      await interaction.reply({ content: messages[result] ?? '✅ Vote enregistré.', flags: MessageFlags.Ephemeral });
      await refreshSuggestion(interaction, entry.id);
      return;
    }

    if (action === 'stats') {
      const fresh = suggestionService.get(entry.id)!;
      await interaction.reply({
        content: [
          `👍 **Pour (${fresh.upVotes.length}) :** ${fresh.upVotes.length > 0 ? fresh.upVotes.map((id) => `<@${id}>`).join(', ') : '*personne*'}`,
          `👎 **Contre (${fresh.downVotes.length}) :** ${fresh.downVotes.length > 0 ? fresh.downVotes.map((id) => `<@${id}>`).join(', ') : '*personne*'}`,
        ].join('\n'),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (action === 'accepted' || action === 'rejected' || action === 'archived') {
      const member = interaction.member;
      const { guildService } = await import('../services/guildService');
      const settings = guildService.get(entry.guildId);
      const isStaff = member && 'permissions' in member ? isGuildAdmin(member as import('discord.js').GuildMember, settings) : false;

      if (!isStaff) {
        await interaction.reply({
          embeds: [errorEmbed('Seuls les administrateurs (ou rôles staff) peuvent statuer sur une suggestion.', 'Permission refusée')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const status: SuggestionStatus = action === 'accepted' ? 'acceptee' : action === 'rejected' ? 'refusee' : 'archivee';
      suggestionService.setStatus(entry.id, status, interaction.user.id);
      await refreshSuggestion(interaction, entry.id, { keepComponents: false });
      await interaction.followUp({
        content: `📌 Suggestion marquée comme **${status}** par <@${interaction.user.id}>.`,
        allowedMentions: { parse: [] },
      });
      return;
    }

    await interaction.reply({ embeds: [errorEmbed('Action inconnue.', 'Interaction invalide')], flags: MessageFlags.Ephemeral });
  },
};

/** Reconstruit l'embed de la suggestion (scores à jour). */
async function refreshSuggestion(
  interaction: { message?: unknown; client: unknown },
  suggestionId: string,
  options: { keepComponents?: boolean } = {},
): Promise<void> {
  const entry = suggestionService.get(suggestionId);
  if (!entry) return;
  const payload = renderSuggestion(entry);

  const message = interaction.message as { edit?: (options: unknown) => Promise<unknown> } | undefined;
  if (message?.edit) {
    await message
      .edit({ embeds: payload.embeds, ...(options.keepComponents === false ? {} : { components: payload.components }) })
      .catch(() => undefined);
    return;
  }

  if (!entry.messageId) return;
  const client = interaction.client as { channels?: { fetch: (id: string) => Promise<unknown> } };
  const channel = (await client?.channels?.fetch(entry.channelId).catch(() => null)) as
    | { messages?: { fetch: (id: string) => Promise<{ edit: (options: unknown) => Promise<unknown> }> } }
    | null;
  const target = await channel?.messages?.fetch(entry.messageId).catch(() => null);
  await target?.edit({ embeds: payload.embeds, components: payload.components }).catch(() => undefined);
}
