/**
 * Contenus des commandes de divertissement (`/citation`, `/blague`, `/8ball`).
 * Tout est embarqué dans le bot : aucune requête externe, aucun coût d'API.
 */

export interface Quote {
  text: string;
  author: string;
  theme: QuoteTheme;
}

export type QuoteTheme = 'motivation' | 'sagesse' | 'amitie' | 'code' | 'absurde';

export const QUOTE_THEMES: Record<QuoteTheme, { label: string; emoji: string }> = {
  motivation: { label: 'Motivation', emoji: '🔥' },
  sagesse: { label: 'Sagesse', emoji: '🦉' },
  amitie: { label: 'Amitié', emoji: '🤝' },
  code: { label: 'Développement', emoji: '💻' },
  absurde: { label: 'Absurde', emoji: '🤪' },
};

export const QUOTES: Quote[] = [
  { text: 'Le succès, c’est tomber sept fois et se relever huit.', author: 'Proverbe japonais', theme: 'motivation' },
  { text: 'Ils ne savaient pas que c’était impossible, alors ils l’ont fait.', author: 'Mark Twain', theme: 'motivation' },
  { text: 'La meilleure façon de prédire l’avenir, c’est de le créer.', author: 'Peter Drucker', theme: 'motivation' },
  { text: 'Un jour ou jour un : choisis ton camp.', author: 'Inconnu', theme: 'motivation' },
  { text: 'Le talent gagne des matchs, mais le travail d’équipe gagne des championnats.', author: 'Michael Jordan', theme: 'motivation' },
  { text: 'Commence là où tu es, avec ce que tu as.', author: 'Arthur Ashe', theme: 'motivation' },
  { text: 'La discipline est le pont entre les objectifs et les accomplissements.', author: 'Jim Rohn', theme: 'motivation' },
  { text: 'Ce n’est pas parce que les choses sont difficiles que nous n’osons pas, c’est parce que nous n’osons pas qu’elles sont difficiles.', author: 'Sénèque', theme: 'sagesse' },
  { text: 'Connais-toi toi-même.', author: 'Socrate', theme: 'sagesse' },
  { text: 'La simplicité est la sophistication suprême.', author: 'Léonard de Vinci', theme: 'sagesse' },
  { text: 'On ne voit bien qu’avec le cœur, l’essentiel est invisible pour les yeux.', author: 'Antoine de Saint-Exupéry', theme: 'sagesse' },
  { text: 'Le doute est le commencement de la sagesse.', author: 'Aristote', theme: 'sagesse' },
  { text: 'Rien n’est permanent, sauf le changement.', author: 'Héraclite', theme: 'sagesse' },
  { text: 'Une amitié qui finit n’a jamais vraiment commencé.', author: 'Proverbe', theme: 'amitie' },
  { text: 'Un ami, c’est quelqu’un qui te connaît et qui t’aime quand même.', author: 'Inconnu', theme: 'amitie' },
  { text: 'Les vrais amis sont ceux qui restent quand tout le monde part.', author: 'Inconnu', theme: 'amitie' },
  { text: 'Marcher avec un ami dans le noir vaut mieux que marcher seul dans la lumière.', author: 'Helen Keller', theme: 'amitie' },
  { text: 'Le code est comme l’humour : si on doit l’expliquer, c’est qu’il est mauvais.', author: 'Cory House', theme: 'code' },
  { text: 'Ça marche sur ma machine.', author: 'Tout développeur, un jour', theme: 'code' },
  { text: 'Il n’y a que deux problèmes difficiles en informatique : l’invalidation de cache, nommer les choses et les erreurs d’unité.', author: 'Phil Karlton', theme: 'code' },
  { text: 'Faites simple, mais pas simpliste.', author: 'Alan Kay', theme: 'code' },
  { text: 'Le meilleur code est celui qu’on n’a pas besoin d’écrire.', author: 'Inconnu', theme: 'code' },
  { text: 'Déployer le vendredi, c’est comme parachuter un chat : techniquement possible, mais pourquoi ?', author: 'Loi non écrite du DevOps', theme: 'code' },
  { text: 'Je ne suis pas en retard, je suis en exploration temporelle.', author: 'Inconnu', theme: 'absurde' },
  { text: 'Le café est un langage de programmation à part entière.', author: 'Inconnu', theme: 'absurde' },
  { text: 'Les licornes existent : elles s’appellent « je finirai demain ».', author: 'Inconnu', theme: 'absurde' },
  { text: 'Si rien ne va, il reste toujours le bouton ' + '« redémarrer ».', author: 'Inconnu', theme: 'absurde' },
  { text: 'Un chat n’obéit pas : il négocie.', author: 'Inconnu', theme: 'absurde' },
];

export interface Joke {
  setup: string;
  punchline: string;
  category: JokeCategory;
}

export type JokeCategory = 'dev' | 'animaux' | 'absurde' | 'science' | 'papa';

export const JOKE_CATEGORIES: Record<JokeCategory, { label: string; emoji: string }> = {
  dev: { label: 'Développeurs', emoji: '💻' },
  animaux: { label: 'Animaux', emoji: '🐾' },
  absurde: { label: 'Absurde', emoji: '🤪' },
  science: { label: 'Sciences', emoji: '🔬' },
  papa: { label: 'Blagues de papa', emoji: '👨' },
};

