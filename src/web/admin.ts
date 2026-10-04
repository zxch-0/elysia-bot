/**
 * Onglet admin caché (`/admin`).
 *
 * Ce fichier ne contient **aucune** donnée sensible : il produit du HTML.
 * Les réglages, les actions et le simulateur passent par `/api/admin/*`
 * (cookie de session `HttpOnly` obligatoire).
 *
 * La page est volontairement absente de la navigation publique : elle n'est
 * accessible qu'en tapant l'URL ou via le geste discret du pied de page.
 */

/** Habillage spécifique du panneau (thème « alerte », indépendant du site). */
const ADMIN_CSS = `
  :root {
    --bg: #0a0509;
    --panel: rgba(255,255,255,0.04);
    --border: rgba(255,255,255,0.10);
    --text: #f4eef2;
    --muted: #b1a4ad;
    --danger: #ef4444;
    --danger-soft: rgba(239,68,68,0.14);
    --warning: #f59e0b;
    --success: #22c55e;
    --primary: #a855f7;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, sans-serif;
    background:
      radial-gradient(900px 500px at 15% -10%, rgba(239,68,68,0.20), transparent 60%),
      radial-gradient(800px 480px at 90% 0%, rgba(168,85,247,0.16), transparent 55%),
      linear-gradient(180deg, #0a0509, #140a12 60%, #0a0509);
    background-attachment: fixed;
  }
  .wrap { max-width: 1160px; margin: 0 auto; padding: 30px 20px 80px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .logo {
    width: 54px; height: 54px; border-radius: 16px; display: grid; place-items: center; font-size: 26px;
    background: linear-gradient(135deg, #ef4444, #a855f7); box-shadow: 0 12px 32px rgba(239,68,68,0.35);
  }
  h1 { margin: 0; font-size: 24px; letter-spacing: -0.3px; }
  .sub { color: var(--muted); font-size: 13px; margin-top: 3px; }
  .badge {
    display: inline-flex; align-items: center; gap: 8px; padding: 7px 13px; border-radius: 999px; font-size: 12.5px; font-weight: 700;
    background: var(--danger-soft); border: 1px solid rgba(239,68,68,0.4); color: #fca5a5;
  }
  .badge.ok { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.35); color: #86efac; }
  .badge.warn { background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.38); color: #fcd34d; }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); margin-top: 22px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 18px; }
  .label { color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: 1.1px; font-weight: 700; }
  .value { font-size: 22px; font-weight: 700; margin-top: 8px; }
  section { margin-top: 30px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 1.3px; color: var(--muted); margin: 0 0 12px; }
  .section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .box { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 18px; }
  .box.danger { border-color: rgba(239,68,68,0.42); background: rgba(239,68,68,0.06); }
  .box.warn { border-color: rgba(245,158,11,0.4); background: rgba(245,158,11,0.06); }
  label { display: block; font-size: 12.5px; color: var(--muted); margin-bottom: 5px; font-weight: 600; }
  input[type="text"], input[type="number"], input[type="password"], select, textarea {
    width: 100%; background: rgba(0,0,0,0.45); border: 1px solid var(--border); color: var(--text);
    padding: 10px 12px; border-radius: 11px; font-size: 13.5px; font-family: inherit;
  }
  input:focus, select:focus, textarea:focus { outline: none; border-color: rgba(239,68,68,0.6); }
  textarea { min-height: 70px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
  .fields { display: grid; gap: 13px; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); align-items: end; }
  .check { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--text); }
  .check input { width: auto; }
  button {
    cursor: pointer; font-family: inherit; font-size: 13.5px; font-weight: 700; color: #f4eef2;
    background: rgba(168,85,247,0.20); border: 1px solid rgba(168,85,247,0.5); padding: 11px 16px; border-radius: 12px;
  }
  button:hover { background: rgba(168,85,247,0.3); }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  button.danger { background: rgba(239,68,68,0.22); border-color: rgba(239,68,68,0.6); }
  button.danger:hover { background: rgba(239,68,68,0.34); }
  button.stop {
    font-size: 16px; padding: 16px 22px; width: 100%; letter-spacing: 0.6px;
    background: linear-gradient(135deg, #dc2626, #991b1b); border-color: #ef4444;
    box-shadow: 0 10px 30px rgba(239,68,68,0.35);
  }
  button.ghost { background: transparent; border-color: var(--border); color: var(--muted); }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
  code { background: rgba(255,255,255,0.08); padding: 2px 7px; border-radius: 6px; font-size: 12.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--muted); text-transform: uppercase; letter-spacing: 0.9px; font-size: 11px; padding: 9px 10px; border-bottom: 1px solid var(--border); }
  td { padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: top; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .log { max-height: 320px; overflow: auto; background: rgba(0,0,0,0.4); border: 1px solid var(--border); border-radius: 12px; padding: 10px; }
  .log div { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; padding: 2px 0; border-bottom: 1px dashed rgba(255,255,255,0.05); }
  .log .ok { color: #86efac; } .log .warn { color: #fcd34d; } .log .error { color: #fca5a5; } .log .info { color: #c4b5fd; }
  .pill { font-size: 11.5px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
  .pill.on { background: rgba(239,68,68,0.16); border-color: rgba(239,68,68,0.45); color: #fca5a5; }
  .pill.off { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.32); color: #86efac; }
  .empty { color: var(--muted); font-size: 13px; padding: 12px; border: 1px dashed var(--border); border-radius: 12px; }
  .hint { color: var(--muted); font-size: 12.5px; line-height: 1.6; margin-top: 8px; }
  .status-line { font-size: 13px; color: var(--muted); margin-top: 10px; min-height: 18px; }
  .status-line.err { color: #fca5a5; } .status-line.ok { color: #86efac; }
  footer { margin-top: 40px; text-align: center; color: var(--muted); font-size: 12px; }
  /* Écran de déverrouillage */
  .lock { max-width: 430px; margin: 12vh auto 0; text-align: center; }
  .lock .logo { margin: 0 auto 18px; }
  .lock input { text-align: center; letter-spacing: 8px; font-size: 22px; padding: 15px; margin-top: 16px; }
  .lock button { width: 100%; margin-top: 12px; }
`;

