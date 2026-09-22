import { MessageFlags } from 'discord.js';
import type { InteractionModule } from '../core/types';
import type { ElysiaClient } from '../core/client';
import { baseEmbed, errorEmbed, THEME } from '../ui/embeds';
import { buttonRows } from '../ui/components';
import { cancelDuel, declineDuel, deleteDuel, getDuel, playDuel, totalScore, type DuelSession } from '../fun/duel';
import { humanizeNumber } from '../utils/format';

/** Rendu de fin de duel : historique des manches + gage pour le perdant. */
export function renderDuelResult(session: DuelSession) {
  const winner = session.winnerId;
  const loser = session.loserId;
  const lines = session.history.map(
    (round, index) =>
      `${round.suddenDeath ? '⚡' : `**${index + 1}.**`} ${session.hostTag} \`${round.host}\` — \`${round.target}\` ${session.targetTag} ${
        round.winner === 'tie' ? '= égalité' : round.winner === 'host' ? `→ ${session.hostTag}` : `→ ${session.targetTag}`
      }`,
  );

  const embed = baseEmbed({
    title: `🏆 ${winner === session.hostId ? session.hostTag : session.targetTag} remporte le duel !`,
    description: [
      `<@${session.hostId}> **${session.hostWins}** — **${session.targetWins}** <@${session.targetId}>`,
      '',
      lines.slice(-8).join('\n'),
      '',
      session.bet ? `🎭 **Gage pour <@${loser}> :** ${session.bet}` : `🎭 <@${loser}>, inventez un gage à la hauteur de votre défaite !`,
    ].join('\n'),
    color: THEME.colors.success,
    footer: `Duel ${session.id} • total des points : ${humanizeNumber(totalScore(session, 'host'))} contre ${humanizeNumber(totalScore(session, 'target'))}`,
  });

  const rows = buttonRows([
    { id: `duel:replay:${session.id}`, label: 'Revanche', emoji: '🔄', style: 'primary' },
    { id: `duel:close:${session.id}`, label: 'Clôturer', emoji: '🏁', style: 'secondary' },
  ]);

  return { embeds: [embed], components: rows };
}

/**
 * Module des duels (`/duel`).
 * CustomIds : `duel:<action>:<identifiant>`.
 */
export const duelModule: InteractionModule = {
  prefix: 'duel',
  async handle(interaction, _client: ElysiaClient, args) {
    // Ce module ne traite que des boutons (les duels n'utilisent ni menu ni modale).
    if (!interaction.isButton()) return;
    const [action, duelId] = args;
    const session = duelId ? getDuel(duelId) : undefined;

    if (!session) {
      await interaction.reply({
        embeds: [errorEmbed('Ce duel n’existe plus (expiré ou bot redémarré).', 'Duel introuvable')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (session.status === 'expired') {
      await interaction.reply({
        embeds: [errorEmbed('Ce défi a expiré : relancez-en un avec `/duel`.', 'Défi expiré')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === 'accept') {
      if (interaction.user.id !== session.targetId) {
        await interaction.reply({
          embeds: [errorEmbed(`Seul <@${session.targetId}> peut accepter ce défi.`, 'Ce défi n’est pas pour vous')],
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
        return;
      }
      if (session.status !== 'pending') {
        await interaction.reply({ embeds: [errorEmbed('Ce duel a déjà été joué.', 'Duel terminé')], flags: MessageFlags.Ephemeral });
        return;
      }

      playDuel(session);
      await interaction.update(renderDuelResult(session));
      return;
    }

    if (action === 'decline' || action === 'cancel') {
      const allowed = action === 'decline' ? session.targetId === interaction.user.id : session.hostId === interaction.user.id;
      if (!allowed) {
        await interaction.reply({
          embeds: [errorEmbed(action === 'decline' ? 'Seul le membre défié peut refuser.' : 'Seul l’auteur du défi peut l’annuler.', 'Action refusée')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (action === 'decline') declineDuel(session.id, interaction.user.id);
      else cancelDuel(session.id, interaction.user.id);

      await interaction.update({
        embeds: [
          baseEmbed({
            title: action === 'decline' ? '🏳️ Défi refusé' : '✖️ Défi annulé',
            description:
              action === 'decline'
                ? `<@${session.targetId}> a refusé le duel. Pas de gage cette fois !`
                : `<@${session.hostId}> a annulé son propre défi.`,
            color: THEME.colors.neutral,
          }),
        ],
        components: [],
      });
      return;
    }

    if (action === 'replay') {
      if (interaction.user.id !== session.hostId && interaction.user.id !== session.targetId) {
        await interaction.reply({ embeds: [errorEmbed('Seuls les deux adversaires peuvent demander une revanche.', 'Action refusée')], flags: MessageFlags.Ephemeral });
        return;
      }

      // Nouveau duel identique, en repartant de zéro.
      const { createDuel } = await import('../fun/duel');
      const fresh = createDuel({
        guildId: session.guildId,
        channelId: session.channelId,
        hostId: session.hostId,
        hostTag: session.hostTag,
        targetId: session.targetId,
        targetTag: session.targetTag,
        rounds: session.rounds,
        bet: session.bet,
      });

      const { renderDuelChallenge } = await import('../commands/fun/duel');
      await interaction.update(renderDuelChallenge(fresh));
      return;
    }

    if (action === 'close') {
      deleteDuel(session.id);
      await interaction.update({
        embeds: [
          baseEmbed({
            title: '🏁 Duel clôturé',
            description: `Le duel \`${session.id}\` est archivé. Relancez \`/duel\` pour en démarrer un nouveau.`,
            color: THEME.colors.neutral,
          }),
        ],
        components: [],
      });
      return;
    }

    await interaction.reply({ content: '❌ Action inconnue.', flags: MessageFlags.Ephemeral });
  },
};
