import http from 'node:http';
import { loadConfig } from './core/config';
import { logger } from './core/logger';
import { db } from './core/database';
import { createClient, type ElysiaClient } from './core/client';
import { loadCommands } from './core/handlers/commandLoader';
import { publishCommands } from './core/handlers/commandPublisher';
import { registerInteractionModules } from './modules';
import { registerEvents } from './events';
import { SchedulerService } from './services/schedulerService';
import { startWebServer } from './web/server';
import { startAutoPing } from './web/autoPing';
import { runDryRunDemo } from './web/dryRun';

const log = logger.child('main');

const BANNER = String.raw`
   ______ __            __
  / ____// /__  __ ___ / /_  __ __ ___
 / __/  / // / / // _ \/ __/ / // /(_-<
/____/ /_/ \_, / \___/\__/  \_,_//___/     💜  Discord all-in-one
          /___/          modération • giveaways • rôles
`;

let client: ElysiaClient | undefined;
let scheduler: SchedulerService | undefined;
let webServer: http.Server | undefined;
let stopping = false;

/** Arrêt propre : sauvegarde des données, fermeture du serveur web et de Discord. */
async function shutdown(reason: string, code = 0): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.warn(`Arrêt en cours (${reason})…`);

  try {
    scheduler?.stop();
    await db.flushAll();
    log.info('Données sauvegardées.');
  } catch (error) {
    log.error('Sauvegarde des données impossible', error as Error);
  }

  await new Promise<void>((resolve) => {
    if (!webServer) return resolve();
    webServer.close(() => resolve());
    setTimeout(resolve, 3_000).unref?.();
  });

  try {
    await client?.destroy();
  } catch {
    /* ignore */
  }

  log.success('Elysia est arrêtée proprement. À bientôt !');
  process.exit(code);
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(BANNER);

  const config = loadConfig();
  log.info(`Démarrage — environnement : ${config.nodeEnv} • dry-run : ${config.dryRun ? 'oui' : 'non'}`);

  // 1. Base de données JSON persistante
  await db.init();

  // 2. Client Discord + commandes + modules + événements
  client = createClient();
  await loadCommands(client);
  registerInteractionModules(client);

  // 3. Serveur web (health-check UptimeRobot + tableau de bord)
  webServer = await startWebServer({ client, scheduler: undefined });
  startAutoPing();

  if (config.dryRun) {
    // Mode démonstration : aucune connexion Discord, idéal pour valider un déploiement.
    await runDryRunDemo();
    log.warn('Mode DRY_RUN actif : le bot ne se connecte pas à Discord (retirez DRY_RUN pour l’activer).');
    return;
  }

  // 4. Publication automatique des commandes (globale, ou instantanée si DEV_GUILD_ID)
  try {
    await publishCommands(client);
  } catch (error) {
    log.error('Publication des commandes impossible (le bot démarre quand même)', error as Error);
    log.warn('➜ Vérifiez DISCORD_TOKEN, ainsi que CLIENT_ID (l’Application ID de la MÊME application que le token).');
  }

  // 5. Connexion à Discord
  registerEvents(client, () => {
    // Une fois connecté : planificateur + référence mise à jour pour le tableau de bord.
    scheduler = new SchedulerService(client!);
    scheduler.start();
    (client as unknown as { scheduler?: SchedulerService }).scheduler = scheduler;
  });

  await client.login(config.token);
}

/**
 * Traduit une erreur de démarrage en pistes concrètes.
 * Les erreurs de connexion Discord sont de simples `Error("Used disallowed
 * intents")`, `Error("Authentication failed")`… peu explicites sans contexte.
 */
function startupHints(error: unknown): string[] {
  const err = error as { message?: string; code?: string | number };
  const message = `${err.message ?? ''}`.toLowerCase();
  const details = `${err.message ?? ''} ${err.code ?? ''}`.toLowerCase();
  const hints: string[] = [];

  if (message.includes('disallowed intents')) {
    hints.push(
      '➜ Cause : intents privilégiés désactivés. Developer Portal → votre application → Bot → Privileged Gateway Intents :',
      '   activez SERVER MEMBERS INTENT et MESSAGE CONTENT INTENT, « Save Changes », puis redéployez.',
    );
  }
  if (message.includes('authentication failed') || message.includes('invalid token') || err.code === 'TokenInvalid') {
    hints.push(
      '➜ Cause : token invalide. Developer Portal → Bot → Reset Token, puis mettez à jour DISCORD_TOKEN',
      '   (sans guillemets, sans espace, sur une seule ligne) et redéployez.',
    );
  }
  if (message.includes('sharding')) {
    hints.push('➜ Cause : plus de 2 500 serveurs — le sharding est requis (non géré par cette version).');
  }
  if (/(enotfound|etimedout|econnrefused|econnreset|fetch failed|network socket)/.test(details)) {
    hints.push('➜ Cause : discord.com injoignable depuis l’hébergeur (réseau/DNS). Relancez le déploiement.');
  }

  if (!hints.length) {
    hints.push('➜ Relancez avec LOG_LEVEL=debug pour la trace complète, et vérifiez DISCORD_TOKEN / CLIENT_ID.');
  }
  return hints;
}

// ── Gestion des signaux et des erreurs non capturées ─────────────────────────
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => log.error('Promesse rejetée non gérée', reason as Error));
process.on('uncaughtException', (error) => {
  log.error('Exception non capturée', error);
  // On ne quitte pas : le serveur web doit rester en vie pour UptimeRobot.
});

main().catch(async (error) => {
  log.error('Démarrage impossible', error as Error);
  for (const hint of startupHints(error)) log.error(hint);
  await shutdown('erreur fatale', 1);
});
