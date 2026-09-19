import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { ElysiaClient } from '../client';
import type { Command } from '../types';
import { logger } from '../logger';

const log = logger.child('loader');

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(ts|js|cjs|mjs)$/.test(entry) && !entry.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

// `require` fonctionne à la fois sous tsx (fichiers .ts) et sur le build compilé (.js).
const nodeRequire = createRequire(__filename);
// Import dynamique réel (non transformé en require par TypeScript en sortie CommonJS).
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<{ default?: Command; command?: Command }>;

/** Charge dynamiquement une commande (compatible tsx et JavaScript compilé). */
async function importCommand(file: string): Promise<Command | undefined> {
  let loaded: { default?: Command; command?: Command } | undefined;

  try {
    loaded = nodeRequire(file) as { default?: Command; command?: Command };
  } catch (error) {
    // Fichiers ESM purs ou contexte exotique : on bascule sur l'import dynamique.
    if ((error as NodeJS.ErrnoException).code !== 'ERR_REQUIRE_ESM') throw error;
    loaded = await dynamicImport(pathToFileURL(file).href);
  }

  return loaded?.default ?? loaded?.command;
}

/**
 * Parcourt `src/commands/**` et enregistre chaque commande exportée par défaut.
 * Les erreurs d'un fichier n'empêchent pas le chargement des autres.
 */
export async function loadCommands(client: ElysiaClient): Promise<number> {
  const baseDir = __dirname.includes(`${path.sep}dist${path.sep}`)
    ? path.join(__dirname, '..', '..', 'commands')
    : path.join(__dirname, '..', '..', 'commands');

  const files = walk(baseDir).filter((file) => !/index\.(ts|js)$/.test(file));
  let loaded = 0;

  for (const file of files) {
    try {
      const command = await importCommand(file);
      if (!command?.data?.name || typeof command.run !== 'function') {
        log.debug(`Fichier ignoré (pas une commande) : ${path.relative(baseDir, file)}`);
        continue;
      }
      if (!command.category) command.category = 'utility';
      client.registerCommand(command);
      loaded += 1;
    } catch (error) {
      log.error(`Chargement impossible : ${path.relative(baseDir, file)}`, error as Error);
    }
  }

  log.success(`${loaded} commande(s) chargée(s) depuis ${path.relative(process.cwd(), baseDir)}`);
  return loaded;
}
