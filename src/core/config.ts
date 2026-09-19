import 'dotenv/config';
import { z } from 'zod';

/**
 * Schéma de validation de l'environnement.
 * Toute variable mal formée provoque un arrêt immédiat avec un message clair,
 * plutôt qu'un crash obscur 5 minutes après le démarrage.
 */
const envSchema = z.object({
  DISCORD_TOKEN: z.string().optional(),
  CLIENT_ID: z.string().regex(/^\d{17,20}$/, 'CLIENT_ID doit être un identifiant Discord (17-20 chiffres)').optional(),
  DEV_GUILD_ID: z.string().regex(/^\d{17,20}$/, 'DEV_GUILD_ID doit être un identifiant Discord').optional(),
  OWNER_IDS: z.string().optional().default(''),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
  DEFAULT_LOCALE: z.enum(['fr', 'en']).default('fr'),
  SELF_PING_URL: z.string().url().optional().or(z.literal('')),
  SELF_PING_INTERVAL: z.coerce.number().int().min(0).max(60).default(14),
  DRY_RUN: z
    .string()
    .optional()
    .default('0')
    .transform((value) => ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())),
  NODE_ENV: z.string().default('development'),
});

export interface AppConfig {
  token: string | undefined;
  clientId: string | undefined;
  devGuildId: string | undefined;
  ownerIds: string[];
  port: number;
  host: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logFormat: 'pretty' | 'json';
  defaultLocale: 'fr' | 'en';
  selfPingUrl: string | undefined;
  selfPingInterval: number;
  dryRun: boolean;
  nodeEnv: string;
  dataDir: string;
  assetsDir: string;
}

let cached: AppConfig | undefined;

/** Charge, valide et met en cache la configuration applicative. */
export function loadConfig(): AppConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  • ${issue.path.join('.') || '(env)'} : ${issue.message}`).join('\n');
    // eslint-disable-next-line no-console
    console.error(`\n❌ Configuration invalide :\n${details}\n\nVérifiez votre fichier .env (modèle : .env.example).\n`);
    process.exit(1);
  }

  const env = parsed.data;
  const dryRun = env.DRY_RUN;

  if (!env.DISCORD_TOKEN && !dryRun) {
    // eslint-disable-next-line no-console
    console.error(
      [
        '',
        '❌  DISCORD_TOKEN manquant.',
        '',
        '  1. Créez une application sur https://discord.com/developers/applications',
        '  2. Onglet « Bot » → « Reset Token » → copiez la valeur',
        '  3. Collez-la dans votre fichier .env : DISCORD_TOKEN=...',
        '',
        '  💡 Pour tester le déploiement sans token : DRY_RUN=1 npm run preview',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  cached = {
    token: env.DISCORD_TOKEN,
    clientId: env.CLIENT_ID,
    devGuildId: env.DEV_GUILD_ID || undefined,
    ownerIds: env.OWNER_IDS.split(/[\s,;]+/).filter((id) => /^\d{17,20}$/.test(id)),
    port: env.PORT,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
    logFormat: env.LOG_FORMAT,
    defaultLocale: env.DEFAULT_LOCALE,
    selfPingUrl: env.SELF_PING_URL ? env.SELF_PING_URL : undefined,
    selfPingInterval: env.SELF_PING_INTERVAL,
    dryRun,
    nodeEnv: env.NODE_ENV,
    dataDir: 'data',
    assetsDir: 'assets',
  };

  return cached;
}

/** Réinitialise le cache (utile pour les tests). */
export function resetConfigCache(): void {
  cached = undefined;
}
