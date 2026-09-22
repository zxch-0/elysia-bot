/**
 * Fuzzing des mini-jeux — joue des milliers de parties aléatoires à travers
 * le vrai module d'interaction (`g:*`) avec de fausses interactions Discord.
 *
 *   npm run fuzz:games                    (≈ 1 min : 3 manches par scénario)
 *   FUZZ_ROUNDS=25 npm run fuzz:games     (≈ 9 min, passage intensif)
 *   FUZZ_ROUNDS=200 FUZZ_SEED=42 npm run fuzz:games
 *
 * L'avancement s'affiche scénario par scénario : le résumé final (et le code
 * de sortie) n'arrivent qu'à la toute fin, ne croyez donc pas à un blocage
 * tant que la ligne « Fuzzing des mini-jeux » n'est pas affichée.
 *
 * Invariants vérifiés à chaque clic :
 *   • aucune exception ne remonte du module ;
 *   • chaque interaction est acquittée exactement une fois (update / reply /
 *     showModal) — sinon Discord affiche « Échec de l'interaction » ;
 *   • chaque message respecte les limites de l'API Discord (5 rangées max,
 *     5 boutons par rangée, customIds uniques ≤ 100 caractères, libellés ≤ 80,
 *     ≤ 25 options par menu, embed ≤ 6000 caractères…) ;
 *   • les minuteries (quiz, memory) et l'expiration ne cassent rien ;
 *   • les statistiques restent cohérentes (parties = V + D + N, points ≥ 0).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'elysia-fuzz-'));
process.env.DRY_RUN = '1';
process.env.LOG_LEVEL = 'error';

// 3 manches ≈ 1 minute (chaque manche fait jouer 17 scénarios). Pour un
// passage intensif : `FUZZ_ROUNDS=60 npm run fuzz:games`.
const ROUNDS = Math.max(1, Number.parseInt(process.env.FUZZ_ROUNDS ?? '3', 10) || 3);
const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const BOLD = '\u001b[1m';
const RESET = '\u001b[0m';

// ── Horloge factice : les minuteries sont exécutées à la demande ─────────────

interface FakeTimer {
  id: number;
  at: number;
  callback: () => void;
  cleared: boolean;
  unref(): FakeTimer;
  ref(): FakeTimer;
  hasRef(): boolean;
  refresh(): FakeTimer;
}

let virtualNow = 0;
let timerSeq = 0;
const timers = new Map<number, FakeTimer>();
const realSetTimeout = globalThis.setTimeout;

function fakeSetTimeout(callback: (...args: any[]) => void, delay = 0, ...args: any[]): any {
  timerSeq += 1;
  const timer: FakeTimer = {
    id: timerSeq,
    at: virtualNow + Math.max(0, delay),
    callback: () => callback(...args),
    cleared: false,
    unref: () => timer,
    ref: () => timer,
    hasRef: () => false,
    refresh: () => timer,
  };
  timers.set(timer.id, timer);
  return timer;
}

function fakeClearTimeout(timer: any): void {
  if (timer && typeof timer === 'object' && 'id' in timer) {
    const found = timers.get(timer.id);
    if (found) found.cleared = true;
    timers.delete(timer.id);
  }
}

(globalThis as any).setTimeout = fakeSetTimeout;
(globalThis as any).clearTimeout = fakeClearTimeout;
(globalThis as any).setInterval = () => ({ unref() {}, ref() {}, hasRef: () => false });
(globalThis as any).clearInterval = () => undefined;

/** Exécute la prochaine minuterie en attente (retourne false s'il n'y en a plus). */
async function runNextTimer(): Promise<boolean> {
  const pending = [...timers.values()].sort((a, b) => a.at - b.at || a.id - b.id);
  const next = pending[0];
  if (!next) return false;
  timers.delete(next.id);
  virtualNow = Math.max(virtualNow, next.at);
  next.callback();
  // Les callbacks sont asynchrones : on laisse la micro-file se vider.
  await flushMicrotasks();
  return true;
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await new Promise<void>((resolve) => realSetTimeout(resolve, 0));
}

// ── Utilitaires ──────────────────────────────────────────────────────────────

let seed = Number.parseInt(process.env.FUZZ_SEED ?? '', 10) || 123456789;
function rand(): number {
  // xorshift32 déterministe pour pouvoir rejouer un échec.
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) % 1_000_000) / 1_000_000;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

