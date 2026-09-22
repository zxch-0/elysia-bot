/**
 * Pages HTML du site intégré : tableau de bord, catalogue de commandes,
 * classements des mini-jeux, vie communautaire et données internes.
 *
 * Chaque page est autonome : elle interroge l'API JSON du bot en *relatif*
 * (`/api/...`) et fonctionne donc aussi bien en local, sur Render ou derrière
 * un proxy (aperçu Arena, iframe Discord…).
 */
import { renderShell, STATUS_SCRIPT } from './ui';

/** Tableau de bord : santé du bot, communauté, planificateur, base de données. */
export function renderDashboard(): string {
  const body = `
  <div class="grid">
    <div class="card"><div class="label">Latence</div><div class="value" id="latency">—<small> ms</small></div></div>
    <div class="card"><div class="label">Uptime</div><div class="value" id="uptime">—</div></div>
    <div class="card"><div class="label">Serveurs</div><div class="value" id="guilds">—</div></div>
    <div class="card"><div class="label">Membres</div><div class="value" id="members">—</div></div>
    <div class="card"><div class="label">Commandes</div><div class="value" id="commands">—</div></div>
    <div class="card"><div class="label">Mémoire</div><div class="value" id="memory">—<small> Mo</small></div></div>
  </div>

  <div class="grid">
    <div class="card"><div class="label">🎁 Giveaways actifs</div><div class="value" id="giveaways">—</div></div>
    <div class="card"><div class="label">🎭 Panneaux de rôles</div><div class="value" id="panels">—</div></div>
    <div class="card"><div class="label">⭐ XP distribuée</div><div class="value" id="xp">—</div></div>
    <div class="card"><div class="label">💡 Suggestions ouvertes</div><div class="value" id="suggestions">—</div></div>
    <div class="card"><div class="label">🗳️ Sondages en cours</div><div class="value" id="polls">—</div></div>
    <div class="card"><div class="label">🚨 Cases de modération</div><div class="value" id="cases">—</div></div>
  </div>

  <section>
    <div class="section-head"><h2>Serveurs</h2><span class="meta">Données en direct de <code>GET /api/stats</code></span></div>
    <div id="guild-list"><div class="empty">Chargement…</div></div>
  </section>

  <section>
    <div class="section-head"><h2>Planificateur interne</h2><span class="meta">Tâches récurrentes du bot</span></div>
    <div class="card" style="padding:8px 6px"><div id="scheduler"><div class="empty">Chargement…</div></div></div>
  </section>

  <section>
    <div class="section-head"><h2>Base de données JSON</h2><span class="meta">Collections et volumétrie</span></div>
    <div class="card" style="padding:8px 6px"><div id="database"><div class="empty">Chargement…</div></div></div>
  </section>

  <section>
    <div class="section-head"><h2>API publique</h2><span class="meta">Toutes les routes renvoient du JSON</span></div>
    <div class="row"><div class="grow"><div class="name"><code>GET /health</code></div><div class="meta">Endpoint de surveillance — à utiliser avec UptimeRobot</div></div><span class="tag">public</span></div>
    <div class="row"><div class="grow"><div class="name"><code>GET /api/stats</code></div><div class="meta">Statistiques complètes (Discord, services, base, planificateur)</div></div><span class="tag">public</span></div>
    <div class="row"><div class="grow"><div class="name"><code>GET /api/commands</code></div><div class="meta">Catalogue des 52 slash-commands (catégories, options, usage)</div></div><span class="tag">public</span></div>
    <div class="row"><div class="grow"><div class="name"><code>GET /api/leaderboard</code></div><div class="meta">Classement des mini-jeux — <code>?guild=…&amp;game=…&amp;limit=…</code></div></div><span class="tag">public</span></div>
    <div class="row"><div class="grow"><div class="name"><code>GET /api/community</code></div><div class="meta">Niveaux, suggestions, sondages, anniversaires, comptes à rebours</div></div><span class="tag">public</span></div>
    <div class="row"><div class="grow"><div class="name"><code>GET /api/giveaways</code></div><div class="meta">Concours en cours et terminés avec le nombre de participants</div></div><span class="tag">public</span></div>
    <div class="row"><div class="grow"><div class="name"><code>GET /api/logs</code></div><div class="meta">400 dernières lignes de journal — protégé par <code>DASHBOARD_TOKEN</code></div></div><span class="tag warn">protégé</span></div>
    <div class="row"><div class="grow"><div class="name"><code>GET /metrics</code></div><div class="meta">Métriques au format Prometheus</div></div><span class="tag">public</span></div>
    <div class="row"><div class="grow"><div class="name"><code>GET /api</code></div><div class="meta">Index de toutes les routes disponibles</div></div><span class="tag">public</span></div>
  </section>
  `;

  const script = `
  ${STATUS_SCRIPT}

  async function refresh() {
    try {
      const data = await fetchJson('/api/stats');
      setText('latency', (data.latencyMs ?? 0) + '<small> ms</small>');
      setText('uptime', fmt(data.uptimeMs || 0));
      setText('guilds', data.guildCount ?? 0);
      setText('members', num(data.userCount || 0));
      setText('commands', data.commandCount ?? 0);
      setText('memory', Math.round(data.memoryMb ?? 0) + '<small> Mo</small>');
      setText('giveaways', data.giveaways ?? 0);
      setText('panels', data.panels ?? 0);
      setText('xp', num(data.xp ?? 0));
      setText('suggestions', data.suggestionsOpen ?? 0);
      setText('polls', data.pollsActive ?? 0);
      setText('cases', num(data.cases ?? 0));

      const list = document.getElementById('guild-list');
      if (!data.guilds || data.guilds.length === 0) {
        list.innerHTML = '<div class="empty">Le bot n\\'est encore sur aucun serveur. Invitez-le avec le lien généré par <code>/invite</code>.</div>';
      } else {
        list.innerHTML = data.guilds.map((g) => {
          const initial = (g.name || '?').charAt(0).toUpperCase();
          const icon = g.icon ? '<img src="' + esc(g.icon) + '" alt="" />' : '<div class="avatar-fallback">' + esc(initial) + '</div>';
          return '<div class="row">' + icon +
            '<div class="grow"><div class="name">' + esc(g.name) + '</div>' +
            '<div class="meta">' + num(g.members) + ' membres • <code>' + esc(g.id) + '</code></div></div>' +
            '<a class="tag" href="/communaute?guild=' + esc(g.id) + '">Communauté</a></div>';
        }).join('');
      }

      const tasks = data.scheduler || [];
      fill('scheduler', tasks.length === 0
        ? '<div class="empty">Le planificateur démarre après la connexion à Discord.</div>'
        : '<table><thead><tr><th>Tâche</th><th>Fréquence</th><th>Exécutions</th><th>Erreurs</th><th>Dernière</th></tr></thead><tbody>' +
          tasks.map((task) => '<tr><td>' + esc(task.name) + '</td><td>' + duration(task.intervalMs) +
            '</td><td>' + num(task.runs) + '</td><td>' + (task.errors > 0 ? '<span class="tag err">' + task.errors + '</span>' : '0') +
            '</td><td>' + (task.lastRun ? new Date(task.lastRun).toLocaleTimeString('fr-FR') : '—') + '</td></tr>').join('') +
          '</tbody></table>');

      const collections = data.database || [];
      const total = collections.reduce((sum, entry) => sum + (entry.size || 0), 0);
      fill('database', collections.length === 0
        ? '<div class="empty">Aucune donnée enregistrée pour le moment.</div>'
        : '<table><thead><tr><th>Collection</th><th>Entrées</th><th>Répartition</th></tr></thead><tbody>' +
          collections.map((entry) => {
            const ratio = total > 0 ? Math.round((entry.size / total) * 100) : 0;
            return '<tr><td><code>' + esc(entry.name) + '</code></td><td>' + num(entry.size) +
              '</td><td><div class="bar"><span style="width:' + ratio + '%"></span></div></td></tr>';
          }).join('') +
          '</tbody></table>');
    } catch (error) {
      /* le pastille de statut affiche déjà l'erreur */
    }
  }

  refresh();
  setInterval(refresh, 15000);
  `;

  return renderShell({
    title: 'Elysia • Tableau de bord',
    subtitle: 'Bot Discord tout-en-un • modération, giveaways, communauté &amp; mini-jeux',
    active: '/',
    body,
    script,
    status: true,
  });
}