/** Helpers JS partagés par l'écran de verrouillage et le panneau. */
const ADMIN_HELPERS = `
  const esc = (value) => String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const num = (value) => new Intl.NumberFormat('fr-FR').format(Number(value) || 0);
  const stamp = (at) => at ? new Date(at).toLocaleString('fr-FR') : '—';
  const line = (id, message, kind) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || '';
    el.className = 'status-line' + (kind ? ' ' + kind : '');
  };
`;

function page(title: string, body: string, script: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${title}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔐</text></svg>" />
<style>${ADMIN_CSS}</style>
</head>
<body>
<div class="wrap">
${body}
  <footer>Elysia • panneau d’administration interne — accès journalisé</footer>
</div>
<script>
${ADMIN_HELPERS}
${script}
</script>
</body>
</html>`;
}

/** Écran de saisie du code (aucune information sur le bot n'est exposée). */
export function renderAdminLock(): string {
  const body = `
  <div class="lock">
    <div class="logo">🔐</div>
    <h1>Accès restreint</h1>
    <div class="sub">Espace d’administration — authentification requise</div>
    <form id="form" autocomplete="off">
      <input id="code" type="password" inputmode="numeric" placeholder="••••" maxlength="64" autofocus aria-label="Code d'accès" />
      <button type="submit">Déverrouiller</button>
    </form>
    <div class="status-line" id="status"></div>
  </div>`;

  const script = `
  const form = document.getElementById('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = document.getElementById('code').value;
    if (!code) return;
    line('status', 'Vérification…');
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-elysia-admin': '1' },
        body: JSON.stringify({ code }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        line('status', 'Accès autorisé, ouverture du panneau…', 'ok');
        location.reload();
        return;
      }
      document.getElementById('code').value = '';
      const extra = data.retryAfterSeconds ? ' (réessayez dans ' + data.retryAfterSeconds + ' s)' : '';
      const left = typeof data.attemptsLeft === 'number' ? ' — ' + data.attemptsLeft + ' essai(s) restant(s)' : '';
      line('status', (data.error || 'Code refusé.') + extra + left, 'err');
    } catch (error) {
      line('status', 'Erreur réseau : ' + error.message, 'err');
    }
  });
  `;

  return page('Elysia • accès restreint', body, script);
}

/** Panneau complet (chargé uniquement après authentification). */
export function renderAdminPanel(): string {
  const body = `
  <header>
    <div class="brand">
      <div class="logo">🛡️</div>
      <div>
        <h1>Panneau d’administration</h1>
        <div class="sub">Anti-raid • simulateur de raid • journal d’audit</div>
      </div>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <span class="badge" id="session-badge">session active</span>
      <button class="ghost" id="logout">Déconnexion</button>
    </div>
  </header>

  <div id="alerts"></div>

  <div class="grid" id="cards"></div>

  <section>
    <div class="section-head">
      <h2>🛡️ Anti-raid</h2>
      <span class="pill" id="antiraid-pill">—</span>
    </div>
    <div class="box">
      <div class="fields">
        <div>
          <label for="ar-guild">Serveur protégé</label>
          <select id="ar-guild"></select>
        </div>
        <div class="check"><input type="checkbox" id="ar-enabled" /> <label for="ar-enabled" style="margin:0">Protection active</label></div>
        <div class="check"><input type="checkbox" id="ar-auto" /> <label for="ar-auto" style="margin:0">Verrouillage automatique</label></div>
        <div>
          <label for="ar-duration">Durée du verrouillage (min, 0 = manuel)</label>
          <input type="number" id="ar-duration" min="0" max="1440" />
        </div>
      </div>

      <div class="fields" style="margin-top:14px">
        <div><label for="ar-joins-th">Arrivées : seuil</label><input type="number" id="ar-joins-th" min="2" max="200" /></div>
        <div><label for="ar-joins-win">Arrivées : fenêtre (s)</label><input type="number" id="ar-joins-win" min="2" max="300" /></div>
        <div><label for="ar-ch-th">Salons : seuil</label><input type="number" id="ar-ch-th" min="2" max="50" /></div>
        <div><label for="ar-ch-win">Salons : fenêtre (s)</label><input type="number" id="ar-ch-win" min="2" max="300" /></div>
        <div><label for="ar-ro-th">Rôles : seuil</label><input type="number" id="ar-ro-th" min="2" max="50" /></div>
        <div><label for="ar-ro-win">Rôles : fenêtre (s)</label><input type="number" id="ar-ro-win" min="2" max="300" /></div>
        <div><label for="ar-ban-th">Bans : seuil</label><input type="number" id="ar-ban-th" min="2" max="100" /></div>
        <div><label for="ar-ban-win">Bans : fenêtre (s)</label><input type="number" id="ar-ban-win" min="2" max="600" /></div>
      </div>

      <div class="fields" style="margin-top:14px">
        <div><label for="ar-age">Âge minimal du compte (jours, 0 = off)</label><input type="number" id="ar-age" min="0" max="365" /></div>
        <div>
          <label for="ar-age-action">Sanction compte récent</label>
          <select id="ar-age-action">
            <option value="none">Aucune (alerte)</option>
            <option value="timeout">Timeout</option>
            <option value="kick">Expulsion</option>
            <option value="ban">Bannissement</option>
          </select>
        </div>
        <div>
          <label for="ar-age-raid">Sanction pendant un raid</label>
          <select id="ar-age-raid">
            <option value="none">Aucune (alerte)</option>
            <option value="timeout">Timeout</option>
            <option value="kick">Expulsion</option>
            <option value="ban">Bannissement</option>
          </select>
        </div>
      </div>

      <div class="fields" style="margin-top:14px">
        <div class="check"><input type="checkbox" id="ar-spam-on" /> <label for="ar-spam-on" style="margin:0">Anti-spam de messages</label></div>
        <div><label for="ar-spam-msgs">Spam : messages</label><input type="number" id="ar-spam-msgs" min="3" max="100" /></div>
        <div><label for="ar-spam-win">Spam : fenêtre (s)</label><input type="number" id="ar-spam-win" min="2" max="60" /></div>
        <div>
          <label for="ar-spam-action">Spam : sanction</label>
          <select id="ar-spam-action">
            <option value="none">Aucune (alerte)</option>
            <option value="timeout">Timeout</option>
            <option value="kick">Expulsion</option>
            <option value="ban">Bannissement</option>
          </select>
        </div>
        <div><label for="ar-spam-timeout">Spam : durée du timeout (min)</label><input type="number" id="ar-spam-timeout" min="1" max="1440" /></div>
      </div>

      <div class="fields" style="margin-top:14px">
        <div class="check"><input type="checkbox" id="ar-del-ch" /> <label for="ar-del-ch" style="margin:0">Supprimer les salons créés en masse</label></div>
        <div class="check"><input type="checkbox" id="ar-del-ro" /> <label for="ar-del-ro" style="margin:0">Supprimer les rôles créés en masse</label></div>
        <div class="check"><input type="checkbox" id="ar-mention" /> <label for="ar-mention" style="margin:0">Mentionner le staff dans les alertes</label></div>
        <div><label for="ar-alert">Salon d’alerte (ID, vide = salon de logs)</label><input type="text" id="ar-alert" placeholder="123456789012345678" /></div>
      </div>

      <div class="fields" style="margin-top:14px">
        <div>
          <label for="ar-trusted-users">Membres de confiance (1 ID par ligne)</label>
          <textarea id="ar-trusted-users" placeholder="123456789012345678"></textarea>
        </div>
        <div>
          <label for="ar-trusted-roles">Rôles de confiance (1 ID par ligne)</label>
          <textarea id="ar-trusted-roles" placeholder="123456789012345678"></textarea>
        </div>
      </div>

      <div class="actions">
        <button id="ar-save">💾 Enregistrer les réglages</button>
        <button class="danger" id="ar-lock">🔒 Verrouiller maintenant</button>
        <button id="ar-unlock">🔓 Déverrouiller</button>
        <button class="ghost" id="ar-test">🧪 Tester la détection (sans effet)</button>
      </div>
      <div class="status-line" id="ar-status"></div>
      <div class="hint">
        Le verrouillage retire l’écriture à <code>@everyone</code> dans tous les salons textuels et
        mémorise les permissions d’origine : « Déverrouiller » restaure l’état exact d’avant.
        Les membres disposant de la permission Administrateur (et la liste de confiance) ne sont jamais sanctionnés.
      </div>
    </div>

    <div class="box" style="margin-top:14px">
      <h2 style="margin-top:0">Dernières détections</h2>
      <div id="ar-events" class="empty">Aucun événement.</div>
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2>🧪 Simulateur de raid</h2>
      <span class="pill" id="sim-pill">inactif</span>
    </div>
    <div class="box danger">
      <div style="font-size:13.5px;line-height:1.7">
        <strong>⚠️ Outil de test.</strong> La simulation crée ses <em>propres</em> salons temporaires
        (<code>sim-raid-*</code>) et n’écrit jamais dans vos salons existants. Tout est supprimé à la fin.
        Utilisation réservée aux serveurs listés dans <code>RAID_SIM_GUILD_IDS</code>.
      </div>
      <div class="fields" style="margin-top:16px">
        <div>
          <label for="sim-guild">Serveur de test autorisé</label>
          <select id="sim-guild"></select>
        </div>
        <div><label for="sim-messages">Messages à spammer (max 60)</label><input type="number" id="sim-messages" value="10" min="0" max="60" /></div>
        <div><label for="sim-message-interval">Intervalle messages (ms, min 1100)</label><input type="number" id="sim-message-interval" value="1200" min="1100" max="10000" /></div>
        <div><label for="sim-channels">Salons à créer (max 10)</label><input type="number" id="sim-channels" value="3" min="0" max="10" /></div>
        <div><label for="sim-channel-interval">Intervalle salons (ms, min 900)</label><input type="number" id="sim-channel-interval" value="1000" min="900" max="10000" /></div>
        <div style="grid-column: 1 / -1"><label for="sim-text">Texte du message (les mentions sont neutralisées)</label><input type="text" id="sim-text" maxlength="180" value="🧪 Test de résistance Elysia" /></div>
        <div>
          <label for="sim-confirm">Saisissez <code>SIMULATION</code> pour confirmer</label>
          <input type="text" id="sim-confirm" placeholder="SIMULATION" autocomplete="off" />
        </div>
      </div>
      <div class="actions">
        <button class="danger" id="sim-start">🚀 Lancer la simulation</button>
        <button class="ghost" id="sim-cleanup">🧹 Nettoyer les salons <code>sim-raid-*</code> restants</button>
      </div>
      <div style="margin-top:16px">
        <button class="stop" id="sim-stop">⛔ STOP RAID SIM</button>
      </div>
      <div class="status-line" id="sim-status"></div>
      <div class="status-line" id="sim-progress"></div>
      <div class="log" id="sim-log" style="margin-top:14px"><div class="info">Aucune simulation en cours.</div></div>
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2>📜 Journal d’audit</h2>
      <span class="pill" id="audit-count">—</span>
    </div>
    <div class="box" id="audit" class="empty">Chargement…</div>
  </section>

  <section>
    <div class="section-head">
      <h2>🔎 Journaux du bot</h2>
      <span class="pill">temps réel</span>
    </div>
    <div class="box"><div class="log" id="bot-logs"><div class="info">Chargement…</div></div></div>
  </section>
  `;

  const script = `
  let overview = null;
  let selectedGuild = localStorage.getItem('elysiaAdminGuild') || '';
  let refreshTimer = null;

  async function api(path, options) {
    const opts = options || {};
    const headers = { 'x-elysia-admin': '1' };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { location.reload(); throw new Error('Session expirée'); }
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || ('HTTP ' + response.status));
      error.data = data;
      throw error;
    }
    return data;
  }

  function currentGuilds() {
    return (overview && overview.guilds) || [];
  }

  function fillGuildSelect(id, guilds, value, allowEmpty, emptyLabel) {
    const select = document.getElementById(id);
    if (!select) return;
    const previous = value || select.value;
    select.innerHTML = (allowEmpty ? '<option value="">' + esc(emptyLabel || '—') + '</option>' : '') +
      guilds.map((guild) => '<option value="' + esc(guild.id) + '">' + esc(guild.name) + ' • ' + num(guild.members) + ' membres</option>').join('');
    if (previous) select.value = previous;
  }

  function renderAlerts() {
    const alerts = [];
    const security = overview.security || {};
    if (security.codeIsDefault) {
      alerts.push('<div class="box warn" style="margin-top:18px"><strong>⚠️ Code d’accès par défaut.</strong> ' +
        'Changez <code>ADMIN_PANEL_CODE</code> dans le fichier <code>.env</code> : un code à 4 chiffres reste devinable. ' +
        'Un code long (24 caractères ou plus) est recommandé.</div>');
    }
    if (!overview.raidSim.enabled) {
      alerts.push('<div class="box danger" style="margin-top:18px"><strong>🚫 Simulateur désactivé.</strong> ' +
        'Aucun serveur de test n’est autorisé. Ajoutez <code>RAID_SIM_GUILD_IDS=&lt;id de votre serveur de test&gt;</code> ' +
        'puis redémarrez le bot pour activer la simulation. Tant que cette variable est vide, aucune action offensive n’est possible.</div>');
    }
    if (overview.raidSim.dryRun) {
      alerts.push('<div class="box" style="margin-top:18px"><strong>🧪 Mode démonstration (DRY_RUN).</strong> ' +
        'Le bot n’est pas connecté à Discord : les simulations sont jouées localement, sans aucun effet réel.</div>');
    }
    if (!overview.bot.ready && !overview.raidSim.dryRun) {
      alerts.push('<div class="box warn" style="margin-top:18px"><strong>⏳ Bot non connecté.</strong> Les actions Discord seront indisponibles jusqu’à la connexion.</div>');
    }
    document.getElementById('alerts').innerHTML = alerts.join('');
  }

  function renderCards() {
    const security = overview.security || {};
    const sim = overview.raidSim;
    const stats = overview.stats || {};
    const cards = [
      { label: 'Anti-raid', value: overview.antiraid.settings.enabled ? 'Actif' : 'Désactivé' },
      { label: 'Verrouillage', value: overview.antiraid.settings.state.lockdownActive ? '🔒 En cours' : 'Aucun' },
      { label: 'Raids détectés', value: num(overview.antiraid.settings.state.detections || 0) },
      { label: 'Sessions admin', value: num(security.activeSessions || 0) },
      { label: 'Tentatives ratées (10 min)', value: num(security.recentFailures || 0) },
      { label: 'Simulateur', value: sim.status === 'running' ? '🚀 En cours' : sim.enabled ? 'Prêt' : 'Désactivé' },
      { label: 'Serveurs du bot', value: num(stats.guildCount || 0) },
      { label: 'Commandes exécutées', value: num((stats.stats && stats.stats.commandsRun) || 0) },
    ];
    document.getElementById('cards').innerHTML = cards.map((card) =>
      '<div class="card"><div class="label">' + esc(card.label) + '</div><div class="value">' + esc(card.value) + '</div></div>'
    ).join('');
  }

  function renderAntiRaid() {
    const data = overview.antiraid;
    const settings = data.settings;
    const pill = document.getElementById('antiraid-pill');
    pill.textContent = settings.state.lockdownActive ? '🔒 verrouillé' : settings.enabled ? 'surveillance active' : 'désactivé';
    pill.className = 'pill ' + (settings.state.lockdownActive ? 'on' : 'off');

    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
    const check = (id, value) => { const el = document.getElementById(id); if (el) el.checked = Boolean(value); };

    check('ar-enabled', settings.enabled);
    check('ar-auto', settings.lockdown.auto);
    set('ar-duration', Math.round((settings.lockdown.durationSeconds || 0) / 60));
    set('ar-joins-th', settings.joins.threshold);
    set('ar-joins-win', settings.joins.windowSeconds);
    set('ar-ch-th', settings.channels.threshold);
    set('ar-ch-win', settings.channels.windowSeconds);
    set('ar-ro-th', settings.roles.threshold);
    set('ar-ro-win', settings.roles.windowSeconds);
    set('ar-ban-th', settings.bans.threshold);
    set('ar-ban-win', settings.bans.windowSeconds);
    set('ar-age', settings.accountAge.days);
    set('ar-age-action', settings.accountAge.action);
    set('ar-age-raid', settings.accountAge.actionDuringRaid);
    check('ar-spam-on', settings.spam.enabled);
    set('ar-spam-msgs', settings.spam.messages);
    set('ar-spam-win', settings.spam.windowSeconds);
    set('ar-spam-action', settings.spam.action);
    set('ar-spam-timeout', settings.spam.timeoutMinutes);
    check('ar-del-ch', settings.channels.deleteCreated);
    check('ar-del-ro', settings.roles.deleteCreated);
    check('ar-mention', settings.alert.mentionAdmins);
    set('ar-alert', settings.alert.channelId || '');
    set('ar-trusted-users', (settings.trusted.userIds || []).join('\\n'));
    set('ar-trusted-roles', (settings.trusted.roleIds || []).join('\\n'));

    const events = data.events || [];
    document.getElementById('ar-events').className = events.length ? '' : 'empty';
    document.getElementById('ar-events').innerHTML = events.length === 0 ? 'Aucun événement.' :
      '<table><thead><tr><th>Heure</th><th>Type</th><th>Détail</th><th>Auteur</th></tr></thead><tbody>' +
      events.map((event) => '<tr><td>' + esc(new Date(event.at).toLocaleTimeString('fr-FR')) + '</td><td>' + esc(event.kind) +
        '</td><td>' + esc(event.reason) + (event.action ? ' — <em>' + esc(event.action) + '</em>' : '') +
        '</td><td>' + (event.actorId ? '<code>' + esc(event.actorId) + '</code>' : '—') + '</td></tr>').join('') +
      '</tbody></table>';
  }

  function collectAntiRaid() {
    const value = (id) => document.getElementById(id).value;
    const checked = (id) => document.getElementById(id).checked;
    const number = (id) => Number.parseInt(value(id), 10) || 0;
    const list = (id) => value(id).split(/[\\s,;]+/).map((entry) => entry.trim()).filter((entry) => /^\\d{17,20}$/.test(entry));
    return {
      enabled: checked('ar-enabled'),
      joins: { windowSeconds: number('ar-joins-win'), threshold: number('ar-joins-th') },
      channels: { windowSeconds: number('ar-ch-win'), threshold: number('ar-ch-th'), deleteCreated: checked('ar-del-ch') },
      roles: { windowSeconds: number('ar-ro-win'), threshold: number('ar-ro-th'), deleteCreated: checked('ar-del-ro') },
      bans: { windowSeconds: number('ar-ban-win'), threshold: number('ar-ban-th') },
      accountAge: { days: number('ar-age'), action: value('ar-age-action'), actionDuringRaid: value('ar-age-raid') },
      spam: {
        enabled: checked('ar-spam-on'),
        messages: number('ar-spam-msgs'),
        windowSeconds: number('ar-spam-win'),
        action: value('ar-spam-action'),
        timeoutMinutes: number('ar-spam-timeout'),
      },
      lockdown: {
        auto: checked('ar-auto'),
        durationSeconds: number('ar-duration') * 60,
        denySendMessages: true,
        denyReactions: true,
        denyCreateThreads: true,
      },
      alert: { channelId: value('ar-alert').trim() || null, mentionAdmins: checked('ar-mention') },
      trusted: { userIds: list('ar-trusted-users'), roleIds: list('ar-trusted-roles') },
    };
  }

  function renderSim() {
    const sim = overview.raidSim;
    const pill = document.getElementById('sim-pill');
    pill.textContent = sim.status === 'running' ? '🚀 en cours' : sim.status === 'done' ? 'terminé' : sim.enabled ? 'prêt' : 'désactivé';
    pill.className = 'pill ' + (sim.status === 'running' ? 'on' : 'off');

    const logs = sim.logs || [];
    document.getElementById('sim-log').innerHTML = logs.length === 0
      ? '<div class="info">Aucune simulation en cours.</div>'
      : logs.map((entry) => '<div class="' + esc(entry.level) + '">' + esc(entry.message) + '</div>').join('');
    const log = document.getElementById('sim-log');
    log.scrollTop = log.scrollHeight;

    const progress = sim.progress || {};
    const progressLine = document.getElementById('sim-progress');
    if (progressLine) {
      progressLine.textContent = (progress.messagesPlanned || progress.channelsPlanned)
        ? 'Avancement — messages : ' + (progress.messagesSent || 0) + '/' + (progress.messagesPlanned || 0) +
          ' • salons temporaires : ' + (progress.channelsCreated || 0) + '/' + (progress.channelsPlanned || 0) +
          ' • nettoyés : ' + (progress.cleanedChannels || 0)
        : '';
    }

    document.getElementById('sim-stop').disabled = sim.status !== 'running' && sim.status !== 'stopping';
    document.getElementById('sim-start').disabled = sim.status === 'running' || !sim.enabled || (sim.allowlist || []).length === 0;
    document.getElementById('sim-start').textContent = sim.status === 'running' ? '🚀 Simulation en cours…' : '🚀 Lancer la simulation';
  }

  function renderAudit() {
    const entries = overview.audit || [];
    document.getElementById('audit-count').textContent = entries.length + ' entrée(s)';
    const box = document.getElementById('audit');
    box.className = 'box';
    box.innerHTML = entries.length === 0 ? '<div class="empty">Aucune entrée.</div>' :
      '<table><thead><tr><th>Heure</th><th>Type</th><th>Action</th><th>Détail</th><th>IP</th></tr></thead><tbody>' +
      entries.map((entry) => '<tr><td>' + esc(new Date(entry.at).toLocaleString('fr-FR')) + '</td><td>' +
        (entry.kind === 'ok' ? '<span class="pill off">succès</span>' : entry.kind === 'refus' ? '<span class="pill on">refus</span>' : '<span class="pill">action</span>') +
        '</td><td>' + esc(entry.action) + '</td><td>' + esc(entry.detail) + '</td><td class="mono">' + esc(entry.ip) + '</td></tr>').join('') +
      '</tbody></table>';
  }

  function renderBotLogs() {
    const logs = overview.logs || [];
    document.getElementById('bot-logs').innerHTML = logs.length === 0 ? '<div class="info">Aucun journal.</div>' :
      logs.map((entry) => '<div class="' + esc(entry.level) + '">' + esc(entry.clock) + ' <strong>' + esc(entry.scope) + '</strong> ' + esc(entry.message) + '</div>').join('');
  }

  async function refresh() {
    try {
      const data = await api('/api/admin/overview?guild=' + encodeURIComponent(selectedGuild));
      overview = data;
      selectedGuild = data.selectedGuild || selectedGuild;
      fillGuildSelect('ar-guild', currentGuilds(), selectedGuild, false);
      fillGuildSelect('sim-guild', currentGuilds().filter((guild) => (data.raidSim.allowlist || []).includes(guild.id)), selectedGuild, false);
      renderAlerts();
      renderCards();
      renderAntiRaid();
      renderSim();
      renderAudit();
      renderBotLogs();
      const badge = document.getElementById('session-badge');
      badge.textContent = 'session • ' + (data.security.sessionTtlMinutes || 0) + ' min • ' + data.guilds.length + ' serveur(s)';
      if (data.raidSim.status === 'running') { schedule(1500); } else { schedule(6000); }
    } catch (error) {
      line('ar-status', 'Chargement impossible : ' + error.message, 'err');
      schedule(6000);
    }
  }

  function schedule(delay) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, delay);
  }

  document.getElementById('logout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST', body: {} }).catch(() => undefined);
    location.href = '/admin';
  });

  document.getElementById('ar-guild').addEventListener('change', (event) => {
    selectedGuild = event.target.value;
    localStorage.setItem('elysiaAdminGuild', selectedGuild);
    refresh();
  });
  document.getElementById('sim-guild').addEventListener('change', (event) => {
    selectedGuild = event.target.value;
    localStorage.setItem('elysiaAdminGuild', selectedGuild);
    refresh();
  });

  document.getElementById('ar-save').addEventListener('click', async () => {
    line('ar-status', 'Enregistrement…');
    try {
      await api('/api/admin/antiraid/save', { method: 'POST', body: { guildId: selectedGuild, settings: collectAntiRaid() } });
      line('ar-status', 'Réglages enregistrés.', 'ok');
      refresh();
    } catch (error) { line('ar-status', error.message, 'err'); }
  });

  document.getElementById('ar-lock').addEventListener('click', async () => {
    const minutes = Number.parseInt(document.getElementById('ar-duration').value, 10) || 0;
    if (!confirm('Verrouiller TOUS les salons textuels de ce serveur maintenant ?')) return;
    line('ar-status', 'Verrouillage en cours…');
    try {
      const data = await api('/api/admin/antiraid/lockdown', { method: 'POST', body: { guildId: selectedGuild, durationSeconds: minutes * 60 } });
      line('ar-status', 'Serveur verrouillé (' + data.channels + ' salons).', 'ok');
      refresh();
    } catch (error) { line('ar-status', error.message, 'err'); }
  });

  document.getElementById('ar-unlock').addEventListener('click', async () => {
    line('ar-status', 'Déverrouillage en cours…');
    try {
      const data = await api('/api/admin/antiraid/release', { method: 'POST', body: { guildId: selectedGuild } });
      line('ar-status', 'Serveur déverrouillé (' + data.channels + ' salons restaurés).', 'ok');
      refresh();
    } catch (error) { line('ar-status', error.message, 'err'); }
  });

  document.getElementById('ar-test').addEventListener('click', async () => {
    line('ar-status', 'Test en cours…');
    try {
      const data = await api('/api/admin/antiraid/test', { method: 'POST', body: { guildId: selectedGuild, type: 'arrivees' } });
      const lines = (data.results || []).map((result) => result.explain).join('\\n');
      alert(lines || 'Aucun résultat');
      line('ar-status', 'Test terminé (aucun effet sur le serveur).', 'ok');
    } catch (error) { line('ar-status', error.message, 'err'); }
  });

  document.getElementById('sim-start').addEventListener('click', async () => {
    const confirmField = document.getElementById('sim-confirm').value.trim();
    if (confirmField.toUpperCase() !== 'SIMULATION') {
      line('sim-status', 'Saisissez exactement « SIMULATION » pour confirmer.', 'err');
      return;
    }
    const guildId = document.getElementById('sim-guild').value;
    if (!guildId) { line('sim-status', 'Aucun serveur de test autorisé.', 'err'); return; }
    line('sim-status', 'Démarrage…');
    try {
      await api('/api/admin/raid-sim/start', {
        method: 'POST',
        body: {
          guildId,
          confirm: confirmField,
          messages: Number.parseInt(document.getElementById('sim-messages').value, 10),
          messageIntervalMs: Number.parseInt(document.getElementById('sim-message-interval').value, 10),
          channels: Number.parseInt(document.getElementById('sim-channels').value, 10),
          channelIntervalMs: Number.parseInt(document.getElementById('sim-channel-interval').value, 10),
          text: document.getElementById('sim-text').value,
        },
      });
      document.getElementById('sim-confirm').value = '';
      line('sim-status', 'Simulation lancée — les salons temporaires seront supprimés automatiquement.', 'ok');
      refresh();
    } catch (error) { line('sim-status', error.message, 'err'); }
  });

  document.getElementById('sim-stop').addEventListener('click', async () => {
    line('sim-status', 'Arrêt demandé…');
    try {
      await api('/api/admin/raid-sim/stop', { method: 'POST', body: {} });
      line('sim-status', 'Simulation arrêtée et salons nettoyés.', 'ok');
      refresh();
    } catch (error) { line('sim-status', error.message, 'err'); }
  });

  document.getElementById('sim-cleanup').addEventListener('click', async () => {
    line('sim-status', 'Nettoyage…');
    try {
      const data = await api('/api/admin/raid-sim/cleanup', { method: 'POST', body: { guildId: document.getElementById('sim-guild').value } });
      line('sim-status', data.removed + ' salon(s) résiduel(s) supprimé(s).', 'ok');
      refresh();
    } catch (error) { line('sim-status', error.message, 'err'); }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (event.ctrlKey || event.metaKey)) location.href = '/';
  });

  refresh();
  `;

  return page('Elysia • administration', body, script);
}
