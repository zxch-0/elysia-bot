/**
 * Script de déploiement des slash-commands.
 *
 *   npm run deploy:commands           → publication globale (à chaud : DEV_GUILD_ID prioritaire)
 *   npm run deploy:commands -- --clear  → supprime puis republie tout
 *
 * Astuce : renseignez DEV_GUILD_ID dans .env pour une publication instantanée
 * pendant le développement (les commandes globales prennent jusqu'à 1 heure).
 */
import { loadConfig } from '../src/core/config';
import { logger } from '../src/core/logger';
import { createClient } from '../src/core/client';
import { loadCommands } from '../src/core/handlers/commandLoader';
import { publishCommands } from '../src/core/handlers/commandPublisher';
import { registerInteractionModules } from '../src/modules';

const log = logger.child('deploy');

async function main(): Promise<void> {
  const config = loadConfig();
  const clear = process.argv.includes('--clear');

  if (!config.token) {
    log.error('DISCORD_TOKEN manquant dans .env — impossible de publier les commandes.');
    process.exit(1);
  }

  const client = createClient();
  await loadCommands(client);
  registerInteractionModules(client);

  if (config.devGuildId) {
    log.info(`Publication sur le serveur de développement ${config.devGuildId} puis en global…`);
  } else {
    log.info('Publication globale (propagation jusqu’à 1 heure)…');
  }

  const count = await publishCommands(client, { clear });
  log.success(`${count} commande(s) publiée(s). Lancez le bot avec \`npm start\`.`);

  // Publication idempotente au démarrage du bot : pas besoin de relancer ce script.
  log.info('Rappel : le bot publie automatiquement ses commandes à chaque démarrage.');
  process.exit(0);
}

main().catch((error) => {
  log.error('Échec du déploiement des commandes', error as Error);
  process.exit(1);
});
