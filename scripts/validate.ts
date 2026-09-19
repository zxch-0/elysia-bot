/**
 * Vérification complète avant déploiement.
 *
 *   npm run validate
 *
 * Contrôle : version de Node, fichier .env, format du token, connexion à
 * l'API Discord, droits d'écriture, présence des dossiers de données et
 * affiche le lien d'invitation avec les bonnes permissions.
 */
import { existsSync, accessSync, constants, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/core/config';

interface CheckResult {
  label: string;
  ok: boolean;
  detail?: string;
  fatal?: boolean;
}

const results: CheckResult[] = [];
const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const DIM = '\u001b[90m';
const BOLD = '\u001b[1m';
const RESET = '\u001b[0m';

function check(label: string, ok: boolean, detail?: string, fatal = false): void {
  results.push({ label, ok, detail, fatal });
}

function readEnvFile(): Record<string, string> {
  const file = path.join(process.cwd(), '.env');
  if (!existsSync(file)) return {};
  const content = readFileSync(file, 'utf8');
  const entries: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) entries[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return entries;
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n${BOLD}🔍 Elysia — vérification avant déploiement${RESET}\n`);

  // 1. Version de Node
  const [major, minor] = process.versions.node.split('.').map(Number);
  const nodeOk = major > 20 || (major === 20 && minor >= 9);
  check(`Version de Node (${process.version} ≥ 20.9)`, nodeOk, nodeOk ? undefined : 'Discord.js 14 exige Node 20.9 ou plus récent', true);

  // 2. Fichier .env
  const envFile = existsSync(path.join(process.cwd(), '.env'));
  check('.env présent', envFile, envFile ? undefined : 'Copiez .env.example en .env : `cp .env.example .env`');

  const fileEnv = readEnvFile();
  const token = process.env.DISCORD_TOKEN || fileEnv.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID || fileEnv.CLIENT_ID;
  const devGuild = process.env.DEV_GUILD_ID || fileEnv.DEV_GUILD_ID;

  // 3. Token
  const tokenLooksReal = Boolean(token && token.length > 50 && !/collez|votre_token|xxx/i.test(token));
  check(
    'DISCORD_TOKEN renseigné',
    tokenLooksReal,
    tokenLooksReal
      ? `longueur ${token!.length} caractères`
      : 'Developer Portal → Bot → Reset Token, puis collez-le dans .env',
    true,
  );

  // 4. CLIENT_ID
  const clientIdOk = Boolean(clientId && /^\d{17,20}$/.test(clientId));
  check('CLIENT_ID valide', clientIdOk, clientIdOk ? undefined : 'Developer Portal → General Information → Application ID', true);

  // 5. Appel réel à l'API Discord (validation la plus fiable)
  if (tokenLooksReal) {
    try {
      const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bot ${token}` },
      });
      if (response.ok) {
        const data = (await response.json()) as { username: string; discriminator: string; id: string; bot: boolean };
        check(
          'Connexion à l’API Discord',
          true,
          `Bot : ${data.username}${data.discriminator !== '0' ? `#${data.discriminator}` : ''} (id ${data.id})`,
        );
        if (clientId && clientId !== data.id) {
          check('CLIENT_ID correspond au token', false, `Le token appartient à l’application ${data.id}, mais CLIENT_ID vaut ${clientId}`);
        } else {
          check('CLIENT_ID correspond au token', true);
        }
      } else {
        check('Connexion à l’API Discord', false, `HTTP ${response.status} — token invalide, révoqué ou mal copié`, true);
      }
    } catch (error) {
      check('Connexion à l’API Discord', false, `Impossible de joindre Discord : ${(error as Error).message} — vérifiez votre connexion réseau`);
    }
  }

  // 6. Serveur de développement (optionnel)
  check(
    'DEV_GUILD_ID (optionnel)',
    !devGuild || /^\d{17,20}$/.test(devGuild),
    devGuild ? 'Publication instantanée des commandes sur ce serveur' : 'Non défini : les commandes seront globales (jusqu’à 1 h de propagation)',
  );

  // 7. Droits d'écriture (base de données + images de panneaux)
  for (const directory of ['data', 'assets/panels']) {
    const target = path.join(process.cwd(), directory);
    try {
      if (!existsSync(target)) {
        const { mkdirSync } = await import('node:fs');
        mkdirSync(target, { recursive: true });
      }
      accessSync(target, constants.W_OK);
      check(`Dossier « ${directory} » accessible en écriture`, true);
    } catch (error) {
      check(`Dossier « ${directory} » accessible en écriture`, false, (error as Error).message);
    }
  }

  // 8. Configuration du projet
  const config = loadConfig();
  check('Configuration interne chargée', true, `locale=${config.defaultLocale} • port=${config.port} • dryRun=${config.dryRun ? 'oui' : 'non'}`);
  if (config.dryRun) {
    check('Mode DRY_RUN', true, 'DRY_RUN=1 : le bot ne se connectera pas à Discord (retirez-le pour la production)');
  }

  // ── Résumé ────────────────────────────────────────────────────────────────
  // eslint-disable-next-line no-console
  console.log('');
  for (const result of results) {
    const icon = result.ok ? `${GREEN}✔${RESET}` : result.fatal ? `${RED}✖${RESET}` : `${YELLOW}⚠${RESET}`;
    // eslint-disable-next-line no-console
    console.log(` ${icon} ${result.label}${result.detail ? `\n    ${DIM}${result.detail}${RESET}` : ''}`);
  }

  const fatal = results.filter((result) => !result.ok && result.fatal);
  const warnings = results.filter((result) => !result.ok && !result.fatal);

  // eslint-disable-next-line no-console
  console.log(
    `\n${BOLD}${fatal.length === 0 ? `${GREEN}Prêt à déployer !${RESET}` : `${RED}${fatal.length} point(s) bloquant(s) à corriger${RESET}`}` +
      `${warnings.length ? ` ${YELLOW}• ${warnings.length} avertissement(s)${RESET}` : ''}\n`,
  );

  if (clientId) {
    // eslint-disable-next-line no-console
    console.log(
      `${BOLD}Lien d’invitation du bot :${RESET}\n${DIM}https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands${RESET}\n`,
    );
  }

  process.exit(fatal.length > 0 ? 1 : 0);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`\n${RED}Vérification impossible :${RESET}`, error);
  process.exit(1);
});
