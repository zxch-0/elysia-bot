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
    log.warn('➜ Vérifiez DISCORD_TOKEN et CLIENT_ID, ou lancez `npm run deploy:commands`.');
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
  await shutdown('erreur fatale', 1);
});
