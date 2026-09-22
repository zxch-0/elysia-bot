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
// Le site intégré protège /donnees et les routes sensibles quand ce jeton est
// défini : on l'active ici pour vérifier réellement le contrôle d'accès.
process.env.DASHBOARD_TOKEN = 'jeton-de-test';

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
  check('au moins 50 commandes chargées', client.commands.size >= 50, client.commands.size);
  check('commande /giveaway présente', client.commands.has('giveaway'));
  check('commande /rolepanel présente', client.commands.has('rolepanel'));
  check('commande /embed présente', client.commands.has('embed'));
  check('commandes uniques (noms sans doublon)', new Set([...client.commands.keys()]).size === client.commands.size);
  check('13 modules d’interaction enregistrés', client.modules.size === 13, client.modules.size);
  check('modules communautaires (poll, sug, cd, duel, rem) enregistrés', ['poll', 'sug', 'cd', 'duel', 'rem'].every((prefix) => client.modules.has(prefix)));
  check(
    'nouvelles commandes présentes',
    ['profil', 'avatar', 'serveur', 'roles', 'emojis', 'membres', 'invitations', 'snipe', 'rappel', 'heure', 'meteo', 'calculer', 'convertir', 'motdepasse', 'code'].every(
      (name) => client.commands.has(name),
    ),
  );
  check(
    'commandes communauté & divertissement présentes',
    ['sondage', 'suggestion', 'anniversaire', 'compte-a-rebours', 'niveau', 'tirage', 'des', '8ball', 'citation', 'blague', 'duel', 'pile-ou-face', 'note', 'bannissements', 'vocal'].every(
      (name) => client.commands.has(name),
    ),
  );
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

  // ── Publication des commandes : anti-doublons ────────────────────────────
  const publisher = await import('../src/core/handlers/commandPublisher');
  check(
    'publication : auto → serveur si DEV_GUILD_ID et un seul serveur',
    publisher.resolveCommandsScope({ commandsScope: 'auto', devGuildId: '123', guildCount: 1 }) === 'guild',
  );
  check(
    'publication : auto → global si plusieurs serveurs (aucun serveur privé)',
    publisher.resolveCommandsScope({ commandsScope: 'auto', devGuildId: '123', guildCount: 3 }) === 'global',
  );
  check('publication : auto → global sans DEV_GUILD_ID', publisher.resolveCommandsScope({ commandsScope: 'auto' }) === 'global');
  check(
    'publication : demande explicite respectée',
    publisher.resolveCommandsScope({ commandsScope: 'guild', devGuildId: '123', guildCount: 9 }) === 'guild' &&
      publisher.resolveCommandsScope({ commandsScope: 'global', devGuildId: '123', guildCount: 1 }) === 'global',
  );
  check(
    'publication : « both » ne conserve qu’une portée (anti-doublons)',
    publisher.resolveCommandsScope({ commandsScope: 'both', devGuildId: '123', guildCount: 1 }) === 'global',
  );

  const fakeCommands = [
    { data: { name: 'alpha', toJSON: () => ({ name: 'alpha' }) } },
    { data: { name: 'beta', toJSON: () => ({ name: 'beta' }) } },
    { data: { name: 'alpha', toJSON: () => ({ name: 'alpha' }) } },
  ];
  const deduped = publisher.dedupeCommandBody(fakeCommands);
  check('publication : catalogue dédoublonné par nom', deduped.body.length === 2 && deduped.duplicates.join(',') === 'alpha');

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

  const words = await import('../src/games/content/words');
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

  const questions = await import('../src/games/content/questions');
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
    // Revanche : l'ancienne partie est marquée « remplacée », la nouvelle reprend le message.
    const previous = createTicTacToe({ guildId: 'g1', channelId: 'c1', host, level: 'facile' });
    previous.messageId = 'm-1';
    gameService.finish(previous, 'test');
    const fresh = createTicTacToe({ guildId: 'g1', channelId: 'c1', host, level: 'facile' });
    gameService.supersede(previous, fresh, 'm-1');
    check('revanche : ancienne partie remplacée, nouvelle attachée au message', previous.supersededBy === fresh.id && fresh.messageId === 'm-1' && previous.expiresAt <= Date.now() + 60_000);
    // Le balayage retire les parties terminées expirées et fige leur message (plus de bouton actif).
    const edits: any[] = [];
    gameService.attach({
      rest: { patch: async (route: string, options: any) => { edits.push({ route, body: options.body }); } },
    } as any);
    fresh.messageId = 'm-2';
    gameService.finish(fresh, 'test');
    fresh.expiresAt = 0;
    previous.expiresAt = 0;
    await (gameService as any).sweep();
    check('balayage : la partie remplacée ne réécrit pas le message de la revanche', !edits.some((edit) => edit.route.endsWith('/messages/m-1')));
    const frozen = edits.find((edit) => edit.route.endsWith('/messages/m-2'));
    check('balayage : message figé par PATCH REST sans bouton actif', !!frozen && (frozen.body.components ?? []).every((row: any) => row.components.every((button: any) => button.disabled === true)));
    check('balayage : parties expirées purgées', gameService.get(fresh.id) === undefined && gameService.get(previous.id) === undefined);
  }
  {
    const { createQuizSession } = await import('../src/games/ui/quiz');
    const { undo, createGame, move } = await import('../src/games/engine/game2048');
    const { normalizeGuess } = await import('../src/games/engine/motus');
    const { BotError } = await import('../src/core/errors');
    let rejected = false;
    try {
      // Aucune question ne peut correspondre : le service doit refuser proprement (BotError).
      createQuizSession({ guildId: 'g1', channelId: 'c1', host, theme: 'nope' as any, difficulty: 'difficile', count: 3 });
    } catch (error) {
      rejected = error instanceof BotError;
    }
    check('quiz : réglages sans question → BotError', rejected);
    const grid = createGame();
    let played = 0;
    for (const direction of ['left', 'right', 'up', 'down'] as const) if (move(grid, direction)) { played += 1; break; }
    check('2048 : annuler un coup décrémente le compteur', played === 1 && undo(grid) && grid.moves === 0 && grid.undosLeft === 2);
    check('motus : « cœur » (4 caractères) accepté comme COEUR', normalizeGuess('cœur') === 'COEUR' && normalizeGuess('Élève') === 'ELEVE');
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

  // ── Utilitaires : calcul, conversions, dés, encodage ──────────────────────
  section('🧮 Calcul, conversions, dés et encodage');
  const { evaluateExpression, normalizeExpression, formatNumber } = await import('../src/utils/mathEval');
  check('calcul : priorité des opérateurs', evaluateExpression('2 + 3 * 4') === 14);
  check('calcul : parenthèses', evaluateExpression('100 / (2 + 3)') === 20);
  check('calcul : puissance associative à droite', evaluateExpression('2^3^2') === 512);
  check('calcul : factorielle', evaluateExpression('5!') === 120);
  check('calcul : fonctions scientifiques', evaluateExpression('sqrt(144) + log(1000)') === 15);
  check('calcul : pourcentage à la française', evaluateExpression('15% de 240') === 36);
  check('calcul : constante pi', Math.abs(evaluateExpression('sin(pi/2)') - 1) < 1e-9);
  check('calcul : comparateur', evaluateExpression('3 > 2') === 1 && evaluateExpression('2 >= 3') === 0);
  check('calcul : multiplication implicite', evaluateExpression('2(3+4)') === 14 && evaluateExpression('max(1,2)') === 2);
  check('calcul : pourcentage isolé', evaluateExpression('50%') === 0.5);
  check('calcul : modulo conservé', evaluateExpression('10 % 3') === 1);
  check('calcul : virgule décimale acceptée', normalizeExpression('1,5 + 1') === '1.5 + 1' && evaluateExpression('1,5 + 1') === 2.5);
  {
    let zeroDivision = false;
    try {
      evaluateExpression('1/0');
    } catch {
      zeroDivision = true;
    }
    check('calcul : division par zéro refusée', zeroDivision);
  }
  {
    let unknownFunction = false;
    try {
      evaluateExpression('bidule(3)');
    } catch {
      unknownFunction = true;
    }
    check('calcul : fonction inconnue refusée', unknownFunction);
  }
  check('formatNumber : arrondi propre', formatNumber(1 / 3).startsWith('0,333'), formatNumber(1 / 3));

  const { convertUnits, findUnit, UNITS } = await import('../src/utils/units');
  check('conversion : 42 km = 26,1 miles', Math.abs(convertUnits(42, 'km', 'mi').result - 26.0976) < 0.01);
  check('conversion : 0 °C = 32 °F', Math.abs(convertUnits(0, 'c', 'f').result - 32) < 1e-9);
  check('conversion : 100 °C = 212 °F', Math.abs(convertUnits(100, 'c', 'f').result - 212) < 1e-9);
  check('conversion : 68 °F = 20 °C', Math.abs(convertUnits(68, 'f', 'c').result - 20) < 1e-9);
  check('conversion : 0 K = -273,15 °C', Math.abs(convertUnits(0, 'k', 'c').result + 273.15) < 1e-9);
  check('conversion : 1 Go = 1024 Mo', Math.abs(convertUnits(1, 'go', 'mo').result - 1024) < 1e-9);
  check('conversion : 1 livre = 453,592 g', Math.abs(convertUnits(1, 'lb', 'g').result - 453.59237) < 1e-6);
  check('conversion : 1 h = 3600 s', convertUnits(1, 'h', 's').result === 3600);
  {
    let mismatch = false;
    try {
      convertUnits(1, 'km', 'kg');
    } catch {
      mismatch = true;
    }
    check('conversion : catégories incompatibles refusées', mismatch);
  }
  check('unités : 45 unités référencées', UNITS.length >= 45, UNITS.length);
  check('unités : symbole reconnu', findUnit('°C')?.id === 'c' || findUnit('c')?.id === 'c');

  const { parseDiceNotation, rollDice, rollGrade, flipCoins, flipCoin } = await import('../src/utils/dice');
  check('dés : « 2d6+3 » → 2 dés, modificateur 3', parseDiceNotation('2d6+3').groups[0].count === 2 && parseDiceNotation('2d6+3').modifier === 3);
  check('dés : « d20 » → 1 dé à 20 faces', parseDiceNotation('d20').groups[0].count === 1 && parseDiceNotation('d20').groups[0].faces === 20);
  check('dés : multi-groupes « 1d4+2d6-1 »', parseDiceNotation('1d4+2d6-1').groups.length === 2 && parseDiceNotation('1d4+2d6-1').modifier === -1);
  {
    let inRange = true;
    let sawVariety = new Set<number>();
    for (let round = 0; round < 200; round += 1) {
      const roll = rollDice('3d6+2');
      if (roll.total < 5 || roll.total > 20) inRange = false;
      if (roll.rolls[0].length !== 3) inRange = false;
      sawVariety.add(roll.total);
    }
    check('dés : bornes respectées (3d6+2 ∈ [5, 20])', inRange);
    check('dés : résultats variés sur 200 lancers', sawVariety.size > 5, sawVariety.size);
  }
  {
    let rejected = false;
    try {
      parseDiceNotation('nimporte quoi');
    } catch {
      rejected = true;
    }
    check('dés : notation invalide refusée', rejected);
  }
  check('dés : appréciation cohérente', rollGrade({ notation: '1d6', groups: [], modifier: 0, rolls: [[6]], total: 6, min: 1, max: 6 }).emoji === '🌟');
  {
    const flips = flipCoins(20);
    check('pièce : 20 lancers binaires', flips.length === 20 && flips.every((side) => side === 'pile' || side === 'face'));
    check('pièce : lancer unique valide', ['pile', 'face'].includes(flipCoin()));
  }

  const codec = await import('../src/utils/codec');
  check('encodage : Base64 aller-retour', codec.decodeBase64(codec.encodeBase64('Bonjour Élysia !')) === 'Bonjour Élysia !');
  check('encodage : hexadécimal aller-retour', codec.decodeHex(codec.encodeHex('café')) === 'café');
  check('encodage : binaire aller-retour', codec.decodeBinary(codec.encodeBinary('Hi')) === 'Hi');
  check('encodage : URL aller-retour', codec.decodeUrl(codec.encodeUrl('a b&c=d')) === 'a b&c=d');
  check('encodage : morse', codec.encodeMorse('SOS') === '... --- ...' && codec.decodeMorse('... --- ...') === 'sos');
  check('encodage : César symétrique (rot13)', codec.caesar('Bonjour') === 'Obawbhe' && codec.caesar(codec.caesar('Bonjour')) === 'Bonjour');
  check('encodage : texte inversé', codec.reverseText('abc') === 'cba');
  check('encodage : SHA-256 de « abc »', codec.hashText('sha256', 'abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  check('encodage : MD5 de « abc »', codec.hashText('md5', 'abc') === '900150983cd24fb0d6963f7d28e17f72');
  check('encodage : entropie 20 caractères sur 84 symboles', codec.entropyBits(84, 20) > 120, codec.entropyBits(84, 20));
  check('encodage : jeton hexadécimal de 8 octets', /^[0-9a-f]{16}$/.test(codec.randomToken(8)));
  {
    let invalidBase64 = false;
    try {
      codec.decodeBase64('???');
    } catch {
      invalidBase64 = true;
    }
    check('encodage : Base64 invalide refusé', invalidBase64);
  }

  // ── Utilitaires : fuseaux horaires, dates, anniversaires ──────────────────
  section('🕒 Fuseaux horaires et dates');
  const timeUtils = await import('../src/utils/time');
  const sampleDate = new Date(Date.UTC(2026, 8, 22, 12, 0, 0));
  const paris = timeUtils.formatInZone(sampleDate, 'Europe/Paris');
  const tokyoMoment = timeUtils.formatInZone(sampleDate, 'Asia/Tokyo');
  check('fuseaux : Paris en été = UTC+2', paris.time === '14:00', paris);
  check('fuseaux : Tokyo = UTC+9', tokyoMoment.time === '21:00', tokyoMoment);
  check('fuseaux : décalage lisible', timeUtils.zoneOffsetLabel(sampleDate, 'Europe/Paris').startsWith('UTC+2'), timeUtils.zoneOffsetLabel(sampleDate, 'Europe/Paris'));
  check('fuseaux : 25 villes proposées', timeUtils.WORLD_ZONES.length === 25, timeUtils.WORLD_ZONES.length);
  check('fuseaux : recherche par nom', timeUtils.findZone('Tokyo')?.id === 'tokyo');
  check('fuseaux : date locale correcte', timeUtils.zonedDate(sampleDate, 'Asia/Tokyo').day === 22);
  check('dates : ISO acceptée', timeUtils.parseTargetDate('2027-01-01', 0) === Date.UTC(2027, 0, 1));
  check('dates : format français accepté', timeUtils.parseTargetDate('25/12/2026 20:30', 0) === Date.UTC(2026, 11, 25, 20, 30));
  check('dates : durée relative acceptée', timeUtils.parseTargetDate('2h', 1_000) === 1_000 + 7_200_000);
  check('dates : entrée invalide rejetée', timeUtils.parseTargetDate('demain peut-être', 0) === null);
  check('dates : 31/02 refusé', timeUtils.parseTargetDate('2026-02-31', 0) === null);
  check('anniversaires : 29 février autorisé', timeUtils.isValidDayMonth(29, 2) && !timeUtils.isValidDayMonth(30, 2));
  check('anniversaires : jours restants ≥ 0', timeUtils.daysUntilBirthday(15, 6, sampleDate, 'Europe/Paris') >= 0);
  check('anniversaires : aujourd’hui détecté', timeUtils.isToday(22, 9, sampleDate, 'Europe/Paris'));

  // ── Services communautaires ───────────────────────────────────────────────
  section('🎉 Services communautaires');
  const { levelService, levelProgress, levelFromXp, totalXpForLevel } = await import('../src/services/levelService');
  check('niveaux : courbe 100 × n²', totalXpForLevel(0) === 0 && totalXpForLevel(3) === 900 && totalXpForLevel(10) === 10_000);
  check('niveaux : niveau depuis l’XP', levelFromXp(0) === 0 && levelFromXp(99) === 0 && levelFromXp(100) === 1 && levelFromXp(899) === 2 && levelFromXp(900) === 3);
  {
    const progress = levelProgress(250);
    check('niveaux : progression détaillée', progress.level === 1 && progress.into === 150 && progress.needed === 300, progress);
    check('niveaux : ratio borné', progress.ratio > 0 && progress.ratio < 1);
  }
  {
    const entry = levelService.addXp('guild-levels', 'u-1', 'Alice#0001', 1_050);
    check('niveaux : XP ajouté et niveau recalculé', entry.xp === 1_050 && entry.level === 3);
    check('niveaux : rang du premier joueur', levelService.rank('guild-levels', 'u-1') === 1);
    levelService.addXp('guild-levels', 'u-2', 'Bob#0002', 400);
    check('niveaux : classement trié par XP', levelService.leaderboard('guild-levels')[0].userId === 'u-1');
    check('niveaux : rang du second joueur', levelService.rank('guild-levels', 'u-2') === 2);
    check('niveaux : retrait d’XP jamais négatif', levelService.addXp('guild-levels', 'u-2', 'Bob#0002', -10_000).xp === 0);
    check('niveaux : réinitialisation', levelService.reset('guild-levels', 'u-2') && levelService.entry('guild-levels', 'u-2') === undefined);
  }

  const { pollService } = await import('../src/services/pollService');
  {
    const poll = pollService.create({
      guildId: 'guild-poll',
      channelId: 'chan-1',
      authorId: 'u-1',
      authorTag: 'Alice#0001',
      question: 'Pizza ou burger ?',
      options: ['Pizza', 'Burger'],
      durationMs: 60_000,
    });
    check('sondages : créé avec deux propositions', poll.options.length === 2);
    check('sondages : premier vote enregistré', pollService.castVote(poll.id, 'u-1', ['0']) === 'voted');
    check('sondages : vote identique détecté', pollService.castVote(poll.id, 'u-1', ['0']) === 'same');
    check('sondages : vote modifié', pollService.castVote(poll.id, 'u-1', ['1']) === 'updated');
    pollService.castVote(poll.id, 'u-2', ['1']);
    const results = pollService.results(pollService.get(poll.id)!);
    check('sondages : décompte et pourcentages', results.totalVoters === 2 && results.lines[1].count === 2 && results.lines[1].percent === 100);
    check('sondages : gagnant identifié', pollService.leaders(pollService.get(poll.id)!)[0].option.label === 'Burger');
    check('sondages : retrait du vote', pollService.castVote(poll.id, 'u-2', []) === 'removed');
    check('sondages : choix invalide ignoré', pollService.castVote(poll.id, 'u-3', ['99']) === 'invalid');
    pollService.end(poll.id);
    check('sondages : clôture bloquant les votes', pollService.castVote(poll.id, 'u-4', ['0']) === 'invalid' && pollService.get(poll.id)?.ended === true);
    check('sondages : sondage échu listé', pollService.due().length === 0);
    {
      let tooFew = false;
      try {
        pollService.create({ guildId: 'g', channelId: 'c', authorId: 'a', authorTag: 'a', question: 'q', options: ['seul'] });
      } catch {
        tooFew = true;
      }
      check('sondages : une seule proposition refusée', tooFew);
    }
  }

  const { birthdayService } = await import('../src/services/birthdayService');
  {
    birthdayService.set({ guildId: 'guild-bday', userId: 'u-1', userTag: 'Alice#0001', day: 22, month: 9 });
    birthdayService.set({ guildId: 'guild-bday', userId: 'u-2', userTag: 'Bob#0002', day: 1, month: 1, year: 1990 });
    check('anniversaires : enregistré et relu', birthdayService.get('guild-bday', 'u-1')?.month === 9);
    check('anniversaires : tri par échéance', birthdayService.upcoming('guild-bday', 5, sampleDate, 'Europe/Paris').length === 2);
    const pending = birthdayService.pendingAnnouncements('guild-bday', sampleDate, 'Europe/Paris');
    check('anniversaires : annonce du jour détectée', pending.length === 1 && pending[0].userId === 'u-1', pending);
    birthdayService.markAnnounced('guild-bday', 'u-1', sampleDate, 'Europe/Paris');
    check('anniversaires : pas de double annonce', birthdayService.pendingAnnouncements('guild-bday', sampleDate, 'Europe/Paris').length === 0);
    {
      let invalid = false;
      try {
        birthdayService.set({ guildId: 'guild-bday', userId: 'u-3', userTag: 'X', day: 31, month: 2 });
      } catch {
        invalid = true;
      }
      check('anniversaires : date impossible refusée', invalid);
    }
    check('anniversaires : suppression', birthdayService.remove('guild-bday', 'u-2') && birthdayService.listGuild('guild-bday').length === 1);
  }

  const { reminderService } = await import('../src/services/reminderService');
  {
    const reminder = reminderService.create({
      guildId: 'guild-rem',
      channelId: 'chan-1',
      userId: 'u-1',
      userTag: 'Alice#0001',
      text: 'Sortir le chien',
      dueAt: Date.now() - 1_000,
    });
    check('rappels : identifiant court lisible', /^guild-rem:\d+$/.test(reminder.id), reminder.id);
    check('rappels : échu détecté', reminderService.due().some((entry) => entry.id === reminder.id));
    check('rappels : comptage par membre', reminderService.countPending('guild-rem', 'u-1') === 1);
    reminderService.markFired(reminder.id);
    check('rappels : marqué comme déclenché', reminderService.get(reminder.id)?.fired === true && reminderService.due().length === 0);
    const snoozed = reminderService.snooze(reminder.id, 60_000);
    check('rappels : report réactivé', snoozed?.fired === false && (snoozed?.dueAt ?? 0) > Date.now());
    check('rappels : suppression par un tiers refusée', reminderService.delete(reminder.id, 'u-9') === false);
    check('rappels : suppression par l’auteur', reminderService.delete(reminder.id, 'u-1') === true);
    reminderService.markFired(reminder.id);
    check('rappels : purge des anciens', reminderService.purgeOld(Date.now() + 8 * 86_400_000) === 0);
  }

  const { countdownService } = await import('../src/services/countdownService');
  {
    const countdown = countdownService.create({
      guildId: 'guild-cd',
      channelId: 'chan-1',
      title: 'Sortie du jeu',
      targetAt: Date.now() + 3_600_000,
      createdBy: 'u-1',
      createdByTag: 'Alice#0001',
    });
    check('comptes à rebours : créé et actif', countdownService.listActive('guild-cd').length === 1);
    check('comptes à rebours : échéance non dépassée', countdownService.due().length === 0);
    countdownService.update(countdown.id, { targetAt: Date.now() - 1 });
    check('comptes à rebours : échu détecté', countdownService.due().length === 1);
    countdownService.markEnded(countdown.id);
    check('comptes à rebours : terminé retiré des actifs', countdownService.listActive('guild-cd').length === 0);
  }

  const { noteService } = await import('../src/services/noteService');
  {
    const note = noteService.add({ guildId: 'guild-note', userId: 'u-1', targetTag: 'Alice#0001', authorId: 'mod', authorTag: 'Modo#0001', text: 'Toujours en retard' });
    noteService.add({ guildId: 'guild-note', userId: 'u-1', targetTag: 'Alice#0001', authorId: 'mod', authorTag: 'Modo#0001', text: 'Deuxième observation' });
    check('notes : identifiant composite', note.id === 'guild-note:u-1:1');
    check('notes : comptage', noteService.count('guild-note', 'u-1') === 2);
    check('notes : numérotation chronologique', noteService.get('guild-note', 'u-1', 1)?.text === 'Toujours en retard');
    check('notes : résumé du serveur', noteService.topGuild('guild-note')[0].count === 2);
    check('notes : suppression', noteService.remove('guild-note', 'u-1', 2) && noteService.count('guild-note', 'u-1') === 1);
  }

  const { suggestionService, SUGGESTION_STATUS } = await import('../src/services/suggestionService');
  {
    const suggestion = suggestionService.create({
      guildId: 'guild-sug',
      channelId: 'chan-1',
      authorId: 'u-1',
      authorTag: 'Alice#0001',
      text: 'Ajouter un salon cinéma',
    });
    check('suggestions : statut initial', suggestion.status === 'ouverte' && SUGGESTION_STATUS.ouverte.emoji === '🟡');
    check('suggestions : vote pour', suggestionService.vote(suggestion.id, 'u-1', 'up') === 'up');
    check('suggestions : vote contre (changement)', suggestionService.vote(suggestion.id, 'u-1', 'down') === 'changed');
    check('suggestions : retrait du vote', suggestionService.vote(suggestion.id, 'u-1', 'down') === 'removed');
    suggestionService.vote(suggestion.id, 'u-2', 'up');
    suggestionService.vote(suggestion.id, 'u-3', 'up');
    check('suggestions : score calculé', suggestionService.score(suggestionService.get(suggestion.id)!) === 2);
    suggestionService.setStatus(suggestion.id, 'acceptee', 'admin');
    check('suggestions : décision enregistrée', suggestionService.get(suggestion.id)?.status === 'acceptee');
    check('suggestions : meilleures suggestions', suggestionService.top('guild-sug')[0].id === suggestion.id);
  }

  const duelModuleFun = await import('../src/fun/duel');
  {
    const duel = duelModuleFun.createDuel({
      guildId: 'guild-duel',
      channelId: 'chan-1',
      hostId: 'u-1',
      hostTag: 'Alice#0001',
      targetId: 'u-2',
      targetTag: 'Bob#0002',
      rounds: 3,
      bet: 'Crier ALLEZ en vocal',
    });
    check('duels : créé en attente', duel.status === 'pending' && duel.rounds === 3);
    check('duels : retrouvé par identifiant', duelModuleFun.getDuel(duel.id)?.targetId === 'u-2');
    check('duels : refus par un tiers impossible', duelModuleFun.declineDuel(duel.id, 'u-9') === undefined);
    duelModuleFun.playDuel(duel);
    check('duels : manches jouées', duel.history.length >= 3);
    check('duels : un gagnant désigné', duel.winnerId !== null && duel.loserId !== null && duel.winnerId !== duel.loserId);
    check('duels : score total cohérent', duelModuleFun.totalScore(duel, 'host') >= 3 * 2);
    check('duels : annulation par l’hôte', duelModuleFun.cancelDuel(duel.id, 'u-1')?.status === 'declined');
    duelModuleFun.deleteDuel(duel.id);
    check('duels : suppression', duelModuleFun.getDuel(duel.id) === undefined);
  }

  const { parsePollChoices } = await import('../src/commands/community/sondage');
  check('sondages : propositions séparées par « | »', parsePollChoices('A | B | C').join(',') === 'A,B,C');
  check('sondages : séparateurs tolérants', parsePollChoices('A;B\nC').join(',') === 'A,B,C');
  check('sondages : propositions vides retirées', parsePollChoices('A || B').join(',') === 'A,B');
  check('sondages : limite de 10 propositions', parsePollChoices(Array.from({ length: 15 }, (_, index) => `option ${index}`).join('|')).length === 10);

  // ── Aide paginée : aucun champ tronqué ────────────────────────────────────
  section('📚 Aide et catalogue');
  const { buildHelpSections, helpPages } = await import('../src/commands/utility/help');
  {
    const sections = buildHelpSections(client);
    check('aide : toutes les catégories présentes', new Set(sections.map((section) => section.category)).size >= 8, new Set(sections.map((section) => section.category)).size);
    check('aide : aucun champ ne dépasse 1024 caractères', sections.every((section) => section.value.length <= 1024));
    check('aide : toutes les commandes listées', sections.reduce((sum, section) => sum + (section.value.match(/\*\*\//g)?.length ?? 0), 0) >= client.commands.size);
    check('aide : pagination cohérente', helpPages(client).length >= 3, helpPages(client).length);
  }
  const { renderConfig: renderSettings } = await import('../src/commands/config/config');
  {
    const rendered = renderSettings(guildService.get(guildId));
    check('config : section niveaux affichée', /Niveaux & XP/.test(rendered) && /Rôles de récompense/.test(rendered));
    check('config : section communauté affichée', /Anniversaires annoncés/.test(rendered) && /Suggestions anonymes/.test(rendered));
    check('config : nouveaux salons affichés', /Anniversaires :/.test(rendered) && /Suggestions :/.test(rendered));
  }

  // ── Serveur web (pages + API) ─────────────────────────────────────────────
  section('🌐 Serveur web');
  const { createWebServer } = await import('../src/web/server');
  const server = createWebServer({ client });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const authHeaders = { headers: { 'x-dashboard-token': process.env.DASHBOARD_TOKEN! } };
  const asJson = async (route: string, init?: RequestInit): Promise<any> => (await fetch(base + route, init)).json();

  const health = await asJson('/health');
  check('/health répond status=ok', health.status === 'ok');
  const stats = await asJson('/api/stats');
  check('/api/stats expose les commandes chargées', stats.commandCount === client.commands.size);
  check('/api/stats expose la base de données', Array.isArray(stats.database));
  check(
    '/api/stats expose les compteurs communautaires',
    typeof stats.xp === 'number' && typeof stats.suggestionsOpen === 'number' && typeof stats.pollsActive === 'number',
  );
  const metrics = await (await fetch(`${base}/metrics`)).text();
  check('/metrics au format Prometheus', metrics.includes('elysia_up') && metrics.includes('elysia_polls_active'));

  const { Script } = await import('node:vm');
  for (const [route, marker] of [
    ['/', 'Tableau de bord'],
    ['/commandes', 'Commandes'],
    ['/jeux', 'Classement'],
    ['/communaute', 'Communauté'],
    ['/donnees', 'Journaux'],
  ] as Array<[string, string]>) {
    const response = await fetch(base + route);
    const html = await response.text();
    check(`page ${route} servie`, response.status === 200 && html.includes('<html lang="fr">') && html.includes(marker), response.status);

    // Le JavaScript embarqué est compilé sans être exécuté : une apostrophe mal
    // échappée dans un rendu casserait sinon la page entière côté navigateur.
    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1] ?? '';
    let syntaxError: string | null = null;
    try {
      new Script(script, { filename: route });
    } catch (error) {
      syntaxError = (error as Error).message;
    }
    check(`page ${route} : JavaScript valide`, script.length > 0 && syntaxError === null, syntaxError ?? undefined);
  }

  const index = await asJson('/api');
  check('/api indexe toutes les routes', Array.isArray(index.endpoints) && index.endpoints.length >= 10, index.endpoints?.length);

  const catalogue = await asJson('/api/commands');
  check('/api/commands liste toutes les commandes', catalogue.count === client.commands.size && catalogue.commands.length === client.commands.size, catalogue.count);
  check(
    '/api/commands catégories renseignées',
    catalogue.categories.length >= 8 && catalogue.categories.every((entry: any) => entry.count > 0 && entry.label && entry.emoji),
  );
  check(
    '/api/commands détail complet (usage, options, permissions)',
    catalogue.commands.every(
      (entry: any) => entry.name && entry.summary && Array.isArray(entry.usage) && Array.isArray(entry.options) && Array.isArray(entry.permissions),
    ),
  );

  const games = await asJson('/api/games');
  check(
    '/api/games expose les 10 mini-jeux',
    games.games.length === 10 && games.games.every((entry: any) => entry.id && entry.label && entry.emoji && entry.description),
    games.games.length,
  );
  check(
    '/api/games comptabilise les parties',
    typeof games.players === 'number' && typeof games.played === 'number' && typeof games.activeSessions === 'number',
  );

  const board = await asJson('/api/leaderboard?guild=g1&limit=5');
  check(
    '/api/leaderboard renvoie le classement du serveur',
    board.guild === 'g1' && Array.isArray(board.entries) && board.entries.every((entry: any) => entry.tag && typeof entry.points === 'number' && entry.total && entry.games),
  );

  const community = await asJson('/api/community?guild=g1&limit=5');
  check(
    '/api/community expose niveaux, suggestions, sondages et anniversaires',
    Array.isArray(community.levels.top) &&
      typeof community.levels.totalXp === 'number' &&
      typeof community.suggestions.counts.all === 'number' &&
      Array.isArray(community.polls.list) &&
      typeof community.birthdays.total === 'number' &&
      Array.isArray(community.countdowns),
  );

  check('/api/logs refusé sans jeton', (await fetch(`${base}/api/logs`)).status === 401);
  check('/api/cases refusé sans jeton', (await fetch(`${base}/api/cases`)).status === 401);
  check('/api/notes refusé sans jeton', (await fetch(`${base}/api/notes`)).status === 401);
  check('/api/logs accepté avec ?token=', (await fetch(`${base}/api/logs?limit=5&token=${process.env.DASHBOARD_TOKEN}`)).status === 200);

  const logs = await asJson('/api/logs?limit=5', authHeaders);
  check(
    '/api/logs renvoie des lignes exploitables',
    Array.isArray(logs.logs) && logs.logs.every((entry: any) => typeof entry.time === 'string' && entry.scope && entry.level),
    logs.logs?.length,
  );
  const cases = await asJson('/api/cases?guild=g1', authHeaders);
  check('/api/cases accessible avec le jeton', Array.isArray(cases.cases), cases.cases?.length);
  const notes = await asJson('/api/notes?guild=g1', authHeaders);
  check('/api/notes accessible avec le jeton', Array.isArray(notes.notes));
  const giveaways = await asJson('/api/giveaways?guild=g1');
  check('/api/giveaways expose les concours', Array.isArray(giveaways.active) && Array.isArray(giveaways.ended));
  const panels = await asJson('/api/panels?guild=g1');
  check('/api/panels expose les panneaux', Array.isArray(panels.panels));

  // Tampon circulaire alimentant la page « Données ».
  const { logger: ringLogger, recentLogs, clearRecentLogs } = await import('../src/core/logger');
  clearRecentLogs();
  ringLogger.child('self-test').error('ligne de test du tampon');
  const ring = recentLogs(10);
  check(
    'tampon de journal circulaire',
    ring.some((entry) => entry.message === 'ligne de test du tampon') &&
      ring.every((entry) => typeof entry.clock === 'string' && entry.time > 0 && entry.scope.length > 0),
  );

  const notFound = await fetch(`${base}/inconnu`);
  check('route inconnue → 404', notFound.status === 404);
  const notFoundApi = await fetch(`${base}/api/inconnu`);
  check(
    'route API inconnue → 404 JSON',
    notFoundApi.status === 404 && (notFoundApi.headers.get('content-type') ?? '').includes('json'),
  );
  check('favicon sans erreur', (await fetch(`${base}/favicon.ico`)).status === 204);
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