export const JOKES: Joke[] = [
  { setup: 'Pourquoi les développeurs confondent-ils Halloween et Noël ?', punchline: 'Parce que OCT 31 == DEC 25.', category: 'dev' },
  { setup: 'Combien faut-il de développeurs pour changer une ampoule ?', punchline: 'Aucun, c’est un problème matériel.', category: 'dev' },
  { setup: 'Pourquoi le développeur est-il toujours fauché ?', punchline: 'Parce qu’il met tout en `float` et perd la précision.', category: 'dev' },
  { setup: 'Que dit un développeur qui part en vacances ?', punchline: '« Je reviens dans un commit et demi. »', category: 'dev' },
  { setup: 'Quelle est la différence entre un débutant et un expert ?', punchline: 'Le débutant pense que ça marche, l’expert sait pourquoi ça ne marche pas.', category: 'dev' },
  { setup: 'Un bug entre dans un bar et commande une bière.', punchline: 'Le barman lui répond : « Désolé, on ne sert pas les errances. »', category: 'dev' },
  { setup: 'Pourquoi les ours polaires ne jouent-ils jamais à cache-cache ?', punchline: 'Parce qu’ils se repèrent toujours aux pôles.', category: 'animaux' },
  { setup: 'Comment appelle-t-on un chat qui va chez le vétérinaire ?', punchline: 'Un chat-thérapie.', category: 'animaux' },
  { setup: 'Pourquoi les abeilles ont-elles de bonnes notes à l’école ?', punchline: 'Parce qu’elles savent parfaitement butiner leurs leçons.', category: 'animaux' },
  { setup: 'Que fait un kangourou sur un ordinateur ?', punchline: 'Il saute la souris.', category: 'animaux' },
  { setup: 'Pourquoi les oiseaux volent-ils vers le sud en hiver ?', punchline: 'Parce que c’est trop loin pour y aller à pied.', category: 'animaux' },
  { setup: 'Quel est le comble pour un électricien ?', punchline: 'De ne pas être au courant.', category: 'absurde' },
  { setup: 'Si un livre se ferme tout seul :', punchline: 'c’est qu’il a une histoire à oublier.', category: 'absurde' },
  { setup: 'Pourquoi les fantômes sont-ils de mauvais menteurs ?', punchline: 'Parce qu’on voit à travers eux.', category: 'absurde' },
  { setup: 'Qu’est-ce qui est pire qu’un clown ?', punchline: 'Deux clowns.', category: 'absurde' },
  { setup: 'Un mathématicien, un physicien et un ingénieur jouent à un jeu.', punchline: 'L’ingénieur gagne : il a arrondi les règles.', category: 'science' },
  { setup: 'Pourquoi les atomes sont-ils toujours détendus ?', punchline: 'Parce qu’ils se baladent avec des électrons libres.', category: 'science' },
  { setup: 'Que dit l’eau à l’acide ?', punchline: '« T’as pas l’air très stable aujourd’hui. »', category: 'science' },
  { setup: 'Pourquoi la biologie n’aime-t-elle pas la chimie ?', punchline: 'Parce qu’elle la trouve réactionnaire.', category: 'science' },
  { setup: 'Quelle est la température idéale pour une pizza ?', punchline: 'Un degré : quand elle sort du four, tu prends un degré dans la bouche.', category: 'papa' },
  { setup: 'Pourquoi les plongeurs plongent-ils en arrière ?', punchline: 'Parce que s’ils plongeaient en avant, ils tomberaient dans le bateau.', category: 'papa' },
  { setup: 'Comment appelle-t-on un chien magicien ?', punchline: 'Un labra-cadabra-dor.', category: 'papa' },
  { setup: 'Pourquoi le livre de maths est-il triste ?', punchline: 'Parce qu’il a trop de problèmes.', category: 'papa' },
  { setup: 'Que dit-on à un mur qui s’effondre ?', punchline: '« Tiens, tiens, tiens… »', category: 'papa' },
];

export interface BallAnswer {
  text: string;
  mood: 'positif' | 'neutre' | 'negatif';
}

export const BALL_ANSWERS: BallAnswer[] = [
  { text: 'Absolument, fonce !', mood: 'positif' },
  { text: 'C’est certain.', mood: 'positif' },
  { text: 'Sans aucun doute.', mood: 'positif' },
  { text: 'Oui, le timing est parfait.', mood: 'positif' },
  { text: 'Les astres sont alignés : oui.', mood: 'positif' },
  { text: 'Compte là-dessus, oui !', mood: 'positif' },
  { text: 'Probablement, à toi de confirmer.', mood: 'neutre' },
  { text: 'Peut-être… demande encore demain.', mood: 'neutre' },
  { text: 'La réponse est floue, comme mon cache.', mood: 'neutre' },
  { text: 'C’est possible, mais prépare un plan B.', mood: 'neutre' },
  { text: 'Je vois une hésitation : creuse encore.', mood: 'neutre' },
  { text: 'Non, pas maintenant.', mood: 'negatif' },
  { text: 'Mes sources disent non.', mood: 'negatif' },
  { text: 'Définitivement non.', mood: 'negatif' },
  { text: 'Nope. Essaie autre chose.', mood: 'negatif' },
  { text: 'Le destin dit : vraiment pas.', mood: 'negatif' },
];

/** Choisit un élément aléatoire avec un aléa déterministe (testable). */
export function pickFrom<T>(items: readonly T[], randomValue = Math.random()): T {
  return items[Math.min(Math.floor(randomValue * items.length), items.length - 1)];
}
