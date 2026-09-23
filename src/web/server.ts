import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ElysiaClient } from '../core/client';
import { loadConfig } from '../core/config';
import { logger, recentLogs, type LogEntry } from '../core/logger';
import { db } from '../core/database';
import { giveawayService, type Giveaway } from '../services/giveawayService';
import { panelService } from '../services/panelService';
import { caseService } from '../services/caseService';
import { noteService } from '../services/noteService';
import { guildService } from '../services/guildService';
import { levelService, totalXpForLevel, type LevelEntry } from '../services/levelService';
import { economyService } from '../services/economyService';
import { gameService } from '../services/gameService';
import { suggestionService } from '../services/suggestionService';
import { pollService } from '../services/pollService';
import { birthdayService } from '../services/birthdayService';
import { countdownService } from '../services/countdownService';
import { reminderService } from '../services/reminderService';
import type { SchedulerService } from '../services/schedulerService';
import { mergeRecords, type GameId, type GameRecord } from '../games/types';
import { CATEGORIES } from '../commands/categories';
import { formatPermissionName } from '../utils/permissions';
import { renderCommandsPage, renderCommunityPage, renderDashboard, renderDataPage, renderEconomyPage, renderGamesPage } from './pages';

const log = logger.child('web');

const STARTED_AT = Date.now();
const VERSION = '1.1.0';

export interface WebServerRefs {
  client: ElysiaClient;
  scheduler?: SchedulerService;
}

/** Pages HTML du site. */
const PAGES: Record<string, { render: () => string; label: string }> = {
  '/': { render: renderDashboard, label: 'Tableau de bord' },
  '/commandes': { render: renderCommandsPage, label: 'Catalogue des commandes' },
  '/jeux': { render: renderGamesPage, label: 'Classements des mini-jeux' },
  '/economie': { render: renderEconomyPage, label: 'Classement des fortunes' },
  '/communaute': { render: renderCommunityPage, label: 'Communauté' },
  '/donnees': { render: renderDataPage, label: 'Données internes' },
};

/**
 * Routes révélant des informations internes (membres sanctionnés, notes du
 * staff, journaux) : elles exigent `DASHBOARD_TOKEN` quand il est configuré.
 */
const PROTECTED_API = ['/api/cases', '/api/notes', '/api/reminders', '/api/logs'];

const COMMON_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
} as const;