let failures = 0;
let checks = 0;
const failureMessages: string[] = [];
function assert(condition: boolean, message: string): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    if (failureMessages.length < 40) failureMessages.push(message);
  }
}

// ── Validation des limites Discord ───────────────────────────────────────────

interface ComponentSummary {
  customId: string;
  kind: 'button' | 'select';
  disabled: boolean;
  options: string[];
}

function toJson(component: any): any {
  return typeof component?.toJSON === 'function' ? component.toJSON() : component;
}

/** Vérifie un message (embeds + composants) et retourne les composants actifs. */
function validatePayload(payload: any, context: string): ComponentSummary[] {
  const rows: any[] = (payload.components ?? []).map(toJson);
  assert(rows.length <= 5, `${context} : ${rows.length} rangées (> 5)`);
  const ids = new Set<string>();
  const active: ComponentSummary[] = [];

  for (const row of rows) {
    assert(row.type === 1, `${context} : rangée de type ${row.type}`);
    const components: any[] = row.components ?? [];
    assert(components.length >= 1, `${context} : rangée vide`);
    const hasSelect = components.some((component) => component.type !== 2);
    if (hasSelect) assert(components.length === 1, `${context} : menu déroulant partageant une rangée`);
    else assert(components.length <= 5, `${context} : ${components.length} boutons sur une rangée`);

    for (const component of components) {
      const customId: string | undefined = component.custom_id;
      if (component.type === 2 && component.style === 5) continue; // lien
      assert(typeof customId === 'string' && customId.length > 0 && customId.length <= 100, `${context} : customId invalide « ${customId} »`);
      assert(!ids.has(customId!), `${context} : customId dupliqué « ${customId} »`);
      ids.add(customId!);
      if (component.type === 2) {
        assert(Boolean(component.label) || Boolean(component.emoji), `${context} : bouton sans libellé ni emoji (${customId})`);
        assert((component.label ?? '').length <= 80, `${context} : libellé de bouton > 80 (${customId})`);
        if (!component.disabled) active.push({ customId: customId!, kind: 'button', disabled: false, options: [] });
      } else if (component.type === 3) {
        const options: any[] = component.options ?? [];
        assert(options.length >= 1 && options.length <= 25, `${context} : menu avec ${options.length} options`);
        assert((component.placeholder ?? '').length <= 150, `${context} : placeholder > 150`);
        for (const option of options) {
          assert(option.label.length <= 100 && option.value.length <= 100, `${context} : option trop longue`);
          assert(!option.description || option.description.length <= 100, `${context} : description d'option trop longue`);
        }
        assert(new Set(options.map((option) => option.value)).size === options.length, `${context} : valeurs d'option dupliquées`);
        if (!component.disabled) active.push({ customId: customId!, kind: 'select', disabled: false, options: options.map((option) => option.value) });
      }
    }
  }

  const embeds: any[] = (payload.embeds ?? []).map(toJson);
  assert(embeds.length <= 10, `${context} : ${embeds.length} embeds`);
  for (const embed of embeds) {
    const title = embed.title ?? '';
    const description = embed.description ?? '';
    const footer = embed.footer?.text ?? '';
    const fields: any[] = embed.fields ?? [];
    const fieldChars = fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
    assert(title.length <= 256, `${context} : titre > 256`);
    assert(description.length <= 4096, `${context} : description > 4096`);
    assert(footer.length <= 2048, `${context} : footer > 2048`);
    assert(fields.length <= 25, `${context} : > 25 champs`);
    assert(title.length + description.length + footer.length + fieldChars <= 6000, `${context} : embed > 6000 caractères`);
    assert(!/undefined|NaN|\[object Object\]/.test(`${title}\n${description}`), `${context} : « undefined/NaN » dans l'embed`);
  }
  if (typeof payload.content === 'string') assert(payload.content.length <= 2000, `${context} : contenu > 2000`);
  return active;
}

// ── Fausses interactions Discord ─────────────────────────────────────────────

interface FakeUser {
  id: string;
  username: string;
  bot: boolean;
}

interface FakeMessage {
  id: string;
  payload: any;
  edits: number;
  readonly components: any[];
}

interface FakeInteractionOptions {
  user: FakeUser;
  customId: string;
  message: FakeMessage;
  guildId: string;
  values?: string[];
  fields?: Record<string, string>;
  kind: 'button' | 'select' | 'modal';
}

