/**
 * Habillage commun du site intégré (aucune ressource externe : le tableau de
 * bord fonctionne hors-ligne et s'affiche correctement dans une iframe).
 *
 * Toutes les pages partagent :
 *   • le même dégradé de fond et les mêmes cartes ;
 *   • une barre de navigation vers les pages du site ;
 *   • les utilitaires JS `esc`, `fmt`, `fetchJson` (jeton du tableau de bord inclus).
 */

export interface NavLink {
  href: string;
  label: string;
  emoji: string;
}

export const NAV: NavLink[] = [
  { href: '/', label: 'Tableau de bord', emoji: '📊' },
  { href: '/commandes', label: 'Commandes', emoji: '💬' },
  { href: '/jeux', label: 'Classements', emoji: '🎮' },
  { href: '/economie', label: 'Économie', emoji: '💰' },
  { href: '/communaute', label: 'Communauté', emoji: '🎉' },
  { href: '/donnees', label: 'Données', emoji: '🗄️' },
];

const CSS = `
  :root {
    --bg: #0b0714;
    --bg-soft: #140d24;
    --card: rgba(255,255,255,0.045);
    --card-strong: rgba(255,255,255,0.075);
    --border: rgba(255,255,255,0.09);
    --text: #ece9f6;
    --muted: #9d95b8;
    --primary: #8b5cf6;
    --secondary: #ec4899;
    --success: #22c55e;
    --error: #ef4444;
    --warning: #f59e0b;
    --info: #38bdf8;
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
  .wrap { max-width: 1180px; margin: 0 auto; padding: 30px 22px 70px; }
  header { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .logo {
    width: 56px; height: 56px; border-radius: 18px; display: grid; place-items: center; font-size: 28px;
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    box-shadow: 0 12px 34px rgba(139,92,246,0.42);
  }
  h1 { margin: 0; font-size: 27px; letter-spacing: -0.4px; }
  .sub { color: var(--muted); font-size: 13.5px; margin-top: 3px; }
  nav { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 22px; }
  nav a {
    text-decoration: none; color: var(--muted); font-size: 13.5px; font-weight: 600;
    padding: 9px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--card);
    transition: .18s color, .18s border-color, .18s background;
  }
  nav a:hover { color: var(--text); border-color: rgba(139,92,246,0.5); }
  nav a.active { color: #ddd6fe; background: rgba(139,92,246,0.18); border-color: rgba(139,92,246,0.45); }
  .status-pill {
    display: inline-flex; align-items: center; gap: 9px; padding: 9px 16px; border-radius: 999px;
    background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.35); color: #86efac; font-weight: 600; font-size: 13.5px;
  }
  .status-pill.off { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.35); color: #fca5a5; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: currentColor; animation: pulse 1.7s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.8); } }
  .grid { display: grid; gap: 16px; margin-top: 26px; grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)); }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 20px;
    backdrop-filter: blur(10px); transition: .22s transform, .22s border-color;
  }
  .card:hover { transform: translateY(-3px); border-color: rgba(139,92,246,0.45); }
  .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 1.1px; font-weight: 700; }
  .value { font-size: 29px; font-weight: 700; margin-top: 9px; letter-spacing: -0.6px; }
  .value small { font-size: 14px; color: var(--muted); font-weight: 500; }
  section { margin-top: 32px; }
  .section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
  h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 1.4px; color: var(--muted); margin: 0; }
  .row { display: flex; align-items: center; gap: 13px; padding: 13px 16px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); margin-bottom: 9px; }
  .row img, .avatar-fallback { width: 40px; height: 40px; border-radius: 12px; object-fit: cover; }
  .avatar-fallback { display: grid; place-items: center; background: linear-gradient(135deg, var(--primary), var(--secondary)); font-weight: 700; }
  .grow { flex: 1; min-width: 0; }
  .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { color: var(--muted); font-size: 12.5px; margin-top: 2px; }
  .tag { font-size: 11.5px; padding: 4px 10px; border-radius: 999px; background: rgba(139,92,246,0.16); border: 1px solid rgba(139,92,246,0.32); color: #c4b5fd; white-space: nowrap; }
  .tag.ok { background: rgba(34,197,94,0.14); border-color: rgba(34,197,94,0.34); color: #86efac; }
  .tag.warn { background: rgba(245,158,11,0.14); border-color: rgba(245,158,11,0.34); color: #fcd34d; }
  .tag.err { background: rgba(239,68,68,0.14); border-color: rgba(239,68,68,0.34); color: #fca5a5; }
  code { background: rgba(255,255,255,0.07); padding: 2px 7px; border-radius: 6px; font-size: 12.5px; }
  a { color: #c4b5fd; }
  .empty { color: var(--muted); font-size: 13.5px; padding: 14px 16px; border: 1px dashed var(--border); border-radius: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th { text-align: left; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; font-size: 11.5px; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  td { padding: 11px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }
  tr:hover td { background: rgba(255,255,255,0.025); }
  .bar { height: 7px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; min-width: 90px; }
  .bar > span { display: block; height: 100%; background: linear-gradient(90deg, var(--primary), var(--secondary)); }
  .controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  input[type="search"], select, input[type="password"], input[type="text"] {
    background: rgba(10,6,20,0.6); border: 1px solid var(--border); color: var(--text);
    padding: 10px 13px; border-radius: 12px; font-size: 13.5px; font-family: inherit; min-width: 190px;
  }
  input:focus, select:focus { outline: none; border-color: rgba(139,92,246,0.6); }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 4px; }
  .chip {
    cursor: pointer; font-size: 12.5px; padding: 7px 12px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--card); color: var(--muted);
  }
  .chip.active { color: #ddd6fe; background: rgba(139,92,246,0.18); border-color: rgba(139,92,246,0.45); }
  .cmd { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 15px 17px; margin-bottom: 10px; }
  .cmd .top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .cmd .title { font-weight: 700; font-size: 15px; }
  .cmd .desc { color: var(--muted); font-size: 13px; margin-top: 6px; }
  .cmd .use { color: #c4b5fd; font-size: 12.5px; margin-top: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .log { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.3px; line-height: 1.75; }
  .log .l { display: flex; gap: 10px; padding: 3px 0; border-bottom: 1px dashed rgba(255,255,255,0.05); }
  .log .t { color: var(--muted); flex: 0 0 92px; }
  .log .s { color: #c4b5fd; flex: 0 0 128px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .log .m { flex: 1; word-break: break-word; }
  .lvl-debug .m { color: var(--muted); } .lvl-info .m { color: #bae6fd; }
  .lvl-success .m { color: #86efac; } .lvl-warn .m { color: #fcd34d; } .lvl-error .m { color: #fca5a5; }
  footer { margin-top: 44px; color: var(--muted); font-size: 12.5px; text-align: center; line-height: 1.9; }
  .toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
  button {
    cursor: pointer; font-family: inherit; font-size: 13.5px; font-weight: 600; color: #ddd6fe;
    background: rgba(139,92,246,0.18); border: 1px solid rgba(139,92,246,0.45); padding: 10px 15px; border-radius: 12px;
  }
  button:hover { background: rgba(139,92,246,0.28); }
`;

