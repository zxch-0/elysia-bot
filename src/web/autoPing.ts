import { loadConfig } from '../core/config';
import { logger } from '../core/logger';

const log = logger.child('auto-ping');

/**
 * Auto-ping interne : envoie une requête HTTP sur `SELF_PING_URL` toutes les
 * `SELF_PING_INTERVAL` minutes. Render met le service en veille après ~15 min
 * sans trafic entrant ; ce mécanisme complète UptimeRobot (ou le remplace si
 * vous n’avez pas de compte UptimeRobot).
 *
 * ⚠️ UptimeRobot reste la solution recommandée : il génère du trafic *externe*,
 * seul type de trafic qui empêche réellement la mise en veille.
 */
export function startAutoPing(): void {
  const config = loadConfig();
  if (!config.selfPingUrl || config.selfPingInterval <= 0) {
    log.debug('Auto-ping désactivé (SELF_PING_URL ou SELF_PING_INTERVAL non défini)');
    return;
  }

  const intervalMs = config.selfPingInterval * 60_000;

  const ping = async (): Promise<void> => {
    try {
      const started = Date.now();
      const response = await fetch(`${config.selfPingUrl!.replace(/\/$/, '')}/health`, {
        method: 'GET',
        headers: { 'user-agent': 'Elysia-SelfPing/1.0' },
      });
      log.debug(`Auto-ping ${config.selfPingUrl} → ${response.status} (${Date.now() - started} ms)`);
    } catch (error) {
      log.debug(`Auto-ping échoué : ${(error as Error).message}`);
    }
  };

  const timer = setInterval(() => void ping(), intervalMs);
  timer.unref?.();
  setTimeout(() => void ping(), 30_000).unref?.();

  log.success(`Auto-ping activé toutes les ${config.selfPingInterval} min → ${config.selfPingUrl}/health`);
}
