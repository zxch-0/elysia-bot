import type { ComponentMessage } from '../../core/types';
import { gameService } from '../../services/gameService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows, type ButtonSpec } from '../../ui/components';
import {
  MS_CELLS,
  MS_COLS,
  MS_MAX_MINES,
  MS_MIN_MINES,
  adjacentMines,
  createMinesweeper,
  flagsPlaced,
  isWon,
  reveal,
  toggleFlag,
  type MinesweeperState,
} from '../engine/minesweeper';
import type { GameDefinition, GamePlayer, GameSession } from '../types';
import { DIGIT_EMOJI, canRematch, cid, deny, endRows, formatElapsed, isPlayer, linkRematch, mention, quitButton, rememberMessage, sessionFooterLine, updateGame } from './common';

export interface MinesweeperSessionState extends MinesweeperState {
  won: boolean;
  finishedAt: number | null;
}

const RULES = 'Révélez toutes les cases sans mine. Les chiffres indiquent le nombre de mines adjacentes.';

function elapsedMs(state: MinesweeperSessionState): number {
  if (!state.startedAt) return 0;
  return (state.finishedAt ?? Date.now()) - state.startedAt;
}

function recordOutcome(session: GameSession<MinesweeperSessionState>, won: boolean): void {
  const host = session.players[0];
  const seconds = Math.max(1, Math.round(elapsedMs(session.state) / 1_000));
  gameService.record({
    guildId: session.guildId,
    userId: host.id,
    tag: host.name,
    game: 'demineur',
    result: won ? 'win' : 'loss',
    points: won ? session.state.mines * 3 : 0,
    best: won ? seconds : undefined,
    betterIf: 'lower',
  });
}

function cellButton(session: GameSession<MinesweeperSessionState>, index: number, finished: boolean, disabled: boolean): ButtonSpec {
  const { state } = session;
  const id = cid(session, 'cell', index);
  const isMine = state.mineCells?.[index] ?? false;

  if (finished && isMine) {
    if (state.exploded === index) return { id, emoji: '💥', style: 'danger', disabled: true };
    return state.won ? { id, emoji: '🚩', style: 'success', disabled: true } : { id, emoji: '💣', style: 'danger', disabled: true };
  }
  if (state.revealed[index]) {
    const count = adjacentMines(state, index);
    return { id, emoji: count === 0 ? '▪️' : DIGIT_EMOJI[count], style: 'secondary', disabled: true };
  }
  if (state.flagged[index]) return { id, emoji: '🚩', style: 'primary', disabled: disabled || finished };
  return { id, emoji: '⬜', style: 'secondary', disabled: disabled || finished };
}

function render(session: GameSession<MinesweeperSessionState>, options: { disabled?: boolean } = {}): ComponentMessage {
  const { state } = session;
  const finished = session.status === 'finished';
  const revealedCount = state.revealed.filter(Boolean).length;
  const safeCells = MS_CELLS - state.mines;

  const lines = [
    `${mention(session.players[0])} • 💣 **${state.mines}** mines • 🚩 ${flagsPlaced(state)}/${state.mines} • 🔎 ${Math.min(revealedCount, safeCells)}/${safeCells} cases sûres`,
    state.startedAt ? `⏱️ ${formatElapsed(elapsedMs(state))} • ${state.moves} coup(s)` : '⏱️ Le chrono démarre au premier clic (jamais une mine !).',
    finished ? '' : `Mode actuel : ${state.flagMode ? '🚩 **Drapeau** (marquer une mine)' : '⛏️ **Creuser** (révéler une case)'}`,
    finished ? `\n${session.outcome ?? 'Partie terminée.'}` : '',
    '',
    sessionFooterLine(session),
  ].filter((line) => line !== '');

  const embed = baseEmbed({
    title: '💣 Démineur',
    description: lines.join('\n'),
    color: finished ? (state.won ? THEME.colors.success : THEME.colors.error) : THEME.colors.primary,
    footer: `Elysia • mini-jeux • ${RULES}`,
  });

  const rows: ComponentMessage['components'] = [];
  for (let row = 0; row < MS_CELLS / MS_COLS; row += 1) {
    const cells = Array.from({ length: MS_COLS }, (_, col) => cellButton(session, row * MS_COLS + col, finished, Boolean(options.disabled)));
    rows.push(...buttonRows(cells));
  }
  if (options.disabled) return { embeds: [embed], components: finished ? rows : [] };
  if (finished) rows.push(...endRows(session));
  else {
    rows.push(
      ...buttonRows([
        {
          id: cid(session, 'mode'),
          label: state.flagMode ? 'Passer en mode creuser' : 'Passer en mode drapeau',
          emoji: state.flagMode ? '⛏️' : '🚩',
          style: state.flagMode ? 'success' : 'primary',
        },
        quitButton(session),
      ]),
    );
  }
  return { embeds: [embed], components: rows };
}

