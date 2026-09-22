import { MessageFlags } from 'discord.js';
import type { InteractionModule } from '../core/types';
import type { ElysiaClient } from '../core/client';
import { baseEmbed, errorEmbed, THEME } from '../ui/embeds';
import { pollService } from '../services/pollService';
import { pollService as service } from '../services/pollService';
import { humanizeNumber, percent, progressBar } from '../utils/format';

/**
 * Module des sondages (`/sondage`).
 * CustomIds : `poll:<action>:<identifiantDuSondage>`.
 */
export const pollModule: InteractionModule = {
  prefix: 'poll',
  async handle(interaction, _client: ElysiaClient, args) {
    const [action, pollId] = args;
    const poll = pollId ? pollService.get(pollId) : undefined;

    if (!poll) {
      const embed = errorEmbed('Ce sondage n’est plus disponible (supprimé ou bot redémarré).', 'Sondage introuvable');
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        else await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // ── Vote via le menu déroulant ──────────────────────────────────────────
    if (action === 'vote' && interaction.isStringSelectMenu()) {
      const status = pollService.castVote(poll.id, interaction.user.id, interaction.values);
      const messages: Record<string, string> = {
        voted: '✅ Vote enregistré !',
        updated: '🔄 Vote mis à jour.',
        removed: '🚪 Vote retiré.',
        same: 'ℹ️ C’était déjà votre vote — rien à changer.',
        invalid: '❌ Ce vote n’a pas pu être pris en compte.',
      };

      await interaction.reply({ content: messages[status] ?? '✅ Vote pris en compte.', flags: MessageFlags.Ephemeral });
      await refreshPollMessage(interaction, poll.id);
      return;
    }

    if (action === 'clear' && interaction.isButton()) {
      const status = pollService.castVote(poll.id, interaction.user.id, []);
      await interaction.reply({
        content: status === 'removed' ? '🚪 Votre vote a été retiré.' : 'ℹ️ Vous n’aviez pas voté sur ce sondage.',
        flags: MessageFlags.Ephemeral,
      });
      await refreshPollMessage(interaction, poll.id);
      return;
    }

    if (action === 'results' && interaction.isButton()) {
      const { lines, totalVoters, totalVotes } = service.results(poll);
      const embed = baseEmbed({
        title: `🔎 Détail des votes — ${poll.question}`,
        description: lines
          .map((line) => {
            const voters = poll.anonymous
              ? '*sondage anonyme*'
              : line.voters.length > 0
                ? line.voters.map((id) => `<@${id}>`).join(', ')
                : '*aucun votant*';
            return `**${line.option.label}** — ${progressBar(line.count, Math.max(totalVotes, 1), 10)} ${humanizeNumber(line.count)} (${percent(line.count, Math.max(totalVotes, 1))})\n${voters}`;
          })
          .join('\n\n')
          .slice(0, 4_000),
        color: THEME.colors.info,
        footer: `${totalVoters} votant(s) • ${totalVotes} vote(s)`,
      });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (action === 'end' && interaction.isButton()) {
      const isAuthor = interaction.user.id === poll.authorId;
      const isModerator = interaction.memberPermissions?.has('ManageMessages') ?? false;
      if (!isAuthor && !isModerator) {
        await interaction.reply({
          embeds: [errorEmbed('Seul l’auteur du sondage (ou un modérateur) peut le clôturer.', 'Action refusée')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      pollService.end(poll.id);
      await refreshPollMessage(interaction, poll.id, { force: true });
      await interaction.followUp({
        content: '🏁 Sondage clôturé — les résultats sont figés.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === 'refresh' && interaction.isButton()) {
      await refreshPollMessage(interaction, poll.id, { force: true });
      await interaction.reply({ content: '🔄 Résultats actualisés.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ content: '❌ Action inconnue.', flags: MessageFlags.Ephemeral });
  },
};

/** Reconstruit le message public du sondage (barres de progression à jour). */
export async function refreshPollMessage(
  interaction: { client: unknown; message?: unknown },
  pollId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const poll = pollService.get(pollId);
  if (!poll) return;

  const { renderPoll } = await import('../commands/community/sondage');
  const payload = renderPoll(poll);

  const message = interaction.message as { edit?: (options: unknown) => Promise<unknown> } | undefined;
  if (message?.edit && !options.force) {
    await message.edit({ embeds: payload.embeds, components: payload.components }).catch(() => undefined);
    return;
  }

  // Pas de message attaché à l'interaction (bouton d'un ancien message) :
  // on récupère le message par son identifiant.
  const client = interaction.client as { channels?: { fetch: (id: string) => Promise<unknown> } };
  if (!client?.channels || !poll.messageId) return;
  const channel = (await client.channels.fetch(poll.channelId).catch(() => null)) as
    | { messages?: { fetch: (id: string) => Promise<{ edit: (options: unknown) => Promise<unknown> }> } }
    | null;
  const target = await channel?.messages?.fetch(poll.messageId).catch(() => null);
  await target?.edit({ embeds: payload.embeds, components: payload.components }).catch(() => undefined);
}
