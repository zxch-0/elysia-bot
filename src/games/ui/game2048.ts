import type { ComponentMessage } from '../../core/types';
import { gameService } from '../../services/gameService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows, type ButtonSpec } from '../../ui/components';
import { codeBlock, humanizeNumber } from '../../utils/format';
import { createGame, maxTile, move, renderGrid, tilePoints, undo, type Direction, type G2048State } from '../engine/game2048';
import type { GameDefinition, GamePlayer, GameSession } from '../types';
import { canRematch, cid, deny, endRows, formatElapsed, isPlayer, linkRematch, mention, rememberMessage, sessionFooterLine, updateGame } from './common';

export interface G2048SessionState extends G2048State {
  celebrated: boolean;
  lastMessage: string | null;
}

const RULES = 'Glissez les tuiles ; deux tuiles identiques fusionnent. Atteignez 2048 !';
const DIRECTIONS: Record<string, Direction> = { up: 'up', down: 'down', left: 'left', right: 'right' };

function pointsFor(state: G2048State): number {
  return tilePoints(maxTile(state.grid)) + Math.floor(state.score / 1_000);
}

function recordOutcome(session: GameSession<G2048SessionState>): void {
  const host = session.players[0];
  const { state } = session;
  gameService.record({
    guildId: session.guildId,
    userId: host.id,
    tag: host.name,
    game: '2048',
    result: state.reached ? 'win' : 'loss',
    points: pointsFor(state),
    best: state.score,
    betterIf: 'higher',
  });
}

function render(session: GameSession<G2048SessionState>, options: { disabled?: boolean } = {}): ComponentMessage {
  const { state } = session;
  const finished = session.status === 'finished';
  const best = maxTile(state.grid);

  const lines = [
    `${mention(session.players[0])} • Score **${humanizeNumber(state.score)}** • Meilleure tuile **${best}** • ${state.moves} coup(s) • ↩️ ${state.undosLeft} annulation(s)`,
    codeBlock(renderGrid(state.grid), 'text'),
    `⏱️ ${formatElapsed(Date.now() - state.startedAt)}${state.reached ? ' • 🏅 2048 atteint !' : ''}`,
    state.lastMessage && !finished ? state.lastMessage : '',
    finished ? `\n${session.outcome ?? 'Partie terminée.'}` : '',
    '',
    sessionFooterLine(session),
  ].filter((line) => line !== '');

  const embed = baseEmbed({
    title: '🔢 2048',
    description: lines.join('\n'),
    color: finished ? (state.reached ? THEME.colors.success : THEME.colors.neutral) : THEME.colors.primary,
    footer: `Elysia • mini-jeux • ${RULES}`,
  });

  if (options.disabled) return { embeds: [embed], components: [] };
  if (finished) return { embeds: [embed], components: endRows(session) };

  const blank = (key: number): ButtonSpec => ({ id: cid(session, 'noop', key), emoji: '▪️', style: 'secondary', disabled: true });
  const arrow = (direction: Direction, emoji: string): ButtonSpec => ({ id: cid(session, 'move', direction), emoji, style: 'primary' });
  return {
    embeds: [embed],
    components: [
      ...buttonRows([blank(1), arrow('up', '⬆️'), blank(2)]),
      ...buttonRows([arrow('left', '⬅️'), arrow('down', '⬇️'), arrow('right', '➡️')]),
      ...buttonRows([
        { id: cid(session, 'undo'), label: `Annuler (${state.undosLeft})`, emoji: '↩️', style: 'secondary', disabled: state.undosLeft === 0 || state.history.length === 0 },
        { id: cid(session, 'quit'), label: 'Terminer', emoji: '🏁', style: 'danger' },
      ]),
    ],
  };
}

export interface G2048Params {
  guildId: string;
  channelId: string;
  host: GamePlayer;
}

export function create2048Session(params: G2048Params): GameSession<G2048SessionState> {
  return gameService.createSession<G2048SessionState>({
    game: '2048',
    guildId: params.guildId,
    channelId: params.channelId,
    host: params.host,
    state: { ...createGame(), celebrated: false, lastMessage: null },
  });
}

export const game2048: GameDefinition<G2048SessionState> = {
  id: '2048',
  label: '2048',
  emoji: '🔢',
  description: 'Le puzzle de fusion 4×4 avec annulations limitées et meilleur score.',
  idleTimeoutMs: 15 * 60_000,
  render,

  async handle(interaction, session, args) {
    const [action, rawDirection] = args;
    const { state } = session;

    if (action === 'rematch') {
      if (!(await canRematch(interaction, session))) return;
      const fresh = create2048Session({ guildId: session.guildId, channelId: session.channelId, host: session.players[0] });
      linkRematch(session, fresh, interaction);
      await updateGame(interaction, render(fresh));
      return;
    }

    if (session.status === 'finished') return deny(interaction, 'Cette partie est terminée.');
    if (!isPlayer(session, interaction.user.id)) return deny(interaction, 'Cette grille appartient à un autre membre. Lancez la vôtre avec `/jeu 2048` !');
    if (action === 'noop') return deny(interaction, 'Utilisez les flèches pour jouer.');
    rememberMessage(session, interaction);

    if (action === 'quit') {
      gameService.finish(session, `🏁 Partie terminée : **${humanizeNumber(state.score)}** points, meilleure tuile **${maxTile(state.grid)}** (+${pointsFor(state)} pts de classement).`);
      recordOutcome(session);
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'undo') {
      if (!undo(state)) return deny(interaction, 'Aucune annulation disponible.');
      state.lastMessage = '↩️ Dernier coup annulé.';
      gameService.touch(session);
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'move') {
      const direction = DIRECTIONS[rawDirection ?? ''];
      if (!direction) return deny(interaction, 'Direction invalide.');
      if (!move(state, direction)) return deny(interaction, 'Ce mouvement ne déplace aucune tuile — essayez une autre direction.');
      state.lastMessage = null;
      if (state.reached && !state.celebrated) {
        state.celebrated = true;
        state.lastMessage = '🏅 **2048 atteint !** Vous pouvez continuer pour viser plus haut.';
      }
      if (state.over) {
        gameService.finish(session, `🧱 Plus aucun mouvement possible ! Score final **${humanizeNumber(state.score)}**, meilleure tuile **${maxTile(state.grid)}** (+${pointsFor(state)} pts de classement).`);
        recordOutcome(session);
      } else {
        gameService.touch(session);
      }
      await updateGame(interaction, render(session));
      return;
    }

    await deny(interaction, 'Action inconnue.');
  },

  onExpire(session) {
    if (session.status !== 'playing') return;
    const { state } = session;
    gameService.finish(session, `⌛ Partie expirée par inactivité — score **${humanizeNumber(state.score)}**, meilleure tuile **${maxTile(state.grid)}**.`);
    if (state.moves > 0) recordOutcome(session);
  },
};
