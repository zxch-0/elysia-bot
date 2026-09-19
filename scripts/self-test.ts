/**
 * Auto-test d'Elysia — vérifie la logique métier sans connexion à Discord.
 *
 *   npm run self-test
 *
 * Couvre : parsing des durées, base JSON, permissions, cases, tirages
 * pondérés des giveaways, panneaux de rôles, configuration et chargement
 * de toutes les commandes. Aucune donnée réelle n'est touchée (DATA_DIR
 * redirigé vers un dossier temporaire).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'elysia-test-'));
process.env.DRY_RUN = '1';
process.env.LOG_LEVEL = 'error';

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const DIM = '\u001b[90m';
const BOLD = '\u001b[1m';
const RESET = '\u001b[0m';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    // eslint-disable-next-line no-console
    console.log(`  ${GREEN}✔${RESET} ${label}`);
  } else {
    failed += 1;
    // eslint-disable-next-line no-console
    console.log(`  ${RED}✖${RESET} ${label}${detail !== undefined ? ` ${DIM}→ ${JSON.stringify(detail)}${RESET}` : ''}`);
  }
}

function section(title: string): void {
  // eslint-disable-next-line no-console
  console.log(`\n${BOLD}${title}${RESET}`);
}

/** Faux serveur Discord minimal pour tester les services hors ligne. */
function fakeGuild(id = '111111111111111111') {
  const roles = new Map<string, any>();
  const members = new Map<string, any>();
  const channels = new Map<string, any>();
  const guild: any = {
    id,
    name: 'Serveur de test',
    ownerId: '999',
    memberCount: 42,
    members: { cache: members, me: undefined },
    roles: { cache: roles, everyone: { id } },
    channels: { cache: channels },
    bans: { fetch: async () => new Map() },
  };
  return guild;
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n${BOLD}🧪 Elysia — auto-test${RESET} ${DIM}(données temporaires : ${process.env.DATA_DIR})${RESET}`);

  const { parseDuration, formatDuration, clampTimeout, timestampTag, MAX_TIMEOUT_MS } = await import('../src/utils/duration');
  const { truncate, progressBar, bulletList, humanizeNumber } = await import('../src/utils/format');
  const { pickWeightedWinners, shuffle, slugify, shortCode } = await import('../src/utils/random');
  const { db } = await import('../src/core/database');
  const { guildService } = await import('../src/services/guildService');
  const { caseService } = await import('../src/services/caseService');
  const { giveawayService, checkEntryRequirements, computeTickets } = await import('../src/services/giveawayService');
  const { panelService } = await import('../src/services/panelService');
  const { renderConfig } = await import('../src/commands/config/config');
  const { createClient } = await import('../src/core/client');
  const { loadCommands } = await import('../src/core/handlers/commandLoader');
  const { registerInteractionModules } = await import('../src/modules');

  // ── Durées ────────────────────────────────────────────────────────────────
  section('⏳ Parsing et formatage des durées');
  check('« 10m » = 600 000 ms', parseDuration('10m') === 600_000);
  check('« 1j12h » = 129 600 000 ms', parseDuration('1j12h') === 129_600_000);
  check('« 2 heures » = 7 200 000 ms', parseDuration('2 heures') === 7_200_000);
  check('« 45 » = 45 minutes', parseDuration('45') === 2_700_000);
  check('« 30s » = 30 000 ms', parseDuration('30s') === 30_000);
  check('« perm » = 0 (permanent)', parseDuration('perm') === 0);
  check('« nimportequoi » = null', parseDuration('nimportequoi') === null);
  check('« 5x » = null (unité inconnue)', parseDuration('5x') === null);
  check('formatDuration(5 400 000) = « 1 h 30 min »', formatDuration(5_400_000) === '1 h 30 min', formatDuration(5_400_000));
  check('formatDuration(0) = « permanent »', formatDuration(0) === 'permanent');
  check('clampTimeout borne à 28 jours', clampTimeout(MAX_TIMEOUT_MS * 2) === MAX_TIMEOUT_MS);
  check('timestampTag produit <t:…:R>', /^<t:\d+:R>$/.test(timestampTag(Date.now(), 'R')));

  // ── Formatage ─────────────────────────────────────────────────────────────
  section('🎨 Formatage');
  check('truncate coupe avec « … »', truncate('abcdefghij', 5).endsWith('…'));
  check('progressBar retourne 12 caractères', progressBar(5, 10).length === 12);
  check('bulletList vide → texte par défaut', bulletList([], { emptyText: '*aucun*' }) === '*aucun*');
  check('humanizeNumber formate 12345', humanizeNumber(12_345).replace(/\s|\u202f/g, '') === '12345');

  // ── Aléatoire ─────────────────────────────────────────────────────────────
  section('🎲 Tirages aléatoires');
  const winners = pickWeightedWinners(
    [
      { id: 'a', weight: 1 },
      { id: 'b', weight: 5 },
      { id: 'c', weight: 0 },
    ],
    2,
  );
  check('2 gagnants tirés sans remise', winners.length === 2 && new Set(winners).size === 2);
  check('poids nul exclu du tirage', !winners.includes('c'));
  check('shuffle conserve la taille', shuffle([1, 2, 3, 4, 5]).length === 5);
  check('slugify normalise « Mes Rôles ! »', slugify('Mes Rôles !') === 'mes-roles', slugify('Mes Rôles !'));
  check('shortCode génère 6 caractères', shortCode(6).length === 6);

  // ── Base de données ───────────────────────────────────────────────────────
  section('💾 Base de données JSON');
  await db.init();
  const collection = db.collection<{ id: string; value: number }>('selftest');
  collection.set({ id: 'doc-1', value: 1 });
  collection.update('doc-1', (doc) => ({ ...doc, value: doc.value + 41 }));
  await collection.flush();
  const reloaded = db.collection<{ id: string; value: number }>('selftest');
  await reloaded.load();
  check('document persisté après rechargement', reloaded.get('doc-1')?.value === 42, reloaded.get('doc-1'));
  check('collection.count fonctionne', reloaded.count() === 1);

  // ── Configuration serveur ─────────────────────────────────────────────────
  section('⚙️ Configuration par serveur');
  const guildId = '111111111111111111';
  const defaults = guildService.get(guildId);
  check('modules activés par défaut', defaults.modules.moderation && defaults.modules.giveaways);
  check('3 paliers de sanctions par défaut', defaults.warnings.thresholds.length === 3);
  const updated = guildService.update(guildId, { channels: { modLog: '222' }, modules: { welcome: true } });
  check('fusion profonde des salons', updated.channels.modLog === '222');
  check('fusion profonde des modules (sans écraser)', updated.modules.moderation === true && updated.modules.welcome === true);
  check('compteur de cases incrémental', guildService.nextCaseId(guildId) === 1 && guildService.nextCaseId(guildId) === 2);
  check('renderConfig contient les sections clés', /\*\*Modules :\*\*/.test(renderConfig(updated)) && /Giveaways/.test(renderConfig(updated)));

  // ── Cases de modération ───────────────────────────────────────────────────
  section('📁 Cases de modération');
  const entry = caseService.create({
    guildId,
    caseNumber: 1,
    type: 'warn',
    targetId: '555',
    targetTag: 'Cible#0001',
    moderatorId: '666',
    moderatorTag: 'Modo#0002',
    reason: 'test',
    duration: 0,
    expiresAt: 0,
    autoRevertAt: null,
  });
  check('case créée avec identifiant composé', entry.id === `${guildId}:1`);
  check('case retrouvée par numéro', caseService.get(guildId, 1)?.targetTag === 'Cible#0001');
  check('comptage des avertissements actifs', caseService.countActiveWarnings(guildId, '555') === 1);
  caseService.update(guildId, 1, { active: false });
  check('avertissement désactivé non compté', caseService.countActiveWarnings(guildId, '555') === 0);
  check('listUser retourne l’historique', caseService.listUser(guildId, '555').length === 1);

  // ── Panneaux de rôles ─────────────────────────────────────────────────────
  section('🎭 Panneaux de rôles');
  const panel = panelService.create({
    guildId,
    name: 'Test panneau',
    channelId: '333',
    title: 'Choisis ton rôle',
    description: 'Description',
    roles: [
      { roleId: '700', label: 'Gamer', emoji: '🎮', style: 'primary' },
      { roleId: '701', label: 'Artiste', emoji: '🎨', style: 'success' },
    ],
    mode: 'buttons',
    behaviour: 'toggle',
    createdBy: '666',
  });
  const panelEmbed = panelService.buildEmbed(panel).toJSON();
  const panelComponents = panelService.buildComponents(panel).map((row) => row.toJSON());
  check('panneau enregistré et relu', panelService.get(panel.id)?.title === 'Choisis ton rôle');
  check('embed de panneau généré', panelEmbed.title === 'Choisis ton rôle' && Boolean(panelEmbed.description));
  check('une ligne de boutons pour 2 rôles', panelComponents.length === 1);
  check('customId de bouton conforme (rr:toggle:…)', String((panelComponents[0] as any).components[0].custom_id).startsWith(`rr:toggle:${panel.id}:`));
  const selectPanel = panelService.update(panel.id, { mode: 'select' });
  const selectComponents = panelService.buildComponents(selectPanel).map((row) => row.toJSON());
  check('mode menu déroulant pris en compte', String((selectComponents[0] as any).components[0].custom_id) === `rr:select:${panel.id}`);
  check('diagnostic signale les rôles absents', panelService.diagnose(fakeGuild(guildId), panel).length > 0);

  // ── Giveaways ─────────────────────────────────────────────────────────────
  section('🎁 Giveaways');
  const giveaway = giveawayService.create({
    guildId,
    channelId: '444',
    prize: 'Nitro',
    winnerCount: 2,
    hostId: '666',
    hostTag: 'Hôte#0003',
    durationMs: 60_000,
    requireAccountAge: 0,
  });
  check('giveaway créé avec identifiant court', giveaway.id.endsWith(':1'));
  check('giveaway retrouvé par identifiant court', giveawayService.get(`${guildId}:1`)?.prize === 'Nitro');
  giveawayService.addEntry(giveaway.id, '801');
  giveawayService.addEntry(giveaway.id, '802');
  giveawayService.addEntry(giveaway.id, '801');
  check('participations dédupliquées', (giveawayService.get(giveaway.id)?.entries.length ?? 0) === 2);
  giveawayService.removeEntry(giveaway.id, '802');
  check('retrait de participation', (giveawayService.get(giveaway.id)?.entries.length ?? 0) === 1);

  const fakeMember: any = {
    id: '801',
    guild: null as any,
    user: { id: '801', tag: 'Membre#0004', createdTimestamp: Date.now() - 30 * 86_400_000, displayAvatarURL: () => '' },
    roles: { cache: new Map() },
    joinedTimestamp: Date.now() - 15 * 86_400_000,
  };
  const guild = fakeGuild(guildId);
  fakeMember.guild = guild;
  guild.members.cache.set('801', fakeMember);
  check('conditions de participation respectées', checkEntryRequirements(giveawayService.get(giveaway.id)!, fakeMember, guildService.get(guildId)).ok);

  const bonusGiveaway = giveawayService.update(giveaway.id, {
    bonusRoles: [{ roleId: '900', tickets: 3 }],
  })!;
  fakeMember.roles.cache.set('900', { id: '900' });
  check('tickets bonus appliqués (1 + 3)', computeTickets(bonusGiveaway, fakeMember) === 4);

  const result = await giveawayService.end(giveawayService.get(giveaway.id)!, guild);
  check('tirage effectué parmi les participants', result.winners.length === 1 && result.winners[0] === '801', result);
  check('giveaway marqué comme terminé', giveawayService.get(giveaway.id)?.ended === true);
  check('liste des giveaways actifs vide', giveawayService.listActive(guildId).length === 0);
  check('liste des giveaways terminés alimentée', giveawayService.listEnded(guildId).length === 1);

  // ── Chargement des commandes ──────────────────────────────────────────────
  section('🧩 Chargement des commandes et modules');
  const client = createClient();
  await loadCommands(client);
  registerInteractionModules(client);
  check('au moins 20 commandes chargées', client.commands.size >= 20, client.commands.size);
  check('commande /giveaway présente', client.commands.has('giveaway'));
  check('commande /rolepanel présente', client.commands.has('rolepanel'));
  check('commande /embed présente', client.commands.has('embed'));
  check('commandes uniques (noms sans doublon)', new Set([...client.commands.keys()]).size === client.commands.size);
  check('7 modules d’interaction enregistrés', client.modules.size === 7, client.modules.size);
  check('commande /jeu présente', client.commands.has('jeu'));
  check('module de mini-jeux (préfixe g) enregistré', client.modules.has('g'));
  check('cooldown bloqué au second appel immédiat', (() => {
    const fake = { user: { id: '1' }, commandName: 'giveaway' } as any;
    client.checkCooldown(fake, 5);
    return client.checkCooldown(fake, 5).blocked;
  })());

  const { buildHelpEmbed, helpTotalPages } = await import('../src/commands/utility/help');
  check('aide paginée générée', buildHelpEmbed(client, 0).toJSON().title?.includes('Elysia') === true);
  check('nombre de pages ≥ 1', helpTotalPages(client) >= 1);

  const helpJson = buildHelpEmbed(client, 0).toJSON();
  check('aide sans dépassement de champ (>1024)', (helpJson.fields ?? []).every((field) => field.value.length <= 1024));

  // ── Régressions (bugs corrigés) ───────────────────────────────────────────
  section('🐛 Régressions corrigées');
  const { buildContext } = await import('../src/core/handlers/commandHandler');
  const fakeInteraction: any = {
    guild: { id: guildId },
    member: { id: '666' },
    channel: { id: '555', type: 0 },
    options: {
      get: (key: string) => (key === 'salon' ? { channel: { id: '777', type: 0 } } : null),
      getSubcommand: () => 'liste',
      getSubcommandGroup: () => null,
    },
  };
  const ctxWithOption = buildContext(fakeInteraction, client);
  check('ctx.channel : option fournie → salon de l’option', ctxWithOption.channel('salon', undefined, [0]).id === '777');

  const noOptionInteraction: any = {
    ...fakeInteraction,
    options: { get: () => null, getSubcommand: () => 'liste', getSubcommandGroup: () => null },
  };
  const ctxNoOption = buildContext(noOptionInteraction, client);
  check('ctx.channel : option absente → salon courant (bug /purge)', ctxNoOption.channel('salon', undefined, [0]).id === '555');

  let stringThrew = false;
  try {
    ctxNoOption.string('introuvable');
  } catch {
    stringThrew = true;
  }
  check('ctx.string : option absente → erreur claire (pas le nom de la sous-commande)', stringThrew);

  const { moderationService } = await import('../src/services/moderationService');
  const muteGuildId = '333333333333333333';
  const muteGuild: any = fakeGuild(muteGuildId);
  muteGuild.members.me = { id: 'bot-1', roles: { highest: { position: 10 } } };
  muteGuild.roles.cache.set('999', { id: '999', name: 'Muted' });
  const muteTarget: any = {
    id: '801',
    user: { id: '801', tag: 'Cible#0001', createdTimestamp: Date.now() - 86_400_000, send: async () => undefined },
    roles: { cache: new Map(), highest: { position: 1 }, add: async () => undefined },
  };
  guildService.update(muteGuildId, { modules: { logs: false }, roles: { mute: '999' }, mute: { mode: 'role' } });

  const muteModerator: any = { id: '666', tag: 'Modo#0002' };
  const muteModeratorMember: any = { id: '666', roles: { highest: { position: 5 } } };
  const mutePerm = await moderationService.mute({
    guild: muteGuild,
    moderator: muteModerator,
    moderatorMember: muteModeratorMember,
    target: muteTarget,
    reason: 'test perm',
    duration: 0,
    useRole: true,
  });
  check(
    'mute « perm » (durée 0) en mode rôle → illimité',
    mutePerm.caseEntry.duration === 0 && mutePerm.caseEntry.autoRevertAt === null,
    mutePerm.caseEntry,
  );

  const muteTimed = await moderationService.mute({
    guild: muteGuild,
    moderator: muteModerator,
    moderatorMember: muteModeratorMember,
    target: muteTarget,
    reason: 'test durée',
    duration: 3_600_000,
    useRole: true,
  });
  check(
    'mute durée explicite en mode rôle → retrait automatique programmé',
    muteTimed.caseEntry.duration === 3_600_000 && typeof muteTimed.caseEntry.autoRevertAt === 'number',
    muteTimed.caseEntry,
  );

  // ── Mini-jeux ─────────────────────────────────────────────────────────────
  section('🎮 Mini-jeux — moteurs');
  const ttt = await import('../src/games/engine/tictactoe');
  {
    // L'IA imbattable ne perd jamais face à des coups aléatoires.
    let lost = 0;
    for (let game = 0; game < 60; game += 1) {
      const board = ttt.createBoard();
      let current: 1 | 2 = game % 2 === 0 ? 1 : 2;
      while (!ttt.findWinner(board) && !ttt.isFull(board)) {
        const moves = ttt.availableMoves(board);
        const move = current === 2 ? ttt.bestMove(board, 2, 'imbattable') : moves[Math.floor(Math.random() * moves.length)];
        board[move] = current;
        current = ttt.opponentOf(current);
      }
      if (ttt.findWinner(board)?.mark === 1) lost += 1;
    }
    check('morpion : IA imbattable invaincue sur 60 parties', lost === 0, lost);
    const board = ttt.createBoard();
    board[0] = 1;
    board[1] = 1;
    check('morpion : victoire immédiate détectée', ttt.bestMove(board, 1, 'imbattable') === 2);
    check('morpion : blocage de la menace adverse', ttt.bestMove(board, 2, 'normal') === 2);
  }

  const c4 = await import('../src/games/engine/connectFour');
  {
    const board = c4.createBoard();
    for (const column of [0, 1, 0, 1, 0, 1]) c4.play(board, column, board.moves % 2 === 0 ? 1 : 2);
    const row = c4.play(board, 0, 1);
    check('puissance 4 : alignement vertical détecté', c4.winningLine(board, row, 0)?.length === 4);
    // Disque 1 aligne 2-3-4 sur la première rangée : menace double (colonnes 1 et 5).
    const threat = c4.createBoard();
    for (const [column, disc] of [[2, 1], [6, 2], [3, 1], [0, 2], [4, 1]] as Array<[number, 1 | 2]>) c4.play(threat, column, disc);
    const started = Date.now();
    const move = c4.bestMove(threat, 1, 'expert');
    check('puissance 4 : l’IA prend la victoire immédiate', move.column === 1 || move.column === 5, move);
    check('puissance 4 : réflexion sous la seconde', Date.now() - started < 1_000, Date.now() - started);
    check('puissance 4 : l’IA bloque une menace adverse', [1, 5].includes(c4.bestMove(threat, 2, 'normal').column));
  }

  const motus = await import('../src/games/engine/motus');
  check('motus : lettres répétées scorées correctement', motus.scoreGuess('ALLEE', 'ELEVE').join(',') === 'present,correct,absent,absent,correct');
  check('motus : mot exact → tout vert', motus.scoreGuess('PIANO', 'PIANO').every((state) => state === 'correct'));
  check('motus : normalisation des accents', motus.normalizeGuess('élève') === 'ELEVE');
  check('motus : longueur invalide refusée', motus.normalizeGuess('abc') === null);

  const words = await import('../src/games/data/words');
  check('motus : dictionnaire de mots de 5 lettres valide', words.MOTUS_WORDS.length >= 300 && words.MOTUS_WORDS.every((word) => /^[A-Z]{5}$/.test(word)));
  check('motus : dictionnaire sans doublon', new Set(words.MOTUS_WORDS).size === words.MOTUS_WORDS.length);
  check(
    'pendu : chaque thème a au moins 20 mots',
    Object.values(words.HANGMAN_WORDS).every((list) => list.length >= 20 && list.every((word) => word.length >= 4)),
  );

  const hangman = await import('../src/games/engine/hangman');
  {
    const state = hangman.createHangman('animaux');
    const letter = state.word[0];
    check('pendu : lettre présente → hit', hangman.guessLetter(state, letter.toLowerCase(), 'u1') === 'hit');
    check('pendu : lettre répétée → repeat', hangman.guessLetter(state, letter, 'u1') === 'repeat');
    check('pendu : caractère invalide refusé', hangman.guessLetter(state, '3', 'u1') === 'invalid');
    const before = state.errors;
    check('pendu : mot faux → erreur', hangman.guessWord(state, 'zzzzzz', 'u2') === false && state.errors === before + 1);
    check('pendu : mot juste → victoire', hangman.guessWord(state, state.display, 'u2') && hangman.isWon(state) && state.solvedBy === 'u2');
  }

  const questions = await import('../src/games/data/questions');
  check('quiz : au moins 100 questions', questions.QUIZ_QUESTIONS.length >= 100, questions.QUIZ_QUESTIONS.length);
  check(
    'quiz : 4 réponses distinctes par question',
    questions.QUIZ_QUESTIONS.every((question) => question.answers.length === 4 && new Set(question.answers).size === 4),
  );
  check(
    'quiz : chaque thème est couvert',
    (Object.keys(questions.QUIZ_THEMES) as Array<keyof typeof questions.QUIZ_THEMES>).every((theme) =>
      questions.QUIZ_QUESTIONS.some((question) => question.theme === theme),
    ),
  );
  const quiz = await import('../src/games/engine/quiz');
  {
    const prepared = quiz.pickQuestions(5, 'geographie', 'mix');
    check('quiz : sélection par thème', prepared.length === 5 && prepared.every((question) => question.theme === 'geographie'));
    const source = questions.QUIZ_QUESTIONS[0];
    const shuffled = quiz.prepare(source);
    check('quiz : la bonne réponse suit le mélange', shuffled.answers[shuffled.correct] === source.answers[0]);
    check('quiz : bonus de rapidité décroissant', quiz.scoreAnswer(0, 20_000, 1) > quiz.scoreAnswer(20_000, 20_000, 1));
  }

  const mines = await import('../src/games/engine/minesweeper');
  {
    let safeFirstClick = true;
    let cleared = 0;
    for (let round = 0; round < 100; round += 1) {
      const state = mines.createMinesweeper(6);
      mines.reveal(state, 7);
      if (state.mineCells![7]) safeFirstClick = false;
      for (let index = 0; index < mines.MS_CELLS; index += 1) if (!state.mineCells![index]) mines.reveal(state, index);
      if (mines.isWon(state)) cleared += 1;
    }
    check('démineur : premier clic jamais miné', safeFirstClick);
    check('démineur : victoire détectée après révélation des cases sûres', cleared === 100, cleared);
    check('démineur : voisinage du coin = 3 cases', mines.neighbours(0).length === 3);
  }

  const g2048 = await import('../src/games/engine/game2048');
  check('2048 : fusion simple [2,2,4,0] → [4,4,0,0]', g2048.slideLine([2, 2, 4, 0]).line.join(',') === '4,4,0,0');
  check('2048 : pas de double fusion [2,2,2,2] → [4,4,0,0]', g2048.slideLine([2, 2, 2, 2]).line.join(',') === '4,4,0,0');
  check('2048 : grille pleine sans fusion = fin', !g2048.canMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]));
  {
    const state = g2048.createGame();
    check('2048 : deux tuiles au départ', state.grid.filter((value) => value > 0).length === 2);
    const before = [...state.grid];
    let moved = false;
    for (const direction of ['left', 'right', 'up', 'down'] as const) if (g2048.move(state, direction)) { moved = true; break; }
    check('2048 : annulation restaure la grille', moved && g2048.undo(state) && state.grid.join(',') === before.join(','));
  }

  const blackjack = await import('../src/games/engine/blackjack');
  check('blackjack : as souple (A+K = 21)', blackjack.handValue([{ rank: 'A', suit: '♠' }, { rank: 'K', suit: '♥' }]).total === 21);
  check('blackjack : as rétrogradés (A+A+9 = 21)', blackjack.handValue([{ rank: 'A', suit: '♠' }, { rank: 'A', suit: '♥' }, { rank: '9', suit: '♦' }]).total === 21);
  {
    let dealerRule = true;
    for (let round = 0; round < 200; round += 1) {
      const state = blackjack.createBlackjack();
      while (!state.finished) blackjack.stand(state);
      const dealer = blackjack.handValue(state.dealer).total;
      if (!blackjack.isBlackjack(state.player) && dealer < 17) dealerRule = false;
    }
    check('blackjack : le croupier tire jusqu’à 17', dealerRule);
  }

  const rps = await import('../src/games/engine/rps');
  check('pfc : pierre bat ciseaux', rps.resolveRound('pierre', 'ciseaux') === 1 && rps.resolveRound('ciseaux', 'pierre') === 2);
  check('pfc : spock bat pierre, lézard bat spock', rps.resolveRound('spock', 'pierre') === 1 && rps.resolveRound('lezard', 'spock') === 1);
  check('pfc : chaque coup étendu bat exactement 2 coups', rps.EXTENDED_MOVES.every((move) => rps.EXTENDED_MOVES.filter((other) => rps.resolveRound(move, other) === 1).length === 2));

  const memory = await import('../src/games/engine/memory');
  {
    const state = memory.createMemory(8);
    const twin = state.cards.indexOf(state.cards[0], 1);
    check('memory : 16 cartes / 8 symboles', state.cards.length === 16 && new Set(state.cards).size === 8);
    check('memory : paire détectée', memory.flip(state, 0) === 'first' && memory.flip(state, twin) === 'match' && state.found[0] === 1);
    const other = state.cards.findIndex((_, index) => !state.matched[index]);
    const different = state.cards.findIndex((symbol, index) => !state.matched[index] && symbol !== state.cards[other]);
    check('memory : paire ratée', memory.flip(state, other) === 'first' && memory.flip(state, different) === 'mismatch');
  }

  section('🎮 Mini-jeux — sessions, rendu et statistiques');
  const { gameService } = await import('../src/services/gameService');
  const { registerGames, GAME_DEFINITIONS } = await import('../src/games/registry');
  registerGames();
  check('10 jeux enregistrés', gameService.listDefinitions().length === 10 && GAME_DEFINITIONS.length === 10);

  const { createTicTacToe } = await import('../src/games/ui/tictactoe');
  const host = { id: '42', name: 'Alice' };
  const guest = { id: '43', name: 'Bob' };
  {
    const solo = createTicTacToe({ guildId: 'g1', channelId: 'c1', host, level: 'imbattable' });
    check('session IA créée en état « playing »', solo.status === 'playing' && solo.players[1].id === 'ai');
    const payload = gameService.definition(solo.game)!.render(solo);
    check('rendu morpion : 9 cases + 1 rangée de contrôle', payload.components?.length === 4);
    const duel = createTicTacToe({ guildId: 'g1', channelId: 'c1', host, opponent: guest });
    check('défi direct en salle d’attente', duel.status === 'waiting' && duel.players.length === 2);
    const lobby = gameService.definition(duel.game)!.render(duel);
    check('rendu salle d’attente : boutons accepter/refuser/annuler', (lobby.components?.[0] as any)?.components?.length === 3);
    gameService.finish(duel, 'test');
    const disabled = gameService.definition(solo.game)!.render(solo, { disabled: true });
    check('rendu désactivé : plus de bouton actif', (disabled.components ?? []).every((row: any) => row.components.every((button: any) => button.data.disabled === true)));
    gameService.finish(solo, 'test');
  }
  {
    const created = [0, 1, 2].map(() => createTicTacToe({ guildId: 'g1', channelId: 'c1', host }));
    let blocked = false;
    try {
      createTicTacToe({ guildId: 'g1', channelId: 'c1', host });
    } catch {
      blocked = true;
    }
    check('limite de 3 parties simultanées par hôte', blocked);
    for (const session of created) gameService.finish(session, 'test');
  }
  {
    const { createQuizSession } = await import('../src/games/ui/quiz');
    const quizSession = createQuizSession({ guildId: 'g1', channelId: 'c1', host, count: 3, secondsPerQuestion: 10 });
    check('quiz : 3 questions préparées et minuterie armée', quizSession.state.questions.length === 3 && quizSession.timers.size === 1);
    const payload = gameService.definition('quiz')!.render(quizSession);
    check('quiz : 4 boutons de réponse', (payload.components?.[0] as any)?.components?.length === 4);
    gameService.finish(quizSession, 'test');
    check('quiz : minuteries annulées à la fin', quizSession.timers.size === 0);
  }
  {
    const first = { ...gameService.record({ guildId: 'g1', userId: '42', tag: 'Alice', game: 'motus', result: 'win', points: 12, best: 4, betterIf: 'lower' }) };
    const second = { ...gameService.record({ guildId: 'g1', userId: '42', tag: 'Alice', game: 'motus', result: 'win', points: 8, best: 6, betterIf: 'lower' }) };
    gameService.record({ guildId: 'g1', userId: '42', tag: 'Alice', game: 'motus', result: 'loss' });
    gameService.record({ guildId: 'g1', userId: '43', tag: 'Bob', game: 'quiz', result: 'draw', points: 30 });
    check('stats : victoires, série et points cumulés', first.wins === 1 && second.streak === 2 && second.points === 20, { first, second });
    check('stats : record « plus petit est meilleur » conservé', gameService.stats('g1', '42')?.games.motus?.best === 4);
    check('stats : défaite remet la série à zéro', gameService.stats('g1', '42')?.games.motus?.streak === 0);
    const board = gameService.leaderboard('g1', 10);
    check('classement général trié par points', board[0]?.stats.userId === '43' && board[1]?.stats.userId === '42');
    check('classement par jeu', gameService.leaderboard('g1', 10, 'motus')[0]?.stats.userId === '42');
    check('rang du joueur', gameService.rank('g1', '42') === 2 && gameService.rank('g1', 'inconnu') === null);
  }

  // ── Serveur web (routes) ──────────────────────────────────────────────────
  section('🌐 Serveur web');
  const { createWebServer } = await import('../src/web/server');
  const server = createWebServer({ client });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
  check('/health répond status=ok', (health as any).status === 'ok');
  const stats = await fetch(`http://127.0.0.1:${port}/api/stats`).then((response) => response.json());
  check('/api/stats expose les commandes chargées', (stats as any).commandCount === client.commands.size);
  check('/api/stats expose la base de données', Array.isArray((stats as any).database));
  const metrics = await fetch(`http://127.0.0.1:${port}/metrics`).then((response) => response.text());
  check('/metrics au format Prometheus', metrics.includes('elysia_up'));
  const dashboard = await fetch(`http://127.0.0.1:${port}/`);
  check('tableau de bord HTML servi', (await dashboard.text()).includes('Elysia'));
  const notFound = await fetch(`http://127.0.0.1:${port}/inconnu`);
  check('route inconnue → 404', notFound.status === 404);
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // ── Nettoyage & résumé ────────────────────────────────────────────────────
  await db.flushAll();
  rmSync(process.env.DATA_DIR!, { recursive: true, force: true });

  // eslint-disable-next-line no-console
  console.log(
    `\n${BOLD}Résultat : ${failed === 0 ? `${GREEN}${passed} test(s) réussi(s)` : `${GREEN}${passed} réussi(s) ${RED}• ${failed} échec(s)`}${RESET}\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`\n${RED}Auto-test interrompu :${RESET}`, error);
  process.exit(1);
});