/** Catalogue interactif des commandes (recherche + filtres par catégorie). */
export function renderCommandsPage(): string {
  const body = `
  <section>
    <div class="section-head">
      <h2>Catalogue des commandes</h2>
      <span class="meta" id="count">Chargement…</span>
    </div>
    <div class="card">
      <div class="controls">
        <input type="search" id="search" placeholder="Rechercher une commande, une option…" />
        <select id="category"><option value="">Toutes les catégories</option></select>
      </div>
      <div class="chips" id="chips"></div>
    </div>
    <div id="list" style="margin-top:18px"><div class="empty">Chargement du catalogue…</div></div>
  </section>
  `;

  const script = `
  let COMMANDS = [];
  let CATEGORIES = [];
  let category = '';
  let query = '';

  function render() {
    const needle = query.trim().toLowerCase();
    const filtered = COMMANDS.filter((cmd) => {
      if (category && cmd.category !== category) return false;
      if (!needle) return true;
      return (cmd.name + ' ' + cmd.summary + ' ' + cmd.description + ' ' + (cmd.usage || []).join(' ') + ' ' + (cmd.options || []).join(' '))
        .toLowerCase().includes(needle);
    });

    setText('count', filtered.length + ' / ' + COMMANDS.length + ' commande(s)');
    if (filtered.length === 0) { fill('list', '<div class="empty">Aucune commande ne correspond à cette recherche.</div>'); return; }

    const groups = new Map();
    for (const cmd of filtered) {
      const list = groups.get(cmd.category) || [];
      list.push(cmd);
      groups.set(cmd.category, list);
    }

    fill('list', CATEGORIES.filter((cat) => groups.has(cat.id)).map((cat) => {
      const items = groups.get(cat.id).map((cmd) => {
        const badges = [];
        if (cmd.ownerOnly) badges.push('<span class="tag warn">propriétaire</span>');
        if (cmd.permissions && cmd.permissions.length) badges.push('<span class="tag">' + esc(cmd.permissions.join(' · ')) + '</span>');
        if (cmd.cooldown) badges.push('<span class="tag">' + cmd.cooldown + ' s</span>');
        return '<div class="cmd">' +
          '<div class="top"><span class="title">/' + esc(cmd.name) + '</span>' + badges.join('') + '</div>' +
          '<div class="desc">' + esc(cmd.summary) + (cmd.description && cmd.description !== cmd.summary ? ' — ' + esc(cmd.description) : '') + '</div>' +
          ((cmd.usage || []).length ? '<div class="use">' + cmd.usage.map(esc).join('<br />') + '</div>' : '') +
          ((cmd.options || []).length ? '<div class="meta" style="margin-top:8px">Options : ' + cmd.options.map((o) => '<code>' + esc(o) + '</code>').join(' ') + '</div>' : '') +
          '</div>';
      }).join('');
      return '<div class="section-head"><h2>' + cat.emoji + ' ' + esc(cat.label) + ' (' + groups.get(cat.id).length + ')</h2></div>' + items;
    }).join(''));
  }

  async function load() {
    try {
      const data = await fetchJson('/api/commands');
      COMMANDS = data.commands;
      CATEGORIES = data.categories;
      const select = document.getElementById('category');
      select.innerHTML = '<option value="">Toutes les catégories (' + COMMANDS.length + ')</option>' +
        CATEGORIES.map((cat) => '<option value="' + esc(cat.id) + '">' + cat.emoji + ' ' + esc(cat.label) + ' (' + cat.count + ')</option>').join('');
      fill('chips', '<span class="chip active" data-cat="">Tout</span>' + CATEGORIES.map((cat) =>
        '<span class="chip" data-cat="' + esc(cat.id) + '">' + cat.emoji + ' ' + esc(cat.label) + ' · ' + cat.count + '</span>').join(''));
      for (const chip of document.querySelectorAll('.chip')) {
        chip.onclick = () => {
          category = chip.dataset.cat || '';
          select.value = category;
          for (const other of document.querySelectorAll('.chip')) other.className = 'chip' + (other === chip ? ' active' : '');
          render();
        };
      }
      select.onchange = () => {
        category = select.value;
        for (const chip of document.querySelectorAll('.chip')) chip.className = 'chip' + (chip.dataset.cat === category ? ' active' : '');
        render();
      };
      document.getElementById('search').oninput = (event) => { query = event.target.value; render(); };
      render();
    } catch (error) {
      fill('list', guardToken(error));
    }
  }

  load();
  `;

  return renderShell({
    title: 'Elysia • Commandes',
    subtitle: 'Catalogue complet, filtrable et toujours à jour',
    active: '/commandes',
    body,
    script,
    status: true,
  });
}

