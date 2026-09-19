import type { ElysiaClient } from '../core/client';
import { logger } from '../core/logger';
import type { InteractionModule } from '../core/types';
import { GAME_IDS, type GameId } from '../games/types';
import { deny } from '../games/ui/common';
import { gameService } from '../services/gameService';
import { guildService } from '../services/guildService';

const log = logger.child('games');

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

    const started = Date.now();
    await definition.handle(interaction, session, [action, ...rest], _client);
    const elapsed = Date.now() - started;
    if (elapsed > 1_500) log.debug(`Action ${game}:${action} lente (${elapsed} ms) sur la partie ${session.id}`);
  },
};
