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
  check('6 modules d’interaction enregistrés', client.modules.size === 6);
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