/** Classements des mini-jeux, par serveur et par jeu. */
export function renderGamesPage(): string {
  const body = `
  <div class="grid">
    <div class="card"><div class="label">Mini-jeux</div><div class="value" id="games-count">—</div></div>
    <div class="card"><div class="label">Joueurs classés</div><div class="value" id="players">—</div></div>
    <div class="card"><div class="label">Parties en cours</div><div class="value" id="active">—</div></div>
    <div class="card"><div class="label">Participations jouées</div><div class="value" id="finished">—</div></div>
  </div>

  <section>
    <div class="section-head">
      <h2>Classement</h2>
      <div class="controls">
        <select id="guild"></select>
        <select id="game"><option value="">Tous les jeux (points cumulés)</option></select>
        <select id="limit"><option value="10">Top 10</option><option value="25">Top 25</option><option value="50">Top 50</option></select>
      </div>
    </div>
    <div class="card" style="padding:8px 6px"><div id="board"><div class="empty">Chargement…</div></div></div>
  </section>

  <section>
    <div class="section-head"><h2>Les 10 jeux</h2><span class="meta">Jouables directement dans Discord avec <code>/jeu</code></span></div>
    <div id="catalogue" class="grid"></div>
  </section>
  `;

  const script = `
  let selectedGuild = new URLSearchParams(location.search).get('guild') || '';

  async function loadCatalogue() {
    try {
      const data = await fetchJson('/api/games');
      setText('games-count', data.games.length);
      setText('players', num(data.players));
      setText('active', data.activeSessions);
      setText('finished', num(data.played));
      fill('game', '<option value="">Tous les jeux (points cumulés)</option>' +
        data.games.map((game) => '<option value="' + esc(game.id) + '">' + game.emoji + ' ' + esc(game.label) + '</option>').join(''));
      document.getElementById('game').onchange = loadBoard;
      fill('catalogue', data.games.map((game) =>
        '<div class="card"><div class="label">' + game.emoji + ' ' + esc(game.label) + '</div>' +
        '<div class="meta" style="margin-top:8px">' + esc(game.description) + '</div>' +
        '<div class="meta" style="margin-top:8px">' + num(game.players) + ' joueur(s) • ' + num(game.points) + ' point(s)</div></div>').join(''));
    } catch (error) { fill('catalogue', guardToken(error)); }
  }

  async function loadGuilds() {
    const data = await fetchJson('/api/stats');
    const select = document.getElementById('guild');
    const guilds = data.guilds || [];
    if (guilds.length === 0) { select.innerHTML = '<option value="">Aucun serveur</option>'; return; }
    if (!selectedGuild) selectedGuild = guilds[0].id;
    select.innerHTML = guilds.map((g) => '<option value="' + esc(g.id) + '"' + (g.id === selectedGuild ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('');
    select.onchange = () => { selectedGuild = select.value; loadBoard(); };
  }

  async function loadBoard() {
    const game = document.getElementById('game').value;
    const limit = document.getElementById('limit').value;
    fill('board', '<div class="empty">Chargement…</div>');
    try {
      const data = await fetchJson('/api/leaderboard?guild=' + encodeURIComponent(selectedGuild) + '&game=' + encodeURIComponent(game) + '&limit=' + limit);
      if (!data.entries.length) { fill('board', '<div class="empty">Aucune partie enregistrée sur ce serveur pour le moment — lancez un <code>/jeu</code> !</div>'); return; }
      const max = data.entries[0].points || 1;
      fill('board', '<table><thead><tr><th>#</th><th>Joueur</th><th>Points</th><th>V / D / N</th><th>Parties</th><th>Meilleure série</th><th>Répartition</th></tr></thead><tbody>' +
        data.entries.map((entry, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : (index + 1);
          const record = entry.games && game && entry.games[game] ? entry.games[game] : entry.total;
          return '<tr><td>' + medal + '</td><td>' + esc(entry.tag) + '</td><td><strong>' + num(entry.points) + '</strong></td>' +
            '<td>' + record.wins + ' / ' + record.losses + ' / ' + record.draws + '</td><td>' + num(record.played) + '</td>' +
            '<td>' + num(record.bestStreak) + '</td>' +
            '<td><div class="bar"><span style="width:' + Math.round(((entry.points || 0) / max) * 100) + '%"></span></div></td></tr>';
        }).join('') + '</tbody></table>');
    } catch (error) { fill('board', guardToken(error)); }
  }

  document.getElementById('limit').onchange = loadBoard;
  loadGuilds().then(loadCatalogue).then(loadBoard);
  setInterval(loadBoard, 30000);
  `;

  return renderShell({
    title: 'Elysia • Classements',
    subtitle: 'Qui domine les mini-jeux ? Classements en direct par serveur',
    active: '/jeux',
    body,
    script,
    status: true,
  });
}

