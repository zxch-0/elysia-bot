import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ElysiaClient } from '../core/client';
import { loadConfig } from '../core/config';
import { logger } from '../core/logger';
import { db } from '../core/database';
import { giveawayService } from '../services/giveawayService';
import { panelService } from '../services/panelService';
import { caseService } from '../services/caseService';
import { guildService } from '../services/guildService';
import type { SchedulerService } from '../services/schedulerService';
import { renderDashboard } from './dashboard';

const log = logger.child('web');

const STARTED_AT = Date.now();

export interface WebServerRefs {
  client: ElysiaClient;
  scheduler?: SchedulerService;
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

function text(response: ServerResponse, status: number, body: string, contentType = 'text/plain; charset=utf-8'): void {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

function collectStats(refs: WebServerRefs) {
  const snapshot = refs.client.snapshot();
  const memory = process.memoryUsage();
  const interval = Number(process.env.SELF_PING_INTERVAL ?? 14);
  return {
    ...snapshot,
    service: 'elysia-bot',
    version: '1.0.0',
    node: process.version,
    processUptimeMs: Date.now() - STARTED_AT,
    memoryMb: Math.round((memory.heapUsed / 1048576) * 10) / 10,
    memoryTotalMb: Math.round((memory.rss / 1048576) * 10) / 10,
    giveaways: giveawayService.listActive().length,
    giveawaysTotal: giveawayService.total(),
    panels: panelService.total(),
    panelRoles: panelService.totalRoles(),
    cases: caseService.total(),
    database: db.stats(),
    guildsConfigured: guildService.count(),
    keepAlive: {
      endpoint: '/health',
      recommendedIntervalMinutes: interval > 0 ? interval : 14,
      note: 'Ajoutez https://VOTRE-SERVICE.onrender.com/health dans UptimeRobot (monitor HTTP, toutes les 5 min).',
    },
    scheduler: refs.scheduler?.status() ?? [],
  };
}

/** Serveur HTTP : health-check UptimeRobot, API JSON et tableau de bord. */
export function createWebServer(refs: WebServerRefs): http.Server {
  const server = http.createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const route = url.pathname.replace(/\/+$/, '') || '/';
    const method = (request.method ?? 'GET').toUpperCase();

    // En-têtes autorisant l'intégration en iframe (aperçu Arena / embeds externes).
    response.setHeader('x-content-type-options', 'nosniff');

    if (method !== 'GET' && method !== 'HEAD') {
      // Les services de ping (UptimeRobot, Better Stack…) n'utilisent que GET/HEAD,
      // mais on tolère un POST de réveil.
      if (route === '/ping' || route === '/keepalive') {
        json(response, 200, { ok: true, message: 'pong' });
        return;
      }
      json(response, 405, { error: 'Méthode non autorisée' });
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

      case '/api/stats':
      case '/stats': {
        json(response, 200, collectStats(refs));
        return;
      }

      case '/metrics': {
        const stats = collectStats(refs);
        const lines = [
          '# HELP elysia_up Le bot est connecté à Discord (1) ou non (0).',
          '# TYPE elysia_up gauge',
          `elysia_up ${stats.ready ? 1 : 0}`,
          '# HELP elysia_uptime_seconds Durée de fonctionnement du bot.',
          '# TYPE elysia_uptime_seconds gauge',
          `elysia_uptime_seconds ${Math.floor((stats.uptimeMs ?? 0) / 1000)}`,
          '# HELP elysia_guilds Nombre de serveurs.',
          '# TYPE elysia_guilds gauge',
          `elysia_guilds ${stats.guildCount}`,
          '# HELP elysia_users Membres cumulés.',
          '# TYPE elysia_users gauge',
          `elysia_users ${stats.userCount}`,
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
          '# HELP elysia_memory_heap_mb Mémoire de tas utilisée (Mo).',
          '# TYPE elysia_memory_heap_mb gauge',
          `elysia_memory_heap_mb ${stats.memoryMb}`,
        ];
        text(response, 200, lines.join('\n') + '\n', 'text/plain; version=0.0.4; charset=utf-8');
        return;
      }

      case '/': {
        text(response, 200, renderDashboard(), 'text/html; charset=utf-8');
        return;
      }

      case '/favicon.ico': {
        // Favicon intégré en data-URI dans le HTML ; on évite juste un 404 bruyant.
        response.writeHead(204);
        response.end();
        return;
      }

      case '/robots.txt': {
        text(response, 200, 'User-agent: *\nDisallow: /\n');
        return;
      }

      default: {
        // Fichiers statiques optionnels (assets/images) — utile pour les bannières.
        if (route.startsWith('/assets/')) {
          const config = loadConfig();
          const target = path.join(process.cwd(), config.assetsDir, route.replace('/assets/', ''));
          try {
            const content = await readFile(target);
            const extension = path.extname(target).toLowerCase();
            const types: Record<string, string> = {
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.gif': 'image/gif',
              '.webp': 'image/webp',
              '.svg': 'image/svg+xml',
            };
            response.writeHead(200, {
              'content-type': types[extension] ?? 'application/octet-stream',
              'cache-control': 'public, max-age=3600',
              'content-length': content.byteLength,
            });
            response.end(content);
            return;
          } catch {
            json(response, 404, { error: 'Ressource introuvable' });
            return;
          }
        }
        json(response, 404, { error: 'Route inconnue', routes: ['/', '/health', '/api/stats', '/metrics', '/ping'] });
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
 * Démarre le serveur web. Sur Render, le port est fourni via `PORT` et l'accès
 * externe exige une écoute sur 0.0.0.0.
 */
export function startWebServer(refs: WebServerRefs): Promise<http.Server> {
  const config = loadConfig();
  return new Promise((resolve, reject) => {
    const server = createWebServer(refs);
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      log.success(`Serveur web à l'écoute sur http://${config.host}:${config.port} (health-check : /health)`);
      resolve(server);
    });
  });
}
