import type { Locale } from '../core/types';

/**
 * Petites traductions embarquées (fr par défaut, en en secours).
 * Les phrases longues vivent dans les commandes ; ici on garde l'essentiel
 * et les messages réutilisables.
 */
const MESSAGES = {
  fr: {
    'common.notConfigured': "Cette fonctionnalité n'est pas encore configurée sur ce serveur. Un administrateur peut lancer `/config voir`.",
    'common.noPermissionUser': 'Vous n’avez pas la permission requise : **{perms}**.',
    'common.noPermissionBot': "Il me manque la permission **{perms}** pour faire cela. Ajoutez-la dans les paramètres du serveur.",
    'common.botTooLow': 'Mon rôle est trop bas dans la hiérarchie : déplacez le rôle du bot **au-dessus** du rôle cible.',
    'common.userTooHigh': 'Vous ne pouvez pas sanctionner **{user}** : son rôle est supérieur ou égal au vôtre.',
    'common.notInGuild': 'Cette commande doit être utilisée sur un serveur (pas en message privé).',
    'common.ownerOnly': 'Cette commande est réservée aux propriétaires du bot.',
    'common.adminOnly': 'Cette commande est réservée aux administrateurs du serveur.',
    'common.cooldown': 'Doucement ! Réessayez dans **{seconds} s**.',
    'common.error': 'Une erreur est survenue.',
    'common.done': 'Action effectuée.',
    'common.cancelled': 'Action annulée.',
    'common.timeout': "Temps écoulé — l'action a été annulée.",
    'common.selfTarget': 'Vous ne pouvez pas vous cibler vous-même.',
    'common.botTarget': 'Vous ne pouvez pas cibler un bot pour cette action.',
    'common.reason': 'Aucune raison fournie',
    'common.dmFailed': '⚠️ Impossible d’envoyer un MP à cet utilisateur (messages privés fermés).',
    'common.unknownUser': 'Aucun utilisateur trouvé avec l’identifiant `{id}`.',
    'common.ignoredBots': 'Les bots sont ignorés par cette commande.',
    'giveaway.notFound': 'Aucun giveaway trouvé avec l’identifiant `{id}`.',
    'giveaway.alreadyEnded': 'Ce giveaway est déjà terminé.',
    'giveaway.ended': 'Giveaway terminé : {winners}',
    'giveaway.noEntries': 'Aucune participation valide : le giveaway a été terminé sans gagnant.',
    'giveaway.joined': 'Participation enregistrée pour **{prize}** ! Bonne chance 🍀',
    'giveaway.left': 'Vous avez retiré votre participation à **{prize}**.',
    'giveaway.requirementRole': 'Il vous faut le rôle {role} pour participer.',
    'giveaway.requirementAccount': 'Votre compte doit être créé depuis au moins {days} jour(s) pour participer.',
    'giveaway.requirementMember': 'Il faut être membre depuis au moins {days} jour(s) pour participer.',
    'giveaway.banned': 'Vous ne pouvez pas participer à ce giveaway.',
    'panel.requested': 'Panneau généré ✔',
    'panel.roleAdded': 'Le rôle {role} vous a été attribué ✅',
    'panel.roleRemoved': 'Le rôle {role} vous a été retiré ❌',
    'panel.notSelfAssignable': 'Ce rôle ne peut pas être attribué automatiquement.',
    'panel.roleHigher': 'Ce rôle est placé trop haut dans la hiérarchie, je ne peux pas l’attribuer.',
    'panel.exclusive': 'Le rôle {role} a remplacé votre sélection précédente.',
    'moderation.banned': '{user} a été banni. (raison : {reason})',
    'moderation.muted': '{user} a été réduit au silence pendant {duration}.',
    'moderation.warned': '{user} a reçu un avertissement ({count} au total).',
  },
  en: {
    'common.notConfigured': 'This feature is not configured on this server yet. An admin can run `/config view`.',
    'common.noPermissionUser': 'You are missing the required permission: **{perms}**.',
    'common.noPermissionBot': 'I am missing the **{perms}** permission to do that.',
    'common.botTooLow': 'My role is too low: move the bot role above the target role.',
    'common.userTooHigh': 'You cannot moderate **{user}**: their role is equal or higher than yours.',
    'common.notInGuild': 'This command must be used in a server.',
    'common.ownerOnly': 'This command is restricted to bot owners.',
    'common.adminOnly': 'This command is restricted to server administrators.',
    'common.cooldown': 'Slow down! Try again in **{seconds}s**.',
    'common.error': 'Something went wrong.',
    'common.done': 'Done.',
    'common.cancelled': 'Cancelled.',
    'common.timeout': 'Timed out — action cancelled.',
    'common.selfTarget': 'You cannot target yourself.',
    'common.botTarget': 'You cannot target a bot with this action.',
    'common.reason': 'No reason provided',
    'common.dmFailed': '⚠️ Could not DM this user (DMs closed).',
    'common.unknownUser': 'No user found for ID `{id}`.',
    'common.ignoredBots': 'Bots are ignored by this command.',
    'giveaway.notFound': 'No giveaway found with ID `{id}`.',
    'giveaway.alreadyEnded': 'This giveaway already ended.',
    'giveaway.ended': 'Giveaway ended: {winners}',
    'giveaway.noEntries': 'No valid entries: giveaway ended without a winner.',
    'giveaway.joined': 'You entered **{prize}**! Good luck 🍀',
    'giveaway.left': 'You left **{prize}**.',
    'giveaway.requirementRole': 'You need the {role} role to enter.',
    'giveaway.requirementAccount': 'Your account must be at least {days} day(s) old.',
    'giveaway.requirementMember': 'You must have been a member for at least {days} day(s).',
    'giveaway.banned': 'You cannot enter this giveaway.',
    'panel.requested': 'Panel generated ✔',
    'panel.roleAdded': 'You received {role} ✅',
    'panel.roleRemoved': 'Role {role} removed ❌',
    'panel.notSelfAssignable': 'This role cannot be self-assigned.',
    'panel.roleHigher': 'This role is too high in the hierarchy, I cannot assign it.',
    'panel.exclusive': '{role} replaced your previous selection.',
    'moderation.banned': '{user} was banned. (reason: {reason})',
    'moderation.muted': '{user} was muted for {duration}.',
    'moderation.warned': '{user} was warned ({count} total).',
  },
} as const;

export type MessageKey = keyof (typeof MESSAGES)['fr'];

export function translate(locale: Locale, key: MessageKey, variables: Record<string, string | number> = {}): string {
  const table = MESSAGES[locale] ?? MESSAGES.fr;
  const template = (table as Record<string, string>)[key] ?? (MESSAGES.fr as Record<string, string>)[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    variables[name] === undefined ? `{${name}}` : String(variables[name]),
  );
}

export function createTranslator(locale: Locale) {
  return (key: MessageKey, variables?: Record<string, string | number>) => translate(locale, key, variables);
}

export const SUPPORTED_LOCALES: Locale[] = ['fr', 'en'];