/** Vie communautaire : niveaux, suggestions, sondages, anniversaires, comptes à rebours. */
export function renderCommunityPage(): string {
  const body = `
  <div class="grid">
    <div class="card"><div class="label">⭐ XP distribuée</div><div class="value" id="xp">—</div></div>
    <div class="card"><div class="label">👥 Membres classés</div><div class="value" id="ranked">—</div></div>
    <div class="card"><div class="label">💡 Suggestions</div><div class="value" id="suggestions">—</div></div>
    <div class="card"><div class="label">🗳️ Sondages</div><div class="value" id="polls">—</div></div>
    <div class="card"><div class="label">🎂 Anniversaires</div><div class="value" id="birthdays">—</div></div>
    <div class="card"><div class="label">⏳ Comptes à rebours</div><div class="value" id="countdowns">—</div></div>
  </div>

  <section>
    <div class="section-head">
      <h2>Niveaux &amp; XP</h2>
      <div class="controls"><select id="guild"></select></div>
    </div>
    <div class="card" style="padding:8px 6px"><div id="levels"><div class="empty">Chargement…</div></div></div>
  </section>

  <section>
    <div class="section-head"><h2>Suggestions</h2><span class="meta">Votes 👍 / 👎 en direct</span></div>
    <div id="suggestions-list"><div class="empty">Chargement…</div></div>
  </section>

  <section>
    <div class="section-head"><h2>Sondages en cours</h2><span class="meta">Clôture automatique à l'échéance</span></div>
    <div id="polls-list"><div class="empty">Chargement…</div></div>
  </section>

  <section>
    <div class="grid" style="margin-top:0">
      <div class="card"><div class="label">🎂 Prochains anniversaires</div><div id="birthdays-list" style="margin-top:10px"><div class="meta">Chargement…</div></div></div>
      <div class="card"><div class="label">⏳ Comptes à rebours</div><div id="countdowns-list" style="margin-top:10px"><div class="meta">Chargement…</div></div></div>
    </div>
  </section>
  `;

  const script = `
  let guildId = new URLSearchParams(location.search).get('guild') || '';

  async function loadGuilds() {
    const data = await fetchJson('/api/stats');
    const select = document.getElementById('guild');
    const guilds = data.guilds || [];
    if (guilds.length === 0) { select.innerHTML = '<option value="">Aucun serveur</option>'; return; }
    if (!guildId) guildId = guilds[0].id;
    select.innerHTML = guilds.map((g) => '<option value="' + esc(g.id) + '"' + (g.id === guildId ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('');
    select.onchange = () => { guildId = select.value; load(); };
  }

  async function load() {
    try {
      const data = await fetchJson('/api/community?guild=' + encodeURIComponent(guildId) + '&limit=25');
      setText('xp', num(data.levels.totalXp));
      setText('ranked', num(data.levels.total));
      setText('suggestions', num(data.suggestions.counts.all));
      setText('polls', num(data.polls.active + data.polls.ended));
      setText('birthdays', num(data.birthdays.total));
      setText('countdowns', num(data.countdowns.length));

      fill('levels', data.levels.top.length === 0
        ? '<div class="empty">Aucun message comptabilisé : activez le module Niveaux avec <code>/config niveaux actif:true</code>.</div>'
        : '<table><thead><tr><th>#</th><th>Membre</th><th>Niveau</th><th>XP</th><th>Messages</th><th>Progression</th></tr></thead><tbody>' +
          data.levels.top.map((entry, index) =>
            '<tr><td>' + (index + 1) + '</td><td>' + esc(entry.tag) + '</td><td><strong>' + entry.level + '</strong></td>' +
            '<td>' + num(entry.xp) + '</td><td>' + num(entry.messages) + '</td>' +
            '<td><div class="bar"><span style="width:' + Math.round((entry.ratio || 0) * 100) + '%"></span></div></td></tr>').join('') +
          '</tbody></table>');

      const counts = data.suggestions.counts;
      const header = '<div class="chips"><span class="chip active">Toutes : ' + counts.all + '</span>' +
        '<span class="chip">Ouvertes : ' + counts.ouverte + '</span><span class="chip">Acceptées : ' + counts.acceptee + '</span>' +
        '<span class="chip">Refusées : ' + counts.refusee + '</span><span class="chip">Archivées : ' + counts.archivee + '</span></div>';
      const items = data.suggestions.recent.map((entry) => {
        const score = entry.up - entry.down;
        return '<div class="row"><div class="grow"><div class="name">' + esc(entry.text) + '</div>' +
          '<div class="meta">#' + entry.id.split(':').pop() + ' • ' + esc(entry.author) + ' • ' + new Date(entry.createdAt).toLocaleDateString('fr-FR') +
          '</div></div><span class="tag ' + (score >= 0 ? 'ok' : 'err') + '">' + (score >= 0 ? '+' : '') + score + '</span>' +
          '<span class="tag">' + esc(entry.status) + '</span></div>';
      }).join('');
      fill('suggestions-list', header + (items || '<div class="empty">Aucune suggestion pour le moment — lancez <code>/suggestion envoyer</code> !</div>'));

      fill('polls-list', data.polls.list.length === 0
        ? '<div class="empty">Aucun sondage pour le moment — créez-en un avec <code>/sondage</code>.</div>'
        : data.polls.list.map((poll) =>
            '<div class="row"><div class="grow"><div class="name">' + esc(poll.question) + '</div>' +
            '<div class="meta">' + poll.options.length + ' choix • ' + num(poll.voters) + ' votant(s) • ' +
            (poll.endsAt ? 'clôture dans ' + duration(poll.endsAt - Date.now()) : 'sans limite') + '</div></div>' +
            '<span class="tag ' + (poll.ended ? '' : 'ok') + '">' + (poll.ended ? 'terminé' : 'en cours') + '</span>' +
            '<span class="tag">' + esc(poll.leader) + '</span></div>').join(''));

      fill('birthdays-list', (data.birthdays.upcoming || []).length === 0
        ? '<div class="meta">Aucun anniversaire enregistré.</div>'
        : data.birthdays.upcoming.map((entry) =>
            '<div class="meta" style="padding:4px 0">🎂 <strong>' + esc(entry.tag) + '</strong> — ' +
            String(entry.day).padStart(2, '0') + '/' + String(entry.month).padStart(2, '0') +
            (entry.daysLeft === 0 ? ' <span class="tag ok">aujourd\\'hui</span>' : ' dans ' + entry.daysLeft + ' j') + '</div>').join(''));

      fill('countdowns-list', data.countdowns.length === 0
        ? '<div class="meta">Aucun compte à rebours actif.</div>'
        : data.countdowns.map((entry) =>
            '<div class="meta" style="padding:4px 0">⏳ <strong>' + esc(entry.title) + '</strong> — dans ' +
            duration(entry.targetAt - Date.now()) + ' <span class="meta">(' + new Date(entry.targetAt).toLocaleString('fr-FR') + ')</span></div>').join(''));
    } catch (error) {
      fill('levels', guardToken(error));
    }
  }

  loadGuilds().then(load);
  setInterval(load, 30000);
  `;

  return renderShell({
    title: 'Elysia • Communauté',
    subtitle: 'Niveaux, suggestions, sondages, anniversaires & comptes à rebours',
    active: '/communaute',
    body,
    script,
    status: true,
  });
}

