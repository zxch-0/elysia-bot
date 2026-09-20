import { ActionRowBuilder, type Interaction } from 'discord.js';
import type { ElysiaClient } from '../core/client';
import { isIgnorableError } from '../core/errors';
import { logger } from '../core/logger';
import type { InteractionModule } from '../core/types';
import { GAME_IDS, type GameId } from '../games/types';
import { deny } from '../games/ui/common';
import { gameService } from '../services/gameService';
import { guildService } from '../services/guildService';

const log = logger.child('games');

/**
 * Fige les composants d'un message dont la partie n'existe plus (expiration,
 * redémarrage du bot) : l'utilisateur ne reste pas face à des boutons morts.
 * Retourne vrai si le message a pu être mis à jour (l'interaction est alors acquittée).
 */
async function freezeOrphanMessage(interaction: Interaction): Promise<boolean> {
  if (!interaction.isMessageComponent()) return false;
  const rows = interaction.message?.components ?? [];
  if (rows.length === 0) return false;
  try {
    const disabled = rows.map((row) => {
      const builder = ActionRowBuilder.from(row as never) as ActionRowBuilder<any>;
      for (const component of builder.components) {
        if (typeof (component as { setDisabled?: unknown }).setDisabled === 'function') (component as { setDisabled(value: boolean): unknown }).setDisabled(true);
      }
      return builder;
    });
    await interaction.update({ components: disabled });
    return true;
  } catch (error) {
    if (!isIgnorableError(error)) log.debug('Impossible de figer un message orphelin', error);
    return interaction.replied || interaction.deferred;
  }
}

/**
 * Interactions des mini-jeux.
 * CustomIds : `g:<jeu>:<partie>:<action>[:args…]` (boutons, menus et modales).
 */
export const gameModule: InteractionModule = {
  prefix: 'g',
  async handle(interaction, _client: ElysiaClient, args) {
    const [game, sessionId, action = '', ...rest] = args;

    if (!GAME_IDS.includes(game as GameId)) {
      await deny(interaction, 'Ce jeu n’existe pas (ou plus).');
      return;
    }
    const definition = gameService.definition(game as GameId);
    const session = sessionId ? gameService.get(sessionId) : undefined;
    if (!definition || !session || session.game !== game) {
      await freezeOrphanMessage(interaction);
      await deny(
        interaction,
        'Cette partie n’est plus en mémoire (expirée ou bot redémarré). Relancez-en une avec `/jeu` !',
        '⌛ Partie introuvable',
      );
      return;
    }

    if (interaction.guildId && interaction.guildId !== session.guildId) {
      await deny(interaction, 'Cette partie appartient à un autre serveur.');
      return;
    }
    if (interaction.guildId && guildService.get(interaction.guildId).modules.games === false) {
      await deny(interaction, 'Les mini-jeux sont désactivés sur ce serveur (`/config modules`).');
      return;
    }
    if (session.supersededBy) {
      // Clic « en retard » sur une partie déjà remplacée par une revanche.
      await deny(interaction, 'Une nouvelle partie a déjà été lancée sur ce message : utilisez les boutons affichés maintenant.', '🔄 Partie remplacée');
      return;
    }

    const started = Date.now();
    await definition.handle(interaction, session, [action, ...rest], _client);
    const elapsed = Date.now() - started;
    if (elapsed > 1_500) log.debug(`Action ${game}:${action} lente (${elapsed} ms) sur la partie ${session.id}`);
  },
};