interface FakeInteraction {
  [key: string]: any;
  acknowledgements: number;
  ephemerals: any[];
  shownModal: any | null;
}

function createInteraction(options: FakeInteractionOptions): FakeInteraction {
  const interaction: FakeInteraction = {
    acknowledgements: 0,
    ephemerals: [],
    shownModal: null,
    user: options.user,
    customId: options.customId,
    message: options.message,
    guildId: options.guildId,
    channelId: 'c1',
    createdTimestamp: Date.now(),
    deferred: false,
    replied: false,
    values: options.values ?? [],
    fields: { getTextInputValue: (id: string) => options.fields?.[id] ?? '' },
    isButton: () => options.kind === 'button',
    isStringSelectMenu: () => options.kind === 'select',
    isAnySelectMenu: () => options.kind === 'select',
    isModalSubmit: () => options.kind === 'modal',
    isMessageComponent: () => options.kind !== 'modal',
    isFromMessage: () => true,
    isRepliable: () => true,
    async update(payload: any) {
      if (interaction.replied || interaction.deferred) throw new Error('Interaction has already been acknowledged.');
      interaction.acknowledgements += 1;
      interaction.replied = true;
      options.message.payload = payload;
      options.message.edits += 1;
      validatePayload(payload, `update(${options.customId})`);
    },
    async reply(payload: any) {
      if (interaction.replied || interaction.deferred) throw new Error('Interaction has already been acknowledged.');
      interaction.acknowledgements += 1;
      interaction.replied = true;
      validatePayload(payload, `reply(${options.customId})`);
      interaction.ephemerals.push(payload);
    },
    async followUp(payload: any) {
      if (!interaction.replied && !interaction.deferred) throw new Error('followUp avant acquittement');
      validatePayload(payload, `followUp(${options.customId})`);
      interaction.ephemerals.push(payload);
    },
    async editReply(payload: any) {
      if (!interaction.replied && !interaction.deferred) throw new Error('editReply avant acquittement');
      options.message.payload = payload;
      options.message.edits += 1;
      validatePayload(payload, `editReply(${options.customId})`);
    },
    async deferUpdate() {
      if (interaction.replied || interaction.deferred) throw new Error('Interaction has already been acknowledged.');
      interaction.acknowledgements += 1;
      interaction.deferred = true;
    },
    async showModal(modal: any) {
      if (interaction.replied || interaction.deferred) throw new Error('Interaction has already been acknowledged.');
      interaction.acknowledgements += 1;
      interaction.replied = true;
      const json = toJson(modal);
      assert(typeof json.custom_id === 'string' && json.custom_id.length <= 100, 'modale : customId invalide');
      assert(json.title.length <= 45, 'modale : titre > 45');
      for (const row of json.components ?? []) {
        for (const input of row.components ?? []) {
          assert(input.label.length <= 45, 'modale : libellé > 45');
          assert(!input.placeholder || input.placeholder.length <= 100, 'modale : placeholder > 100');
        }
      }
      interaction.shownModal = json;
    },
  };
  return interaction;
}

