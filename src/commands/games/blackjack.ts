import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { registerGames } from '../../games/registry';
import { toPlayer } from '../../games/ui/common';
import { createBlackjackSession } from '../../games/ui/blackjack';
import { gameService } from '../../services/gameService';

registerGames();

/**
 * Blackjack — commande autonome (hors `/jeu` pour ne pas le confondre avec
 * les mini-jeux de loisir : ici on mise l'argent gagné en discutant).
 * La somme à miser s'inscrit dans une modale : montant libre, sans plafond.
 */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Blackjack contre le croupier : misez votre argent (gagné en discutant), montant libre')
    .setDMPermission(false),
  category: 'games',
  summary: 'Blackjack contre le croupier : mises en argent réel, montant libre (payé 3:2, double possible)',
  usage: ['/blackjack'],
  cooldown: 3,
  publicReply: true,
  noDefer: true,

  async run(ctx: CommandContext) {
    const { interaction, settings } = ctx;
    if (settings.modules.games === false) {
      await ctx.error('Les mini-jeux sont désactivés sur ce serveur. Un administrateur peut les réactiver avec `/config modules module:🎮 Mini-jeux actif:true`.');
      return;
    }

    const session = createBlackjackSession({
      guildId: ctx.guild.id,
      channelId: interaction.channelId,
      host: toPlayer(interaction.user),
    });
    const payload = gameService.definition(session.game)?.render(session);
    if (!payload) {
      gameService.discard(session);
      return ctx.error('Le blackjack n’est pas disponible sur ce serveur.');
    }

    try {
      const response = await interaction.reply({
        content: payload.content || undefined,
        embeds: payload.embeds ?? [],
        components: payload.components ?? [],
        allowedMentions: { parse: [] },
        withResponse: true,
      });
      session.messageId = response.resource?.message?.id ?? (await interaction.fetchReply()).id;
    } catch (error) {
      gameService.discard(session);
      throw error;
    }
  },
};

export default command;
