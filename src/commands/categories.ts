import type { CategoryMeta, CommandCategory } from '../core/types';

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'moderation',
    label: 'Modération',
    emoji: '🛡️',
    description: 'Bannissements, timeouts, avertissements, purges et verrouillage de salons.',
  },
  {
    id: 'giveaways',
    label: 'Giveaways',
    emoji: '🎁',
    description: 'Concours avec conditions de participation, tickets bonus et tirages relançables.',
  },
  {
    id: 'roles',
    label: 'Rôles & panneaux',
    emoji: '🎭',
    description: 'Panneaux de rôles avec boutons/menus, images d’illustration et embeds personnalisés.',
  },
  {
    id: 'community',
    label: 'Communauté & animation',
    emoji: '🎉',
    description: 'Sondages, suggestions, anniversaires, niveaux, comptes à rebours et tirages au sort.',
  },
  {
    id: 'config',
    label: 'Configuration',
    emoji: '🛠️',
    description: 'Logs, salons, rôles automatiques, seuils de sanctions et réglages du serveur.',
  },
  {
    id: 'utility',
    label: 'Utilitaires',
    emoji: '✨',
    description: 'Aide, statistiques du bot, invitations et outils du quotidien.',
  },
  {
    id: 'games',
    label: 'Mini-jeux',
    emoji: '🎮',
    description: 'Morpion, Puissance 4, quiz, pendu, Motus, démineur, 2048, blackjack, memory… avec classement.',
  },
  {
    id: 'fun',
    label: 'Divertissement',
    emoji: '🤪',
    description: 'Dés, boule magique, citations, blagues, duels et pile ou face.',
  },
  {
    id: 'owner',
    label: 'Propriétaire',
    emoji: '👑',
    description: 'Commandes réservées aux propriétaires du bot (maintenance, serveurs).',
  },
];

export function categoryMeta(category: CommandCategory): CategoryMeta {
  return CATEGORIES.find((entry) => entry.id === category) ?? CATEGORIES[CATEGORIES.length - 1];
}