function json(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    ...COMMON_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

function send(response: ServerResponse, status: number, body: string, contentType = 'text/plain; charset=utf-8', extra: Record<string, string> = {}): void {
  response.writeHead(status, {
    ...COMMON_HEADERS,
    ...extra,
    'content-type': contentType,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

/** Entier borné lu dans la chaîne de requête. */
function numberParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseInt(url.searchParams.get(name) ?? '', 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

/** Texte borné lu dans la chaîne de requête. */
function textParam(url: URL, name: string, max: number): string {
  return (url.searchParams.get(name) ?? '').trim().slice(0, max);
}

/** Serveur ciblé : `?guild=` sinon le premier serveur du bot. */
function resolveGuild(refs: WebServerRefs, url: URL): string {
  const requested = url.searchParams.get('guild');
  if (requested) return requested;
  return refs.client.guilds.cache.first()?.id ?? refs.client.snapshot().guilds[0]?.id ?? '';
}

/** Identifiants de tous les serveurs du bot (pour les agrégats globaux). */
function allGuildIds(refs: WebServerRefs): string[] {
  return refs.client.snapshot().guilds.map((guild) => guild.id);
}

function schedulerOf(refs: WebServerRefs): SchedulerService | undefined {
  // Le planificateur démarre après « ready » : il s'auto-enregistre sur le client.
  return (refs.client as unknown as { scheduler?: SchedulerService }).scheduler ?? refs.scheduler;
}

/** Vérifie le jeton du tableau de bord (vide = accès libre). */
function authorized(request: IncomingMessage, url: URL): boolean {
  const expected = loadConfig().dashboardToken;
  if (!expected) return true;
  const header = request.headers['x-dashboard-token'];
  const provided = (Array.isArray(header) ? header[0] : header) ?? url.searchParams.get('token') ?? '';
  return provided.trim() === expected;
}

/** Statistiques complètes consommées par la page d'accueil et `/api/stats`. */
function collectStats(refs: WebServerRefs) {
  const snapshot = refs.client.snapshot();
  const memory = process.memoryUsage();
  const interval = Number(process.env.SELF_PING_INTERVAL ?? 14);
  const guildIds = allGuildIds(refs);

  return {
    ...snapshot,
    service: 'elysia-bot',
    version: VERSION,
    node: process.version,
    processUptimeMs: Date.now() - STARTED_AT,
    memoryMb: Math.round((memory.heapUsed / 1048576) * 10) / 10,
    memoryTotalMb: Math.round((memory.rss / 1048576) * 10) / 10,
    giveaways: giveawayService.listActive().length,
    giveawaysTotal: giveawayService.total(),
    panels: panelService.total(),
    panelRoles: panelService.totalRoles(),
    cases: caseService.total(),
    notes: noteService.total(),
    reminders: reminderService.total(),
    xp: guildIds.reduce((sum, guildId) => sum + levelService.totalXp(guildId), 0),
    money: guildIds.reduce((sum, guildId) => sum + economyService.totalMoney(guildId), 0),
    suggestionsOpen: guildIds.reduce((sum, guildId) => sum + suggestionService.countGuild(guildId, 'ouverte'), 0),
    pollsActive: guildIds.reduce(
      (sum, guildId) => sum + pollService.listGuild(guildId).filter((poll) => !poll.ended).length,
      0,
    ),
    database: db.stats(),
    guildsConfigured: guildService.count(),
    tokenProtected: Boolean(loadConfig().dashboardToken),
    keepAlive: {
      endpoint: '/health',
      recommendedIntervalMinutes: interval > 0 ? interval : 14,
      note: 'Ajoutez https://VOTRE-SERVICE.onrender.com/health dans UptimeRobot (monitor HTTP, toutes les 5 min).',
    },
    scheduler: schedulerOf(refs)?.status() ?? [],
    pages: Object.keys(PAGES),
  };
}

/** Catalogue des slash-commands chargées (nom, catégorie, options, permissions). */
function collectCommands(refs: WebServerRefs) {
  const commands = [...refs.client.commands.values()];
  const categories = CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    emoji: category.emoji,
    description: category.description,
    count: commands.filter((command) => command.category === category.id).length,
  })).filter((category) => category.count > 0);

  const list = commands
    .map((command) => {
      const data = command.data.toJSON() as { name?: string; options?: Array<{ name: string; required?: boolean }> };
      const permissions = command.permissions;
      const labels: string[] = [];
      for (const permission of permissions?.user ?? []) labels.push(formatPermissionName(permission));
      for (const permission of permissions?.bot ?? []) labels.push(formatPermissionName(permission) + ' (bot)');
      if (permissions?.ownerOnly) labels.push('Propriétaire du bot');
      if (permissions?.adminOnly) labels.push('Administrateur du serveur');
      if (permissions?.allowDm) labels.push('Messages privés');

      return {
        name: data.name ?? 'inconnue',
        category: command.category,
        summary: command.summary ?? command.data.description,
        description: command.data.description,
        usage: command.usage ?? [],
        cooldown: command.cooldown ?? 0,
        options: (data.options ?? []).map((option) => option.name + (option.required ? '' : ' (optionnel)')),
        ownerOnly: Boolean(permissions?.ownerOnly),
        permissions: [...new Set(labels)],
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  return { count: list.length, categories, commands: list };
}

/** Classement des mini-jeux d'un serveur (`?guild=&game=&limit=`). */
function collectLeaderboard(refs: WebServerRefs, url: URL) {
  const guild = resolveGuild(refs, url);
  const game = textParam(url, 'game', 32);
  const limit = numberParam(url, 'limit', 10, 1, 100);

  const entries = gameService.leaderboard(guild, limit, (game || undefined) as GameId | undefined).map((entry) => ({
    userId: entry.stats.userId,
    tag: entry.stats.tag,
    points: entry.points,
    // Bilan cumulé de tous les jeux (le classement par jeu fournit `games`).
    total: mergeRecords(Object.values(entry.stats.games).filter((record): record is GameRecord => Boolean(record))),
    games: entry.stats.games,
    updatedAt: entry.stats.updatedAt,
  }));

  return { guild, game: game || null, limit, entries };
}

/** Classement des fortunes et agrégats économiques d'un serveur. */
function collectEconomy(refs: WebServerRefs, url: URL) {
  const guild = resolveGuild(refs, url);
  const limit = numberParam(url, 'limit', 10, 1, 100);

  const entries = economyService.leaderboard(guild, limit).map((entry) => ({
    userId: entry.userId,
    tag: entry.tag,
    wallet: entry.wallet,
    earned: entry.earned,
    casinoNet: entry.casinoNet,
    wagered: entry.wagered,
    transfersIn: entry.transfersIn,
    transfersOut: entry.transfersOut,
    messages: entry.messages,
  }));

  return { guild, limit, entries, ranked: economyService.countActive(guild), totals: economyService.totals(guild) };
}

/** Niveaux, suggestions, sondages, anniversaires et comptes à rebours. */
function collectCommunity(refs: WebServerRefs, url: URL) {
  const guild = resolveGuild(refs, url);
  const limit = numberParam(url, 'limit', 10, 1, 25);

  const top = levelService.leaderboard(guild, limit).map((entry: LevelEntry) => {
    const floor = totalXpForLevel(entry.level);
    const required = totalXpForLevel(entry.level + 1) - floor;
    return {
      userId: entry.userId,
      tag: entry.tag,
      level: entry.level,
      xp: entry.xp,
      messages: entry.messages,
      ratio: required > 0 ? Math.max(0, Math.min(1, (entry.xp - floor) / required)) : 0,
    };
  });

  const polls = pollService.listGuild(guild);
  const pollRows = polls
    .slice()
    .sort((a, b) => Number(a.ended) - Number(b.ended) || b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((poll) => {
      const results = pollService.results(poll);
      const best = results.lines.slice().sort((a, b) => b.count - a.count)[0];
      return {
        id: poll.id,
        question: poll.question,
        options: poll.options.map((option) => option.label),
        voters: results.totalVoters,
        votes: results.totalVotes,
        endsAt: poll.endsAt,
        ended: poll.ended,
        leader: best && best.count > 0 ? `${best.option.label} (${best.count})` : '—',
      };
    });

  return {
    guild,
    levels: {
      top,
      total: levelService.countActive(guild),
      totalXp: levelService.totalXp(guild),
    },
    suggestions: {
      counts: {
        all: suggestionService.countGuild(guild),
        ouverte: suggestionService.countGuild(guild, 'ouverte'),
        acceptee: suggestionService.countGuild(guild, 'acceptee'),
        refusee: suggestionService.countGuild(guild, 'refusee'),
        archivee: suggestionService.countGuild(guild, 'archivee'),
      },
      recent: suggestionService.listGuild(guild, undefined, limit).map((entry) => ({
        id: entry.id,
        text: entry.text,
        author: entry.anonymous ? 'Anonyme' : entry.authorTag,
        createdAt: entry.createdAt,
        up: entry.upVotes.length,
        down: entry.downVotes.length,
        status: entry.status,
      })),
      top: suggestionService.top(guild, 5).map((entry) => ({
        id: entry.id,
        text: entry.text,
        score: suggestionService.score(entry),
        status: entry.status,
      })),
    },
    polls: {
      active: polls.filter((poll) => !poll.ended).length,
      ended: polls.filter((poll) => poll.ended).length,
      list: pollRows,
    },
    birthdays: {
      total: birthdayService.listGuild(guild).length,
      upcoming: birthdayService.upcoming(guild, limit).map((entry) => ({
        tag: entry.userTag,
        day: entry.day,
        month: entry.month,
        daysLeft: entry.daysLeft,
      })),
    },
    countdowns: countdownService
      .listActive(guild)
      .sort((a, b) => a.targetAt - b.targetAt)
      .slice(0, limit)
      .map((entry) => ({ id: entry.id, title: entry.title, targetAt: entry.targetAt })),
  };
}

/** Concours en cours et derniers concours terminés. */
function collectGiveaways(refs: WebServerRefs, url: URL) {
  const guild = resolveGuild(refs, url);
  const limit = numberParam(url, 'limit', 10, 1, 50);

  const row = (giveaway: Giveaway) => ({
    id: giveaway.id,
    prize: giveaway.prize,
    channelId: giveaway.channelId,
    hostTag: giveaway.hostTag,
    winnerCount: giveaway.winnerCount,
    entries: giveaway.entries.length,
    endsAt: giveaway.ended ? giveaway.endedAt ?? giveaway.endsAt : giveaway.endsAt,
    ended: giveaway.ended,
    winners: giveaway.winners,
  });

  return {
    guild,
    active: giveawayService.listActive(guild).map(row),
    ended: giveawayService.listEnded(guild, limit).map(row),
    total: giveawayService.total(),
  };
}

/** Notes du staff agrégées par membre (avec la date de la dernière note). */
function collectNotes(refs: WebServerRefs, url: URL) {
  const guild = resolveGuild(refs, url);
  const limit = numberParam(url, 'limit', 25, 1, 100);

  const notes = noteService.topGuild(guild, limit).map((entry) => {
    const lastAt = noteService.list(guild, entry.userId).reduce((max, note) => Math.max(max, note.createdAt), 0);
    return { tag: entry.targetTag, userId: entry.userId, count: entry.count, lastAt };
  });

  return { guild, notes, total: noteService.total() };
}

/** Ligne de journal exposée par l'API (heure lisible + horodatage brut). */
interface LogRow {
  time: string;
  timestamp: number;
  level: LogEntry['level'];
  scope: string;
  message: string;
  meta: string;
}

/** Journal interne exposé au site (`?limit=`). */
function collectLogs(url: URL): { logs: LogRow[]; buffered: number } {
  const limit = numberParam(url, 'limit', 100, 1, 400);
  const logs: LogRow[] = recentLogs(limit).map((entry) => ({
    time: entry.clock,
    timestamp: entry.time,
    level: entry.level,
    scope: entry.scope,
    message: entry.message,
    meta: entry.meta,
  }));
  return { logs, buffered: recentLogs(400).length };
}

/** Serveur HTTP : health-check UptimeRobot, site intégré et API JSON. */
export function createWebServer(refs: WebServerRefs): http.Server {
  const server = http.createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const route = url.pathname.replace(/\/+$/, '') || '/';
    const method = (request.method ?? 'GET').toUpperCase();

    if (method !== 'GET' && method !== 'HEAD' && (route === '/ping' || route === '/keepalive')) {
      // Certains moniteurs de disponibilité envoient un POST de réveil.
      json(response, 200, { status: 'ok', ok: true, message: 'pong', timestamp: new Date().toISOString() });
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      json(response, 405, { error: 'Méthode non autorisée', method });
      return;
    }

    // Pages HTML du site (les données sensibles restent protégées côté API).
    const page = PAGES[route];
    if (page) {
      send(response, 200, page.render(), 'text/html; charset=utf-8', {
        // Le site s'affiche aussi dans une iframe (aperçus, embeds de tableaux de bord).
        'x-frame-options': 'ALLOWALL',
        'content-security-policy': "frame-ancestors *",
      });
      return;
    }

    if (route.startsWith('/api/') && PROTECTED_API.includes(route) && !authorized(request, url)) {
      json(response, 401, {
        error: 'Jeton du tableau de bord requis',
        hint: 'Renseignez DASHBOARD_TOKEN, puis envoyez l’en-tête « x-dashboard-token » (ou ?token=…).',
      });
      return;
    }

    switch (route) {
      case '/health':
      case '/api/health':
      case '/ping':
      case '/keepalive': {
        json(response, 200, {
          status: 'ok',
          ok: true,
          message: 'pong',
          ready: refs.client.isReady(),
          uptimeMs: refs.client.uptimeMs,
          latencyMs: Math.round(refs.client.ws.ping),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      case '/api': {
        json(response, 200, {
          service: 'elysia-bot',
          version: VERSION,
          pages: Object.entries(PAGES).map(([route_, meta]) => ({ path: route_, label: meta.label })),
          endpoints: [
            { path: '/health', description: 'Surveillance (UptimeRobot)' },
            { path: '/api/stats', description: 'Statistiques complètes' },
            { path: '/api/commands', description: 'Catalogue des slash-commands' },
            { path: '/api/games', description: 'Mini-jeux, joueurs et volumétrie' },
            { path: '/api/leaderboard', description: 'Classement des mini-jeux (?guild=&game=&limit=)' },
            { path: '/api/economy', description: 'Classement des fortunes (?guild=&limit=)' },
            { path: '/api/community', description: 'Niveaux, suggestions, sondages, anniversaires' },
            { path: '/api/giveaways', description: 'Concours en cours et terminés' },
            { path: '/api/panels', description: 'Panneaux de rôles' },
            { path: '/api/scheduler', description: 'Tâches planifiées' },
            { path: '/api/cases', description: 'Sanctions récentes (protégé)' },
            { path: '/api/notes', description: 'Notes du staff (protégé)' },
            { path: '/api/reminders', description: 'Rappels en attente (protégé)' },
            { path: '/api/logs', description: 'Journaux récents (protégé)' },
            { path: '/metrics', description: 'Métriques Prometheus' },
          ],
          dashboardToken: Boolean(loadConfig().dashboardToken),
        });
        return;
      }

      case '/api/stats':
      case '/stats': {
        json(response, 200, collectStats(refs));
        return;
      }

      case '/api/commands': {
        json(response, 200, collectCommands(refs));
        return;
      }

      case '/api/scheduler': {
        json(response, 200, { tasks: schedulerOf(refs)?.status() ?? [] });
        return;
      }

      case '/api/games': {
        const guildIds = allGuildIds(refs);
        const ranked = new Set<string>();
        let played = 0;

        const games = gameService.listDefinitions().map((definition) => {
          const seen = new Set<string>();
          let points = 0;

          for (const guildId of guildIds) {
            for (const entry of gameService.leaderboard(guildId, 500, definition.id)) {
              const key = `${guildId}:${entry.stats.userId}`;
              seen.add(key);
              ranked.add(key);
              points += entry.points;
              played += entry.stats.games[definition.id]?.played ?? 0;
            }
          }

          return {
            id: definition.id,
            label: definition.label,
            emoji: definition.emoji,
            description: definition.description,
            // Joueurs distincts ayant marqué des points sur ce jeu.
            players: seen.size,
            points,
          };
        });

        json(response, 200, {
          games,
          // Joueurs distincts classés (tous jeux confondus) et total persisté.
          players: ranked.size,
          totalPlayers: gameService.totalPlayers(),
          activeSessions: gameService.activeCount(),
          played,
        });
        return;
      }

      case '/api/leaderboard': {
        json(response, 200, collectLeaderboard(refs, url));
        return;
      }

      case '/api/economy': {
        json(response, 200, collectEconomy(refs, url));
        return;
      }

      case '/api/community': {
        json(response, 200, collectCommunity(refs, url));
        return;
      }

      case '/api/giveaways': {
        json(response, 200, collectGiveaways(refs, url));
        return;
      }

      case '/api/panels': {
        const guild = resolveGuild(refs, url);
        const panels = panelService.listGuild(guild).map((panel) => ({
          id: panel.id,
          name: panel.name,
          title: panel.title,
          channelId: panel.channelId,
          mode: panel.mode,
          roles: panel.roles.length,
          messageId: panel.messageId ?? null,
          createdAt: panel.createdAt,
        }));
        json(response, 200, { guild, panels, total: panelService.total(), totalRoles: panelService.totalRoles() });
        return;
      }

      case '/api/cases': {
        const guild = resolveGuild(refs, url);
        const limit = numberParam(url, 'limit', 25, 1, 100);
        const all = caseService.listGuild(guild);
        const cases = all
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit)
          .map((entry) => ({
            number: entry.caseNumber,
            type: entry.type,
            target: entry.targetTag,
            moderator: entry.moderatorTag,
            reason: entry.reason,
            active: entry.active,
            createdAt: entry.createdAt,
            expiresAt: entry.expiresAt,
          }));
        json(response, 200, { guild, total: all.length, cases });
        return;
      }

      case '/api/notes': {
        json(response, 200, collectNotes(refs, url));
        return;
      }

      case '/api/reminders': {
        const guild = resolveGuild(refs, url);
        const reminders = reminderService
          .listGuild(guild)
          .sort((a, b) => a.dueAt - b.dueAt)
          .map((entry) => ({ id: entry.id, tag: entry.userTag, text: entry.text, dueAt: entry.dueAt }));
        json(response, 200, { guild, reminders, total: reminderService.total() });
        return;
      }

      case '/api/logs': {
        json(response, 200, collectLogs(url));
        return;
      }

      case '/metrics': {
        const stats = collectStats(refs);
        const lines = [
          '# HELP elysia_up Le bot est connecté à Discord (1) ou non (0).',
          '# TYPE elysia_up gauge',
          `elysia_up ${stats.ready ? 1 : 0}`,
          '# HELP elysia_uptime_seconds Durée de fonctionnement du bot (secondes).',
          '# TYPE elysia_uptime_seconds gauge',
          `elysia_uptime_seconds ${Math.floor((stats.uptimeMs ?? 0) / 1000)}`,
          '# HELP elysia_guilds Nombre de serveurs.',
          '# TYPE elysia_guilds gauge',
          `elysia_guilds ${stats.guildCount}`,
          '# HELP elysia_users Membres cumulés.',
          '# TYPE elysia_users gauge',
          `elysia_users ${stats.userCount}`,
          '# HELP elysia_commands_loaded Slash-commands chargées.',
          '# TYPE elysia_commands_loaded gauge',
          `elysia_commands_loaded ${stats.commandCount}`,
          '# HELP elysia_modules_loaded Modules d’interaction enregistrés.',
          '# TYPE elysia_modules_loaded gauge',
          `elysia_modules_loaded ${stats.moduleCount}`,
          '# HELP elysia_commands_executed Commandes exécutées depuis le démarrage.',
          '# TYPE elysia_commands_executed counter',
          `elysia_commands_executed ${stats.stats.commandsRun}`,
          '# HELP elysia_interactions_handled Interactions traitées.',
          '# TYPE elysia_interactions_handled counter',
          `elysia_interactions_handled ${stats.stats.interactionsHandled}`,
          '# HELP elysia_errors_total Erreurs rencontrées.',
          '# TYPE elysia_errors_total counter',
          `elysia_errors_total ${stats.stats.errors}`,
          '# HELP elysia_giveaways_active Giveaways en cours.',
          '# TYPE elysia_giveaways_active gauge',
          `elysia_giveaways_active ${stats.giveaways}`,
          '# HELP elysia_polls_active Sondages en cours.',
          '# TYPE elysia_polls_active gauge',
          `elysia_polls_active ${stats.pollsActive}`,
          '# HELP elysia_suggestions_open Suggestions ouvertes.',
          '# TYPE elysia_suggestions_open gauge',
          `elysia_suggestions_open ${stats.suggestionsOpen}`,
          '# HELP elysia_xp_total XP cumulée sur tous les serveurs.',
          '# TYPE elysia_xp_total counter',
          `elysia_xp_total ${stats.xp}`,
          '# HELP elysia_money_total Argent en circulation sur tous les serveurs.',
          '# TYPE elysia_money_total gauge',
          `elysia_money_total ${stats.money ?? 0}`,
          '# HELP elysia_memory_heap_mb Mémoire de tas utilisée (Mo).',
          '# TYPE elysia_memory_heap_mb gauge',
          `elysia_memory_heap_mb ${stats.memoryMb}`,
        ];
        send(response, 200, lines.join('\n') + '\n', 'text/plain; version=0.0.4; charset=utf-8');
        return;
      }

      case '/favicon.ico': {
        // Le favicon est intégré en data-URI dans le HTML : évitons juste un 404 bruyant.
        response.writeHead(204, COMMON_HEADERS);
        response.end();
        return;
      }

      case '/robots.txt': {
        send(response, 200, 'User-agent: *\nDisallow: /api/\nDisallow: /donnees\nAllow: /\n');
        return;
      }

      default: {
        // Fichiers statiques optionnels (icônes, captures) servis depuis assets/.
        if (route.startsWith('/assets/')) {
          const assetsRoot = path.resolve(process.cwd(), loadConfig().assetsDir);
          const target = path.resolve(assetsRoot, route.replace('/assets/', ''));
          // Anti path-traversal : on ne sert que ce qui est sous assets/.
          if (!target.startsWith(assetsRoot + path.sep)) {
            json(response, 403, { error: 'Accès refusé' });
            return;
          }
          try {
            const content = await readFile(target);
            const types: Record<string, string> = {
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.gif': 'image/gif',
              '.webp': 'image/webp',
              '.svg': 'image/svg+xml',
            };
            response.writeHead(200, {
              ...COMMON_HEADERS,
              'content-type': types[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
              'cache-control': 'public, max-age=3600',
              'content-length': content.byteLength,
            });
            response.end(content);
          } catch {
            json(response, 404, { error: 'Ressource introuvable' });
          }
          return;
        }

        json(response, 404, {
          error: 'Route inconnue',
          pages: Object.keys(PAGES),
          routes: [
            '/health',
            '/api',
            '/api/stats',
            '/api/commands',
            '/api/games',
            '/api/leaderboard',
            '/api/economy',
            '/api/community',
            '/api/giveaways',
            '/api/panels',
            '/api/scheduler',
            '/metrics',
          ],
        });
        return;
      }
    }
  });

  server.on('error', (error) => {
    log.error('Erreur du serveur web', error);
  });

  return server;
}

/**
 * Démarre le serveur web. Sur Render, le port vient de `PORT` et l'accès
 * externe exige une écoute sur 0.0.0.0.
 */
export function startWebServer(refs: WebServerRefs): Promise<http.Server> {
  const config = loadConfig();
  return new Promise((resolve, reject) => {
    const server = createWebServer(refs);
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      log.success(
        `Serveur web à l'écoute sur http://${config.host}:${config.port} — site : ${Object.keys(PAGES).join(', ')}`,
      );
      if (config.dashboardToken) {
        log.info(`Accès protégé par DASHBOARD_TOKEN : /donnees et ${PROTECTED_API.join(', ')}.`);
      }
      resolve(server);
    });
  });
}