/** Données internes : cases, notes du staff et journaux (protégés par jeton). */
export function renderDataPage(): string {
  const body = `
  <section>
    <div class="section-head">
      <h2>Sanctions &amp; notes du staff</h2>
      <div class="controls">
        <select id="guild"></select>
        <button onclick="askToken()">🔑 Jeton du tableau de bord</button>
      </div>
    </div>
    <div class="card" style="padding:8px 6px"><div id="cases"><div class="empty">Chargement…</div></div></div>
  </section>

  <section>
    <div class="section-head"><h2>Membres les plus commentés</h2><span class="meta">Notes internes du staff (<code>/note</code>)</span></div>
    <div class="card" style="padding:8px 6px"><div id="notes"><div class="empty">Chargement…</div></div></div>
  </section>

  <section>
    <div class="section-head"><h2>Journaux en direct</h2><span class="meta">400 dernières lignes — protégé par <code>DASHBOARD_TOKEN</code></span></div>
    <div class="card"><div class="log" id="logs"><div class="empty">Chargement…</div></div></div>
  </section>
  `;

  const script = `
  let guildId = new URLSearchParams(location.search).get('guild') || '';

  async function loadGuilds() {
    const data = await fetchJson('/api/stats');
    const select = document.getElementById('guild');
    const guilds = data.guilds || [];
    if (guilds.length === 0) { select.innerHTML = '<option value="">Aucun serveur</option>'; return; }
    if (!guildId) guildId = guilds[0].id;
    select.innerHTML = guilds.map((g) => '<option value="' + esc(g.id) + '"' + (g.id === guildId ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('');
    select.onchange = () => { guildId = select.value; loadCases(); };
  }

  async function loadCases() {
    try {
      const data = await fetchJson('/api/cases?guild=' + encodeURIComponent(guildId) + '&limit=25');
      if (!data.cases.length) { fill('cases', '<div class="empty">Aucune sanction enregistrée. Tout est calme 🌿</div>'); return; }
      fill('cases', '<table><thead><tr><th>#</th><th>Type</th><th>Membre</th><th>Modérateur</th><th>Raison</th><th>État</th><th>Date</th></tr></thead><tbody>' +
        data.cases.map((entry) =>
          '<tr><td>' + entry.number + '</td><td><span class="tag' + (entry.active ? ' err' : '') + '">' + esc(entry.type) + '</span></td>' +
          '<td>' + esc(entry.target) + '</td><td>' + esc(entry.moderator) + '</td><td>' + esc(entry.reason || '—') + '</td>' +
          '<td>' + (entry.active ? 'actif' : 'archivé') + '</td><td>' + new Date(entry.createdAt).toLocaleDateString('fr-FR') + '</td></tr>').join('') +
        '</tbody></table>');
    } catch (error) { fill('cases', guardToken(error)); }
  }

  async function loadNotes() {
    try {
      const data = await fetchJson('/api/notes?guild=' + encodeURIComponent(guildId));
      fill('notes', data.notes.length === 0
        ? '<div class="empty">Aucune note interne.</div>'
        : '<table><thead><tr><th>Membre</th><th>Notes</th><th>Dernière</th></tr></thead><tbody>' +
          data.notes.map((entry) =>
            '<tr><td>' + esc(entry.tag) + '</td><td>' + entry.count + '</td><td>' + new Date(entry.lastAt).toLocaleDateString('fr-FR') + '</td></tr>').join('') +
          '</tbody></table>');
    } catch (error) { fill('notes', guardToken(error)); }
  }

  async function loadLogs() {
    try {
      const data = await fetchJson('/api/logs?limit=200');
      fill('logs', data.logs.length === 0
        ? '<div class="empty">Aucune ligne de journal pour le moment.</div>'
        : data.logs.map((entry) =>
            '<div class="l lvl-' + esc(entry.level) + '"><span class="t">' + esc(entry.time) + '</span>' +
            '<span class="s">' + esc(entry.scope) + '</span><span class="m">' + esc(entry.message) + '</span></div>').join(''));
    } catch (error) { fill('logs', guardToken(error)); }
  }

  loadGuilds().then(() => { loadCases(); loadNotes(); loadLogs(); });
  setInterval(() => { loadLogs(); loadCases(); }, 10000);
  `;

  return renderShell({
    title: 'Elysia • Données',
    subtitle: 'Sanctions, notes du staff et journaux internes',
    active: '/donnees',
    body,
    script,
    status: true,
  });
}