export interface MinesweeperParams {
  guildId: string;
  channelId: string;
  host: GamePlayer;
  mines?: number;
}

export function createMinesweeperSession(params: MinesweeperParams): GameSession<MinesweeperSessionState> {
  const mines = Math.min(MS_MAX_MINES, Math.max(MS_MIN_MINES, params.mines ?? 4));
  return gameService.createSession<MinesweeperSessionState>({
    game: 'demineur',
    guildId: params.guildId,
    channelId: params.channelId,
    host: params.host,
    state: { ...createMinesweeper(mines), won: false, finishedAt: null },
  });
}

export const minesweeperGame: GameDefinition<MinesweeperSessionState> = {
  id: 'demineur',
  label: 'Démineur',
  emoji: '💣',
  description: 'Grille 5×4 interactive, mode drapeau, premier clic toujours sûr, chrono.',
  idleTimeoutMs: 10 * 60_000,
  render,

  async handle(interaction, session, args) {
    const [action, rawIndex] = args;
    const { state } = session;

    if (action === 'rematch') {
      if (!(await canRematch(interaction, session))) return;
      const fresh = createMinesweeperSession({ guildId: session.guildId, channelId: session.channelId, host: session.players[0], mines: state.mines });
      linkRematch(session, fresh, interaction);
      await updateGame(interaction, render(fresh));
      return;
    }

    if (session.status === 'finished') return deny(interaction, 'Cette partie est terminée.');
    if (!isPlayer(session, interaction.user.id)) return deny(interaction, 'Cette grille appartient à un autre membre. Lancez la vôtre avec `/jeu demineur` !');
    rememberMessage(session, interaction);

    if (action === 'quit') {
      state.finishedAt = Date.now();
      gameService.finish(session, '🏳️ Partie abandonnée.');
      if (state.startedAt) recordOutcome(session, false);
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'mode') {
      state.flagMode = !state.flagMode;
      gameService.touch(session);
      await updateGame(interaction, render(session));
      return;
    }

    if (action === 'cell') {
      const index = Number.parseInt(rawIndex ?? '', 10);
      if (!Number.isInteger(index) || index < 0 || index >= MS_CELLS) return deny(interaction, 'Case invalide.');
      if (state.revealed[index]) return deny(interaction, 'Cette case est déjà révélée.');

      if (state.flagMode) {
        toggleFlag(state, index);
      } else if (state.flagged[index]) {
        return deny(interaction, 'Cette case porte un drapeau : retirez-le d’abord (mode drapeau).');
      } else {
        const outcome = reveal(state, index);
        if (outcome === 'mine') {
          state.finishedAt = Date.now();
          gameService.finish(session, `💥 Boum ! Vous avez touché une mine après ${state.moves} coup(s).`);
          recordOutcome(session, false);
        } else if (isWon(state)) {
          state.won = true;
          state.finishedAt = Date.now();
          gameService.finish(
            session,
            `🎉 Grille déminée en **${formatElapsed(elapsedMs(state))}** et ${state.moves} coup(s) — +${state.mines * 3} points !`,
          );
          recordOutcome(session, true);
        }
      }
      if (session.status === 'playing') gameService.touch(session);
      await updateGame(interaction, render(session));
      return;
    }

    await deny(interaction, 'Action inconnue.');
  },

  onExpire(session) {
    if (session.status !== 'playing') return;
    session.state.finishedAt = Date.now();
    gameService.finish(session, '⌛ Partie expirée par inactivité.');
  },
};
