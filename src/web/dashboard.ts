/** Tableau de bord HTML autonome (aucune ressource externe : fonctionne hors-ligne et en iframe). */
export function renderDashboard(): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Elysia • Tableau de bord</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💜</text></svg>" />
<style>
  :root {
    --bg: #0b0714;
    --bg-soft: #140d24;
    --card: rgba(255,255,255,0.045);
    --border: rgba(255,255,255,0.09);
    --text: #ece9f6;
    --muted: #9d95b8;
    --primary: #8b5cf6;
    --secondary: #ec4899;
    --success: #22c55e;
    --error: #ef4444;
    --warning: #f59e0b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, sans-serif;
    background:
      radial-gradient(1100px 600px at 12% -10%, rgba(139,92,246,0.30), transparent 60%),
      radial-gradient(900px 500px at 90% 0%, rgba(236,72,153,0.22), transparent 55%),
      linear-gradient(180deg, var(--bg), var(--bg-soft) 60%, var(--bg));
    background-attachment: fixed;
  }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 40px 22px 70px; }
  header { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .logo {
    width: 56px; height: 56px; border-radius: 18px; display: grid; place-items: center; font-size: 28px;
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    box-shadow: 0 12px 34px rgba(139,92,246,0.42);
  }
  h1 { margin: 0; font-size: 27px; letter-spacing: -0.4px; }
  .sub { color: var(--muted); font-size: 13.5px; margin-top: 3px; }
  .status-pill {
    display: inline-flex; align-items: center; gap: 9px; padding: 9px 16px; border-radius: 999px;
    background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.35); color: #86efac; font-weight: 600; font-size: 13.5px;
  }
  .status-pill.off { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.35); color: #fca5a5; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: currentColor; animation: pulse 1.7s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.8); } }
  .grid { display: grid; gap: 16px; margin-top: 30px; grid-template-columns: repeat(auto-fit, minmax(195px, 1fr)); }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 20px;
    backdrop-filter: blur(10px); transition: .22s transform, .22s border-color;
  }
  .card:hover { transform: translateY(-3px); border-color: rgba(139,92,246,0.45); }
  .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 1.1px; font-weight: 700; }
  .value { font-size: 29px; font-weight: 700; margin-top: 9px; letter-spacing: -0.6px; }
  .value small { font-size: 14px; color: var(--muted); font-weight: 500; }
  section { margin-top: 34px; }
  h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 1.4px; color: var(--muted); margin: 0 0 14px; }
  .row { display: flex; align-items: center; gap: 13px; padding: 13px 16px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); margin-bottom: 9px; }
  .row img, .avatar-fallback { width: 40px; height: 40px; border-radius: 12px; object-fit: cover; }
  .avatar-fallback { display: grid; place-items: center; background: linear-gradient(135deg, var(--primary), var(--secondary)); font-weight: 700; }
  .grow { flex: 1; min-width: 0; }
  .name { font-weight: 600; }
  .meta { color: var(--muted); font-size: 12.5px; margin-top: 2px; }
  .tag { font-size: 11.5px; padding: 4px 10px; border-radius: 999px; background: rgba(139,92,246,0.16); border: 1px solid rgba(139,92,246,0.32); color: #c4b5fd; }
  code { background: rgba(255,255,255,0.07); padding: 2px 7px; border-radius: 6px; font-size: 12.5px; }
  footer { margin-top: 44px; color: var(--muted); font-size: 12.5px; text-align: center; line-height: 1.9; }
  a { color: #c4b5fd; }
  .empty { color: var(--muted); font-size: 13.5px; padding: 14px 16px; border: 1px dashed var(--border); border-radius: 14px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">
      <div class="logo">💜</div>
      <div>
        <h1>Elysia</h1>
        <div class="sub">Bot Discord tout-en-un • modération, giveaways &amp; rôles réactifs</div>
      </div>
    </div>
    <div id="status" class="status-pill off"><span class="dot"></span><span>Connexion…</span></div>
  </header>

  <div class="grid">
    <div class="card"><div class="label">Latence</div><div class="value" id="latency">—<small> ms</small></div></div>
    <div class="card"><div class="label">Uptime</div><div class="value" id="uptime">—</div></div>
    <div class="card"><div class="label">Serveurs</div><div class="value" id="guilds">—</div></div>
    <div class="card"><div class="label">Membres</div><div class="value" id="members">—</div></div>
    <div class="card"><div class="label">Commandes</div><div class="value" id="commands">—</div></div>
    <div class="card"><div class="label">Giveaways actifs</div><div class="value" id="giveaways">—</div></div>
    <div class="card"><div class="label">Panneaux de rôles</div><div class="value" id="panels">—</div></div>
    <div class="card"><div class="label">Mémoire</div><div class="value" id="memory">—<small> Mo</small></div></div>
  </div>

  <section>
    <h2>Serveurs</h2>
    <div id="guild-list"><div class="empty">Chargement…</div></div>
  </section>

  <section>
    <h2>API</h2>
    <div class="row"><div class="grow"><div class="name"><code>GET /health</code></div><div class="meta">Endpoint de surveillance — à utiliser avec UptimeRobot</div></div><span class="tag">public</span></div>
    <div class="row"><div class="grow"><div class="name"><code>GET /api/stats</code></div><div class="meta">Statistiques complètes au format JSON</div></div><span class="tag">public</span></div>
    <div class="row"><div class="grow"><div class="name"><code>GET /metrics</code></div><div class="meta">Métriques au format Prometheus</div></div><span class="tag">public</span></div>
  </section>

  <footer>
    Elysia v1.0.0 — hébergée sur Render &amp; maintenue éveillée par UptimeRobot<br />
    Le tableau de bord se rafraîchit automatiquement toutes les 15 secondes.
  </footer>
</div>

<script>
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d > 0) return d + ' j ' + h + ' h';
    if (h > 0) return h + ' h ' + m + ' min';
    if (m > 0) return m + ' min ' + sec + ' s';
    return sec + ' s';
  };
  // Les noms de serveurs sont choisis par leurs propriétaires : sans
  // échappement, un nom malveillant pourrait injecter du HTML (XSS).
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.innerHTML = value; };

  async function refresh() {
    try {
      const response = await fetch('/api/stats', { cache: 'no-store' });
      const data = await response.json();
      const pill = document.getElementById('status');
      const offline = !data.ready;
      pill.className = 'status-pill' + (offline ? ' off' : '');
      pill.innerHTML = '<span class="dot"></span><span>' + (offline ? 'Hors ligne • connexion à Discord en cours' : 'En ligne • ' + esc(data.user ? data.user.tag : 'Elysia')) + '</span>';

      setText('latency', (data.latencyMs ?? 0) + '<small> ms</small>');
      setText('uptime', fmt(data.uptimeMs || 0));
      setText('guilds', data.guildCount ?? 0);
      setText('members', new Intl.NumberFormat('fr-FR').format(data.userCount || 0));
      setText('commands', data.commandCount ?? 0);
      setText('giveaways', data.giveaways ?? 0);
      setText('panels', data.panels ?? 0);
      setText('memory', Math.round((data.memoryMb ?? 0)) + '<small> Mo</small>');

      const list = document.getElementById('guild-list');
      if (!data.guilds || data.guilds.length === 0) {
        list.innerHTML = '<div class="empty">Le bot n\\'est encore sur aucun serveur. Invitez-le avec le lien généré par <code>/invite</code>.</div>';
      } else {
        list.innerHTML = data.guilds.map((g) => {
          const initial = (g.name || '?').charAt(0).toUpperCase();
          const icon = g.icon ? '<img src="' + esc(g.icon) + '" alt="" />' : '<div class="avatar-fallback">' + esc(initial) + '</div>';
          return '<div class="row">' + icon +
            '<div class="grow"><div class="name">' + esc(g.name) + '</div>' +
            '<div class="meta">' + new Intl.NumberFormat('fr-FR').format(g.members) + ' membres • <code>' + esc(g.id) + '</code></div></div>' +
            '<span class="tag">Serveur</span></div>';
        }).join('');
      }
    } catch (error) {
      const pill = document.getElementById('status');
      pill.className = 'status-pill off';
      pill.innerHTML = '<span class="dot"></span><span>API injoignable</span>';
    }
  }

  refresh();
  setInterval(refresh, 15000);
</script>
</body>
</html>`;
}
