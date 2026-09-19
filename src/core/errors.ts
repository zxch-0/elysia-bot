import { DiscordAPIError, HTTPError } from 'discord.js';

/**
 * Erreur « métier » : son message est destiné à l'utilisateur final.
 * Toute autre erreur est loguée en interne et remplacée par un message générique.
 */
export class BotError extends Error {
  public readonly userMessage: string;
  public readonly ephemeral: boolean;

  constructor(userMessage: string, options: { internal?: string; ephemeral?: boolean } = {}) {
    super(options.internal ?? userMessage);
    this.name = 'BotError';
    this.userMessage = userMessage;
    this.ephemeral = options.ephemeral ?? true;
  }
}

export class PermissionError extends BotError {
  constructor(message: string) {
    super(message, { internal: message });
    this.name = 'PermissionError';
  }
}

export class UsageError extends BotError {
  constructor(message: string) {
    super(message, { internal: message });
    this.name = 'UsageError';
  }
}

export class NotFoundError extends BotError {
  constructor(message: string) {
    super(message, { internal: message });
    this.name = 'NotFoundError';
  }
}

/** Codes d'erreur Discord les plus fréquents → message compréhensible. */
const DISCORD_ERROR_MESSAGES: Record<number, string> = {
  50001: "Je n'ai pas accès à ce salon ou à cette ressource. Vérifiez les permissions du bot.",
  50013: "Il me manque des permissions pour effectuer cette action (rôle du bot trop bas ou permission manquante).",
  50035: "La requête envoyée à Discord est invalide (souvent : image trop lourde ou option mal formée).",
  10003: "Ce salon n'existe plus.",
  10007: "Ce membre a quitté le serveur.",
  10008: "Ce message n'existe plus.",
  10013: "Utilisateur inconnu : cet identifiant ne correspond à aucun compte Discord.",
  10014: "Application inconnue.",
  10026: "Ce bot ne peut pas être banni.",
  30005: "Nombre maximum de rôles atteint sur ce serveur.",
  30010: "Nombre maximum de salons atteint sur ce serveur.",
  30013: "Nombre maximum d'émojis atteint sur ce serveur.",
  40007: "Ce salon n'est pas accessible au bot.",
  50028: 'Timeout Discord trop long : la durée maximale est de 28 jours.',
};

/** Transforme n'importe quelle erreur en message utilisateur lisible. */
export function toUserMessage(error: unknown): string {
  if (error instanceof BotError) return error.userMessage;

  if (error instanceof DiscordAPIError) {
    const mapped = DISCORD_ERROR_MESSAGES[Number(error.code)];
    if (mapped) return mapped;
    return `Discord a refusé l'action (code ${error.code}).`;
  }

  if (error instanceof HTTPError) {
    return "Discord n'a pas répondu correctement, réessayez dans quelques secondes.";
  }

  if (error instanceof Error) {
    if (/Unknown interaction|interaction has already been acknowledged/i.test(error.message)) {
      return "L'interaction a expiré (plus de 3 secondes). Relancez la commande.";
    }
    if (/Missing Permissions/i.test(error.message)) {
      return "Il me manque les permissions nécessaires pour cette action.";
    }
    if (/Missing Access/i.test(error.message)) {
      return "Je n'ai pas accès à ce salon ou à cette ressource.";
    }
    if (/rate limit/i.test(error.message)) {
      return 'Discord limite temporairement les requêtes, réessayez dans un instant.';
    }
  }

  return "Une erreur inattendue s'est produite. L'équipe technique a été prévenue dans les logs.";
}

/** Vrai si l'erreur peut être ignorée silencieusement (interaction déjà répondue, DM fermés…). */
export function isIgnorableError(error: unknown): boolean {
  if (error instanceof DiscordAPIError) {
    return [10013, 10062, 40060, 50007].includes(Number(error.code));
  }
  if (error instanceof Error) {
    return /Unknown interaction|Unknown Message|already been acknowledged|Cannot send messages to this user/i.test(error.message);
  }
  return false;
}