// ── Scénario principal ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`${BOLD}🎮 Fuzzing des mini-jeux — ${ROUNDS} manche(s) par scénario (17 scénarios)…${RESET}`);
  const { db } = await import('../src/core/database');
  await db.init();
  const { gameService } = await import('../src/services/gameService');
  const { registerGames, GAME_DEFINITIONS } = await import('../src/games/registry');
  const { gameModule } = await import('../src/modules/gameModule');
  const ui = {
    tictactoe: await import('../src/games/ui/tictactoe'),
    connectFour: await import('../src/games/ui/connectFour'),
    rps: await import('../src/games/ui/rps'),
    memory: await import('../src/games/ui/memory'),
    hangman: await import('../src/games/ui/hangman'),
    motus: await import('../src/games/ui/motus'),
    quiz: await import('../src/games/ui/quiz'),
    minesweeper: await import('../src/games/ui/minesweeper'),
    game2048: await import('../src/games/ui/game2048'),
    blackjack: await import('../src/games/ui/blackjack'),
  };
  registerGames();

  const messages = new Map<string, FakeMessage>();
  let messageSeq = 0;
  const refreshErrors: string[] = [];
  const fakeClient: any = {
    rest: {
      // PATCH /channels/{channel}/messages/{message} → édition directe du message.
      async patch(route: string, options: { body: any }) {
        const id = route.split('/').pop() ?? '';
        const message = messages.get(id);
        if (!message) throw new Error(`Unknown Message ${id}`);
        message.payload = options.body;
        message.edits += 1;
        validatePayload(options.body, `refresh(${id})`);
      },
    },
  };
  gameService.attach(fakeClient);
  void refreshErrors;

  const GUILD = '111111111111111111';
  const alice: FakeUser = { id: '1001', username: 'Alice', bot: false };
  const bob: FakeUser = { id: '1002', username: 'Bob', bot: false };
  const carol: FakeUser = { id: '1003', username: 'Carol', bot: false };
  const users = [alice, bob, carol];
  const asPlayer = (user: FakeUser) => ({ id: user.id, name: user.username });

  const WORDS = ['PIANO', 'ELEVE', 'CŒUR', 'abc', 'zzzzz', 'TABLE', 'Thé', '12345', 'MAISON', 'chien', 'cœurs', 'É', ''];

  /** Publie le message initial d'une session (comme le fait /jeu). */
  function publish(session: any): FakeMessage {
    messageSeq += 1;
    const message: FakeMessage = {
      id: `m${messageSeq}`,
      payload: null,
      edits: 0,
      // Comme `Message#components` : les rangées actuellement affichées.
      get components() {
        return (this.payload?.components ?? []).map(toJson);
      },
    };
    const definition = gameService.definition(session.game)!;
    message.payload = definition.render(session);
    validatePayload(message.payload, `render initial ${session.game}`);
    messages.set(message.id, message);
    session.messageId = message.id;
    return message;
  }

  /** Envoie une interaction au module comme le ferait le routeur. */
  async function dispatch(options: FakeInteractionOptions): Promise<FakeInteraction> {
    const interaction = createInteraction(options);
    const args = options.customId.split(':').slice(1);
    try {
      await gameModule.handle(interaction as any, fakeClient, args);
    } catch (error) {
      const isBotError = (error as any)?.name === 'BotError';
      // Les BotError sont converties en réponse éphémère par le routeur : on simule.
      if (isBotError) {
        if (!interaction.replied) await interaction.reply({ embeds: [], flags: 64 });
      } else {
        assert(false, `exception sur ${options.customId} (${options.kind}) : ${(error as Error).stack ?? error}`);
      }
    }
    assert(interaction.acknowledgements === 1, `${options.customId} (${options.kind}, ${options.user.username}) acquittée ${interaction.acknowledgements} fois`);
    return interaction;
  }

  /** Composants du rendu précédent : simule les clics « en retard » (spam, latence). */
  let staleComponents: ComponentSummary[] = [];

  /** Joue un clic aléatoire sur le message (bouton, menu ou modale qui en découle). */
  async function randomClick(message: FakeMessage, user: FakeUser): Promise<boolean> {
    const active = validatePayload(message.payload, `message ${message.id}`);
    if (active.length === 0 && staleComponents.length === 0) return false;
    const useStale = staleComponents.length > 0 && (active.length === 0 || rand() < 0.12);
    // Les invitations sont acceptées la plupart du temps pour explorer les parties complètes.
    const welcoming = active.filter((candidate) => /:(accept|join)$/.test(candidate.customId));
    // … et les boutons destructeurs (abandon, arrêt, refus) sont rares, pour jouer les parties jusqu'au bout.
    const peaceful = active.filter((candidate) => !/:(quit|stop|cancel|decline)$/.test(candidate.customId));
    const component = useStale
      ? pick(staleComponents)
      : welcoming.length > 0 && rand() < 0.85
        ? pick(welcoming)
        : peaceful.length > 0 && rand() < 0.96
          ? pick(peaceful)
          : pick(active);
    staleComponents = active;
    if (component.kind === 'select') {
      await dispatch({ user, customId: component.customId, message, guildId: GUILD, kind: 'select', values: [pick(component.options)] });
      return true;
    }
    const interaction = await dispatch({ user, customId: component.customId, message, guildId: GUILD, kind: 'button' });
    if (interaction.shownModal) {
      const inputId = interaction.shownModal.components[0].components[0].custom_id as string;
      await dispatch({
        user,
        customId: interaction.shownModal.custom_id,
        message,
        guildId: GUILD,
        kind: 'modal',
        fields: { [inputId]: pick(WORDS) },
      });
    }
    return true;
  }

  /** Invariants de l'état de chaque jeu (vérifiés après chaque clic). */
  function checkInvariants(session: any): void {
    const state = session.state;
    const where = `${session.game}/${session.id}`;
    const powerOfTwo = (value: number) => value === 0 || (Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0);
    switch (session.game) {
      case 'morpion': {
        if (!state.started) break;
        const x = state.board.filter((cell: number) => cell === 1).length;
        const o = state.board.filter((cell: number) => cell === 2).length;
        assert(Math.abs(x - o) <= 1, `${where} : plateau incohérent (${x} X / ${o} O)`);
        assert(!(state.winner !== null && state.draw), `${where} : vainqueur et nul en même temps`);
        break;
      }
      case 'puissance4': {
        if (!state.started) break;
        const cells: number[] = state.board.cells;
        const a = cells.filter((cell) => cell === 1).length;
        const b = cells.filter((cell) => cell === 2).length;
        assert(Math.abs(a - b) <= 1, `${where} : plateau incohérent (${a}/${b})`);
        for (let column = 0; column < 7; column += 1) {
          // Gravité (la ligne 0 est le bas) : aucun jeton ne flotte, et les hauteurs sont justes.
          let seenEmpty = false;
          let count = 0;
          for (let row = 0; row < 6; row += 1) {
            const cell = cells[row * 7 + column];
            if (cell === 0) seenEmpty = true;
            else {
              count += 1;
              assert(!seenEmpty, `${where} : jeton flottant colonne ${column}`);
            }
          }
          assert(state.board.heights[column] === count, `${where} : hauteur de colonne ${column} incohérente`);
        }
        break;
      }
      case 'pfc': {
        assert(state.score[0] <= state.target && state.score[1] <= state.target, `${where} : score au-delà de la cible`);
        assert(state.rounds.length === state.score[0] + state.score[1] + state.rounds.filter((round: any) => round.winner === 0).length, `${where} : manches ≠ scores`);
        // Hors abandon (🏳️) ou forfait (⌛), le vainqueur a forcément atteint la cible.
        if (session.status === 'finished' && state.winner !== null && !/🏳️|⌛/u.test(session.outcome ?? '')) {
          assert(state.score[state.winner] === state.target, `${where} : vainqueur sans avoir atteint la cible`);
        }
        break;
      }
      case 'memory': {
        const matched = state.matched.filter(Boolean).length;
        assert(matched % 2 === 0 && matched / 2 === state.found[0] + state.found[1], `${where} : paires trouvées incohérentes`);
        assert(state.faceUp.length <= 2 && state.faceUp.every((index: number) => !state.matched[index]), `${where} : cartes retournées incohérentes`);
        break;
      }
      case 'pendu': {
        assert(state.errors >= 0 && state.errors <= 6, `${where} : erreurs hors bornes (${state.errors}/6)`);
        assert(new Set(state.guessed).size === state.guessed.length, `${where} : lettre comptée deux fois`);
        break;
      }
      case 'motus': {
        assert(state.attempts.length <= 6, `${where} : trop d'essais`);
        assert(state.attempts.every((attempt: any) => attempt.word.length === 5 && attempt.states.length === 5), `${where} : essai malformé`);
        break;
      }
      case 'quiz': {
        assert(state.index >= 0 && state.index <= state.questions.length, `${where} : index de question hors bornes`);
        for (const score of Object.values<any>(state.scores)) assert(score.points >= 0 && score.correct >= 0 && score.correct <= state.questions.length, `${where} : score incohérent`);
        break;
      }
      case 'demineur': {
        if (!state.mineCells) break;
        assert(state.mineCells.filter(Boolean).length === state.mines, `${where} : nombre de mines incohérent`);
        const revealedMines = state.revealed.filter((revealed: boolean, index: number) => revealed && state.mineCells[index]).length;
        assert(revealedMines === 0 || state.exploded !== null, `${where} : mine révélée sans explosion`);
        assert(state.flagged.every((flag: boolean, index: number) => !(flag && state.revealed[index])), `${where} : case révélée et drapeau`);
        break;
      }
      case '2048': {
        assert(state.grid.length === 16 && state.grid.every(powerOfTwo), `${where} : grille invalide`);
        assert(state.undosLeft >= 0 && state.undosLeft <= 3 && state.history.length <= 3, `${where} : annulations hors bornes`);
        assert(state.score >= 0 && state.moves >= 0, `${where} : score/coups négatifs`);
        break;
      }
      case 'blackjack': {
        assert(state.chips >= 0 && state.peak >= state.chips, `${where} : jetons négatifs ou pic incohérent`);
        assert(state.hands === state.won + state.lost + state.pushed, `${where} : mains ≠ V+D+N`);
        if (state.hand) assert(state.hand.player.length >= 2 && state.hand.dealer.length >= 2, `${where} : main incomplète`);
        break;
      }
      default:
        break;
    }
  }

  /** Vide toutes les minuteries en attente (quiz, memory). */
  async function drainTimers(limit = 200): Promise<void> {
    for (let index = 0; index < limit; index += 1) if (!(await runNextTimer())) break;
  }

  /** Force l'expiration de toutes les parties actives puis lance le balayage. */
  async function expireEverything(): Promise<void> {
    for (const session of (gameService as any).sessions.values()) session.expiresAt = 0;
    await (gameService as any).sweep();
    for (const session of [...(gameService as any).sessions.values()]) gameService.discard(session);
  }

  type Factory = () => any;
  const factories: Array<{ name: string; create: Factory }> = [
    { name: 'morpion IA', create: () => ui.tictactoe.createTicTacToe({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), level: pick(['facile', 'normal', 'imbattable']) }) },
    { name: 'morpion défi', create: () => ui.tictactoe.createTicTacToe({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), opponent: asPlayer(bob) }) },
    { name: 'morpion ouvert', create: () => ui.tictactoe.createTicTacToe({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), open: true }) },
    { name: 'puissance4 IA', create: () => ui.connectFour.createConnectFour({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), level: pick(['facile', 'normal', 'difficile', 'expert']) }) },
    { name: 'puissance4 défi', create: () => ui.connectFour.createConnectFour({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), opponent: asPlayer(bob) }) },
    { name: 'pfc IA', create: () => ui.rps.createRpsSession({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), variant: pick(['classique', 'lezard-spock']), bestOf: pick([1, 3, 5, 7]) }) },
    { name: 'pfc défi', create: () => ui.rps.createRpsSession({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), opponent: asPlayer(bob), bestOf: 3 }) },
    { name: 'pfc ouvert', create: () => ui.rps.createRpsSession({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), open: true, bestOf: 1 }) },
    { name: 'memory solo', create: () => ui.memory.createMemorySession({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), pairs: pick([6, 8, 10]) }) },
    { name: 'memory duel', create: () => ui.memory.createMemorySession({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), opponent: asPlayer(bob), pairs: pick([6, 8, 10]) }) },
    { name: 'pendu solo', create: () => ui.hangman.createHangmanSession({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), theme: 'aleatoire', mode: 'solo' }) },
    { name: 'pendu tous', create: () => ui.hangman.createHangmanSession({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), theme: pick(['animaux', 'pays', 'informatique']), mode: 'tous' }) },
    { name: 'motus', create: () => ui.motus.createMotusSession({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice) }) },
    { name: 'quiz', create: () => ui.quiz.createQuizSession({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), theme: pick(['mix', 'sport', 'langue']), difficulty: pick(['mix', 'facile', 'difficile']), count: pick([3, 5, 20]), secondsPerQuestion: 10 }) },
    { name: 'démineur', create: () => ui.minesweeper.createMinesweeperSession({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice), mines: pick([2, 4, 8]) }) },
    { name: '2048', create: () => ui.game2048.create2048Session({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice) }) },
    { name: 'blackjack', create: () => ui.blackjack.createBlackjackSession({ guildId: GUILD, channelId: 'c1', host: asPlayer(alice) }) },
  ];

  const perGame: Record<string, { sessions: number; clicks: number; finished: number }> = {};
  const started = Date.now();

  const totalFactories = factories.length;
  for (const [factoryIndex, factory] of factories.entries()) {
    const stats = { sessions: 0, clicks: 0, finished: 0 };
    perGame[factory.name] = stats;
    // eslint-disable-next-line no-console
    console.log(`  ⏳ [${factoryIndex + 1}/${totalFactories}] ${factory.name}…`);
    for (let round = 0; round < ROUNDS; round += 1) {
      await expireEverything();
      const session = factory.create();
      stats.sessions += 1;
      const message = publish(session);
      staleComponents = [];
      const maxClicks = 40 + Math.floor(rand() * 260);
      for (let click = 0; click < maxClicks; click += 1) {
        // Joueur aléatoire, avec un biais vers les participants légitimes.
        const user = rand() < 0.8 ? pick([alice, bob]) : pick(users);
        const acted = await randomClick(message, user);
        stats.clicks += 1;
        // De temps en temps, on laisse tourner les minuteries (quiz, memory).
        if (rand() < 0.15) await runNextTimer();
        // Un message ne doit jamais porter plus d'une partie active (revanche en double).
        const attached = [...(gameService as any).sessions.values()].filter(
          (candidate: any) => candidate.messageId === message.id && candidate.status !== 'finished',
        );
        assert(attached.length <= 1, `${factory.name} : ${attached.length} parties actives attachées au même message`);
        for (const candidate of (gameService as any).sessions.values()) checkInvariants(candidate);
        // Plus rien à cliquer : on laisse une minuterie s'écouler (révélation du quiz, retournement du memory)
        // et on ne s'arrête que lorsqu'il n'y a plus rien du tout.
        if (!acted && !(await runNextTimer())) break;
      }
      // Fin de scénario : on épuise les minuteries puis on force l'expiration.
      await drainTimers();
      const live = gameService.get(session.id);
      if (live?.status === 'finished') stats.finished += 1;
      await expireEverything();
      // Après expiration, le message doit être figé (aucun composant actif).
      const remaining = validatePayload(message.payload, `après expiration ${factory.name}`);
      assert(remaining.length === 0, `${factory.name} : ${remaining.length} composant(s) encore actifs après expiration`);
    }
  }

  // Redémarrage du bot : les parties ne sont plus en mémoire mais les messages
  // gardent leurs boutons. Un clic doit figer le message et expliquer la situation.
  for (const factory of factories) {
    await expireEverything();
    const session = factory.create();
    const message = publish(session);
    const before = validatePayload(message.payload, `orphelin ${factory.name}`);
    for (const timer of session.timers?.values?.() ?? []) fakeClearTimeout(timer);
    (gameService as any).sessions.delete(session.id);
    if (before.length === 0) continue;
    const target = pick(before);
    const interaction = await dispatch({
      user: alice,
      customId: target.customId,
      message,
      guildId: GUILD,
      kind: target.kind,
      values: target.kind === 'select' ? [pick(target.options)] : undefined,
    });
    assert(interaction.ephemerals.length === 1, `${factory.name} : clic orphelin sans explication privée`);
    const after = validatePayload(message.payload, `orphelin figé ${factory.name}`);
    assert(after.length === 0, `${factory.name} : ${after.length} bouton(s) encore actifs après un clic orphelin`);
    await drainTimers();
  }

  // Cohérence des statistiques persistées.
  for (const user of users) {
    const stats = gameService.stats(GUILD, user.id);
    if (!stats) continue;
    let total = 0;
    for (const [game, record] of Object.entries(stats.games)) {
      const r = record!;
      assert(r.played === r.wins + r.losses + r.draws, `${user.username}/${game} : parties ≠ V+D+N`);
      assert(r.points >= 0 && Number.isFinite(r.points), `${user.username}/${game} : points invalides`);
      assert(r.bestStreak >= r.streak, `${user.username}/${game} : série incohérente`);
      total += r.points;
    }
    assert(total === stats.points, `${user.username} : total de points incohérent (${total} ≠ ${stats.points})`);
  }
  assert(GAME_DEFINITIONS.length === 10, 'catalogue : 10 jeux attendus');

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  // eslint-disable-next-line no-console
  console.log(`\n${BOLD}🎮 Fuzzing des mini-jeux — ${ROUNDS} partie(s) par scénario, ${elapsed} s${RESET}`);
  for (const [name, stats] of Object.entries(perGame)) {
    // eslint-disable-next-line no-console
    console.log(`  ${name.padEnd(16)} ${String(stats.sessions).padStart(4)} parties  ${String(stats.clicks).padStart(6)} clics  ${String(stats.finished).padStart(4)} terminées`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n${checks} vérification(s) — ${failures === 0 ? `${GREEN}aucune anomalie${RESET}` : `${RED}${failures} anomalie(s)${RESET}`}`);
  for (const message of failureMessages) console.log(`  ${RED}✖${RESET} ${message}`);

  await db.flushAll().catch(() => undefined);
  rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