/** Utilitaires JS partagés par toutes les pages. */
const HELPERS = `
  const esc = (value) => String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const num = (value) => new Intl.NumberFormat('fr-FR').format(Number(value) || 0);
  const fmt = (ms) => {
    const s = Math.floor((ms || 0) / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d > 0) return d + ' j ' + h + ' h';
    if (h > 0) return h + ' h ' + m + ' min';
    if (m > 0) return m + ' min ' + sec + ' s';
    return sec + ' s';
  };
  const duration = (ms) => {
    const abs = Math.max(0, Math.floor((ms || 0) / 1000));
    if (abs >= 86400) return Math.floor(abs / 86400) + ' j ' + Math.floor((abs % 86400) / 3600) + ' h';
    if (abs >= 3600) return Math.floor(abs / 3600) + ' h ' + Math.floor((abs % 3600) / 60) + ' min';
    if (abs >= 60) return Math.floor(abs / 60) + ' min';
    return abs + ' s';
  };
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.innerHTML = value; };
  const fill = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const token = () => localStorage.getItem('elysiaToken') || '';
  async function fetchJson(url) {
    const headers = {};
    const stored = token();
    if (stored) headers['x-dashboard-token'] = stored;
    const response = await fetch(url, { cache: 'no-store', headers });
    if (response.status === 401) { const error = new Error('unauthorized'); error.code = 401; throw error; }
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }
  function askToken(message) {
    const value = window.prompt(message || 'Jeton du tableau de bord (DASHBOARD_TOKEN) :', token());
    if (value !== null) { localStorage.setItem('elysiaToken', value.trim()); location.reload(); }
  }
  function guardToken(error) {
    if (error && error.code === 401) {
      return '<div class="empty">🔒 Cette section est protégée. <a href="#" onclick="askToken(); return false;">Saisir le jeton du tableau de bord</a>.</div>';
    }
    return '<div class="empty">⚠️ Données indisponibles : ' + esc(error && error.message) + '</div>';
  }
  const byPoints = (a, b) => (b.points || 0) - (a.points || 0);
`;

export interface ShellOptions {
  title: string;
  subtitle: string;
  active: string;
  body: string;
  script?: string;
  status?: boolean;
}

/** Assemble une page complète à partir de son contenu. */
export function renderShell(options: ShellOptions): string {
  const nav = NAV.map(
    (link) =>
      '<a href="' + link.href + '"' + (link.href === options.active ? ' class="active"' : '') + '>' +
      link.emoji + ' ' + link.label + '</a>',
  ).join('');

  const pill = options.status
    ? '<div id="status" class="status-pill off"><span class="dot"></span><span>Connexion…</span></div>'
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${options.title}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💜</text></svg>" />
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">
      <div class="logo">💜</div>
      <div>
        <h1>Elysia</h1>
        <div class="sub">${options.subtitle}</div>
      </div>
    </div>
    ${pill}
  </header>

  <nav>${nav}</nav>

${options.body}

  <footer>
    Elysia v1.0.0 — ${NAV.length} pages, interface 100 % autonome (aucune ressource externe)<br />
    Les pages se rafraîchissent automatiquement ; l'API JSON est ouverte pour vos propres intégrations.
  </footer>
</div>

<script>
${HELPERS}
${options.script ?? ''}
</script>
</body>
</html>`;
}

/** Barre de statut partagée (connexion à Discord). */
export const STATUS_SCRIPT = `
  async function refreshStatus() {
    try {
      const data = await fetchJson('/api/stats');
      const pill = document.getElementById('status');
      if (!pill) return;
      const offline = !data.ready;
      pill.className = 'status-pill' + (offline ? ' off' : '');
      pill.innerHTML = '<span class="dot"></span><span>' + (offline ? 'Hors ligne • connexion à Discord en cours' : 'En ligne • ' + esc(data.user ? data.user.tag : 'Elysia')) + '</span>';
    } catch (error) {
      const pill = document.getElementById('status');
      if (pill) { pill.className = 'status-pill off'; pill.innerHTML = '<span class="dot"></span><span>API injoignable</span>'; }
    }
  }
  refreshStatus();
  setInterval(refreshStatus, 15000);
`;
