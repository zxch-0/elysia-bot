/**
 * Banque de questions du quiz (français). La première réponse de chaque
 * entrée est la bonne ; le moteur mélange les propositions à l'affichage.
 */

export type QuizTheme = 'culture' | 'geographie' | 'histoire' | 'sciences' | 'popculture' | 'sport' | 'langue';

export const QUIZ_THEMES: Record<QuizTheme, { label: string; emoji: string }> = {
  culture: { label: 'Culture générale', emoji: '🎓' },
  geographie: { label: 'Géographie', emoji: '🗺️' },
  histoire: { label: 'Histoire', emoji: '🏛️' },
  sciences: { label: 'Sciences', emoji: '🔬' },
  popculture: { label: 'Pop culture & jeux vidéo', emoji: '🎬' },
  sport: { label: 'Sport', emoji: '⚽' },
  langue: { label: 'Langue française & littérature', emoji: '📚' },
};

export interface QuizQuestion {
  theme: QuizTheme;
  /** 1 = facile, 2 = normal, 3 = difficile. */
  difficulty: 1 | 2 | 3;
  question: string;
  /** Quatre propositions : `answers[0]` est la bonne réponse. */
  answers: readonly [string, string, string, string];
}

function q(theme: QuizTheme, difficulty: 1 | 2 | 3, question: string, correct: string, wrong1: string, wrong2: string, wrong3: string): QuizQuestion {
  return { theme, difficulty, question, answers: [correct, wrong1, wrong2, wrong3] };
}

export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  // ── Géographie ──────────────────────────────────────────────────────────
  q('geographie', 1, 'Quelle est la capitale de l’Australie ?', 'Canberra', 'Sydney', 'Melbourne', 'Perth'),
  q('geographie', 1, 'Quel est le plus long fleuve de France ?', 'La Loire', 'La Seine', 'Le Rhône', 'La Garonne'),
  q('geographie', 2, 'Combien de pays partagent une frontière terrestre avec la France métropolitaine ?', '8', '6', '7', '9'),
  q('geographie', 1, 'Quel est le plus grand désert chaud du monde ?', 'Le Sahara', 'Le désert de Gobi', 'Le Kalahari', 'Le désert d’Atacama'),
  q('geographie', 1, 'Quelle est la capitale du Canada ?', 'Ottawa', 'Toronto', 'Montréal', 'Vancouver'),
  q('geographie', 2, 'Quel est le plus haut sommet d’Afrique ?', 'Le Kilimandjaro', 'Le mont Kenya', 'Le Ras Dashan', 'Le mont Cameroun'),
  q('geographie', 1, 'Dans quel pays se trouve la ville de Marrakech ?', 'Le Maroc', 'La Tunisie', 'L’Algérie', 'L’Égypte'),
  q('geographie', 1, 'Quel océan borde la côte ouest des États-Unis ?', 'L’océan Pacifique', 'L’océan Atlantique', 'L’océan Indien', 'L’océan Arctique'),
  q('geographie', 1, 'Quel est le plus petit pays du monde ?', 'Le Vatican', 'Monaco', 'Saint-Marin', 'Le Liechtenstein'),
  q('geographie', 2, 'Quelle est la capitale de la Nouvelle-Zélande ?', 'Wellington', 'Auckland', 'Christchurch', 'Queenstown'),
  q('geographie', 2, 'Quel fleuve traverse Vienne, Budapest et Belgrade ?', 'Le Danube', 'Le Rhin', 'L’Elbe', 'La Vistule'),
  q('geographie', 1, 'Quel est le plus grand pays d’Amérique du Sud par sa superficie ?', 'Le Brésil', 'L’Argentine', 'Le Pérou', 'La Colombie'),
  q('geographie', 2, 'Sur quel continent se trouve le lac Baïkal ?', 'L’Asie', 'L’Europe', 'L’Amérique du Nord', 'L’Afrique'),
  q('geographie', 1, 'Quelle mer sépare l’Europe de l’Afrique ?', 'La mer Méditerranée', 'La mer Noire', 'La mer Rouge', 'La mer Baltique'),
  q('geographie', 2, 'Quelle est la plus grande île du monde (hors Australie) ?', 'Le Groenland', 'Madagascar', 'Bornéo', 'La Nouvelle-Guinée'),
  q('geographie', 3, 'Quelle est la capitale de la Mongolie ?', 'Oulan-Bator', 'Astana', 'Bichkek', 'Tachkent'),

  // ── Histoire ────────────────────────────────────────────────────────────
  q('histoire', 1, 'En quelle année a eu lieu la prise de la Bastille ?', '1789', '1799', '1815', '1776'),
  q('histoire', 2, 'Qui fut le premier président de la Ve République française ?', 'Charles de Gaulle', 'Georges Pompidou', 'René Coty', 'Vincent Auriol'),
  q('histoire', 1, 'En quelle année l’Homme a-t-il marché sur la Lune pour la première fois ?', '1969', '1965', '1972', '1961'),
  q('histoire', 1, 'Quel empereur français a été exilé sur l’île de Sainte-Hélène ?', 'Napoléon Ier', 'Napoléon III', 'Charlemagne', 'Louis XVI'),
  q('histoire', 1, 'En quelle année le mur de Berlin est-il tombé ?', '1989', '1991', '1985', '1979'),
  q('histoire', 2, 'Quelle civilisation a construit le Machu Picchu ?', 'Les Incas', 'Les Aztèques', 'Les Mayas', 'Les Olmèques'),
  q('histoire', 1, 'Quel roi de France était surnommé le « Roi-Soleil » ?', 'Louis XIV', 'Louis XVI', 'François Ier', 'Henri IV'),
  q('histoire', 1, 'En quelle année a débuté la Première Guerre mondiale ?', '1914', '1918', '1912', '1939'),
  q('histoire', 2, 'Qui a peint le plafond de la chapelle Sixtine ?', 'Michel-Ange', 'Léonard de Vinci', 'Raphaël', 'Botticelli'),
  q('histoire', 1, 'Quel paquebot a fait naufrage en avril 1912 ?', 'Le Titanic', 'Le Lusitania', 'Le Britannic', 'Le Queen Mary'),
  q('histoire', 2, 'Quelle reine d’Égypte fut l’alliée de Jules César puis de Marc Antoine ?', 'Cléopâtre VII', 'Néfertiti', 'Hatchepsout', 'Néfertari'),
  q('histoire', 3, 'En quelle année les Françaises ont-elles voté pour la première fois ?', '1945', '1936', '1958', '1968'),
  q('histoire', 2, 'Qui a découvert la pénicilline en 1928 ?', 'Alexander Fleming', 'Louis Pasteur', 'Marie Curie', 'Robert Koch'),
  q('histoire', 1, 'Quelle bataille marque la défaite définitive de Napoléon en 1815 ?', 'Waterloo', 'Austerlitz', 'Trafalgar', 'Iéna'),
  q('histoire', 2, 'Quel navigateur a atteint les Amériques en 1492 ?', 'Christophe Colomb', 'Vasco de Gama', 'Magellan', 'Jacques Cartier'),
  q('histoire', 3, 'En quelle année le traité de Rome, fondateur de la CEE, a-t-il été signé ?', '1957', '1949', '1963', '1951'),

  // ── Sciences ────────────────────────────────────────────────────────────
  q('sciences', 1, 'Quel est le symbole chimique de l’or ?', 'Au', 'Ag', 'Or', 'Go'),
  q('sciences', 1, 'Combien de planètes compte le Système solaire ?', '8', '9', '7', '10'),
  q('sciences', 1, 'Quelle est la vitesse approximative de la lumière dans le vide ?', '300 000 km/s', '150 000 km/s', '3 000 km/s', '1 000 000 km/s'),
  q('sciences', 2, 'Quel organe produit l’insuline ?', 'Le pancréas', 'Le foie', 'Les reins', 'L’estomac'),
  q('sciences', 1, 'Quelle est la planète la plus proche du Soleil ?', 'Mercure', 'Vénus', 'Mars', 'La Terre'),
  q('sciences', 1, 'Quel gaz les plantes absorbent-elles pour la photosynthèse ?', 'Le dioxyde de carbone', 'L’oxygène', 'L’azote', 'L’hydrogène'),
  q('sciences', 2, 'Combien d’os compte le squelette d’un adulte humain ?', '206', '186', '226', '256'),
  q('sciences', 1, 'Quelle est la formule chimique de l’eau ?', 'H₂O', 'CO₂', 'O₂', 'H₂O₂'),
  q('sciences', 1, 'Quelle particule porte une charge électrique négative ?', 'L’électron', 'Le proton', 'Le neutron', 'Le photon'),
  q('sciences', 2, 'Quel est l’élément chimique le plus abondant dans l’Univers ?', 'L’hydrogène', 'L’hélium', 'L’oxygène', 'Le carbone'),
  q('sciences', 1, 'À quelle température l’eau bout-elle au niveau de la mer ?', '100 °C', '90 °C', '110 °C', '120 °C'),
  q('sciences', 1, 'Quel scientifique a formulé la théorie de la relativité générale ?', 'Albert Einstein', 'Isaac Newton', 'Niels Bohr', 'Galilée'),
  q('sciences', 1, 'Quelle est la plus grande planète du Système solaire ?', 'Jupiter', 'Saturne', 'Neptune', 'Uranus'),
  q('sciences', 2, 'Combien de chromosomes possède une cellule humaine (hors gamètes) ?', '46', '23', '48', '44'),
  q('sciences', 2, 'Quelle unité mesure la fréquence ?', 'Le hertz', 'Le watt', 'Le volt', 'Le joule'),
  q('sciences', 2, 'Quel métal est liquide à température ambiante ?', 'Le mercure', 'Le plomb', 'L’étain', 'Le zinc'),
  q('sciences', 3, 'Quel est le nom de la plus petite unité du vivant ?', 'La cellule', 'L’atome', 'La molécule', 'Le gène'),
  q('sciences', 3, 'Quelle planète possède les anneaux les plus visibles ?', 'Saturne', 'Jupiter', 'Uranus', 'Neptune'),

  // ── Culture générale ────────────────────────────────────────────────────
  q('culture', 1, 'Combien de côtés possède un hexagone ?', '6', '5', '7', '8'),
  q('culture', 1, 'Quelle est la monnaie du Japon ?', 'Le yen', 'Le won', 'Le yuan', 'Le baht'),
  q('culture', 2, 'Combien de touches possède un piano standard ?', '88', '76', '96', '64'),
  q('culture', 1, 'Qui a écrit « Les Misérables » ?', 'Victor Hugo', 'Émile Zola', 'Gustave Flaubert', 'Honoré de Balzac'),
  q('culture', 2, 'Quelle est la langue comptant le plus de locuteurs natifs au monde ?', 'Le mandarin', 'L’anglais', 'L’espagnol', 'L’hindi'),
  q('culture', 1, 'Combien de cordes possède une guitare classique ?', '6', '4', '5', '7'),
  q('culture', 1, 'Quel peintre a réalisé « La Joconde » ?', 'Léonard de Vinci', 'Michel-Ange', 'Raphaël', 'Vermeer'),
  q('culture', 1, 'Quel est le plus grand animal terrestre actuel ?', 'L’éléphant d’Afrique', 'Le rhinocéros blanc', 'L’hippopotame', 'La girafe'),
  q('culture', 2, 'Quel instrument mesure la pression atmosphérique ?', 'Le baromètre', 'Le thermomètre', 'L’hygromètre', 'L’anémomètre'),
  q('culture', 1, 'Combien de pièces compte un jeu d’échecs (les deux camps réunis) ?', '32', '16', '24', '64'),
  q('culture', 2, 'Quelle est la plus grande ville de Suisse ?', 'Zurich', 'Genève', 'Berne', 'Bâle'),
  q('culture', 1, 'Quel animal figure sur le logo de Ferrari ?', 'Un cheval cabré', 'Un taureau', 'Un lion', 'Un aigle'),
  q('culture', 1, 'Combien de jours compte une année bissextile ?', '366', '365', '364', '367'),
  q('culture', 1, 'Combien de couleurs compte l’arc-en-ciel selon la convention classique ?', '7', '6', '8', '5'),
  q('culture', 2, 'Qui est l’inventeur du World Wide Web ?', 'Tim Berners-Lee', 'Bill Gates', 'Steve Jobs', 'Linus Torvalds'),
  q('culture', 3, 'Quelle entreprise a créé le langage de programmation Java ?', 'Sun Microsystems', 'Microsoft', 'Apple', 'IBM'),
  q('culture', 2, 'Combien de faces possède un dé classique ?', '6', '8', '12', '4'),
  q('culture', 3, 'Quel est le nom du système d’écriture utilisé par les aveugles ?', 'Le braille', 'Le morse', 'Le cunéiforme', 'Le sténo'),

  // ── Pop culture & jeux vidéo ────────────────────────────────────────────
  q('popculture', 1, 'Quelle entreprise japonaise a créé Mario ?', 'Nintendo', 'Sega', 'Sony', 'Capcom'),
  q('popculture', 1, 'Dans « Star Wars », qui est le père de Luke Skywalker ?', 'Dark Vador', 'Obi-Wan Kenobi', 'Yoda', 'L’Empereur Palpatine'),
  q('popculture', 1, 'Quel jeu vidéo se déroule dans un monde de blocs à miner et à construire ?', 'Minecraft', 'Terraria', 'Roblox', 'Fortnite'),
  q('popculture', 1, 'Qui incarne Jack Dawson dans « Titanic » (1997) ?', 'Leonardo DiCaprio', 'Brad Pitt', 'Matt Damon', 'Johnny Depp'),
  q('popculture', 1, 'Comment s’appelle le hérisson bleu de Sega ?', 'Sonic', 'Tails', 'Knuckles', 'Shadow'),
  q('popculture', 2, 'Combien de Pokémon comptait la première génération ?', '151', '150', '100', '251'),
  q('popculture', 2, 'Quel réalisateur a signé « Inception » et « Interstellar » ?', 'Christopher Nolan', 'Steven Spielberg', 'James Cameron', 'Ridley Scott'),
  q('popculture', 1, 'Quel personnage est le héros de la série « The Legend of Zelda » ?', 'Link', 'Zelda', 'Ganon', 'Epona'),
  q('popculture', 1, 'Quel groupe britannique a chanté « Bohemian Rhapsody » ?', 'Queen', 'The Beatles', 'The Rolling Stones', 'Pink Floyd'),
  q('popculture', 1, 'Comment s’appelle le meilleur ami roux de Harry Potter ?', 'Ron Weasley', 'Neville Londubat', 'Drago Malefoy', 'Cedric Diggory'),
  q('popculture', 1, 'Quel studio d’animation a produit « Toy Story » ?', 'Pixar', 'DreamWorks', 'Studio Ghibli', 'Illumination'),
  q('popculture', 1, 'Dans « Le Roi Lion », comment s’appelle le père de Simba ?', 'Mufasa', 'Scar', 'Rafiki', 'Zazu'),
  q('popculture', 2, 'Quel MOBA de Riot Games oppose deux équipes de cinq champions ?', 'League of Legends', 'Dota 2', 'Smite', 'Heroes of the Storm'),
  q('popculture', 2, 'Quelle console Sony est sortie en 1994 au Japon ?', 'La PlayStation', 'La PlayStation 2', 'La Saturn', 'La Nintendo 64'),
  q('popculture', 3, 'Quel film a remporté l’Oscar du meilleur film en février 2020 ?', 'Parasite', '1917', 'Joker', 'Once Upon a Time… in Hollywood'),
  q('popculture', 1, 'Quel personnage Marvel se transforme en géant vert ?', 'Hulk', 'Thor', 'Iron Man', 'Vision'),
  q('popculture', 2, 'Quelle chanteuse est surnommée « Queen B » ?', 'Beyoncé', 'Rihanna', 'Britney Spears', 'Lady Gaga'),
  q('popculture', 2, 'Quel réalisateur français a signé « Le Fabuleux Destin d’Amélie Poulain » ?', 'Jean-Pierre Jeunet', 'Luc Besson', 'Michel Hazanavicius', 'Jacques Audiard'),
  q('popculture', 1, 'Comment s’appelle le royaume où vit la princesse Peach ?', 'Le Royaume Champignon', 'Hyrule', 'Corona', 'Arendelle'),
  q('popculture', 2, 'Quel studio a développé « The Witcher 3 » ?', 'CD Projekt Red', 'Ubisoft', 'Bethesda', 'BioWare'),
  q('popculture', 3, 'Quel compositeur a signé la musique de « Star Wars » ?', 'John Williams', 'Hans Zimmer', 'Ennio Morricone', 'Howard Shore'),

  // ── Sport ───────────────────────────────────────────────────────────────
  q('sport', 1, 'Combien de joueurs d’une équipe de football sont sur le terrain ?', '11', '10', '12', '9'),
  q('sport', 1, 'Tous les combien d’années ont lieu les Jeux olympiques d’été ?', '4 ans', '2 ans', '3 ans', '5 ans'),
  q('sport', 1, 'Quel pays a remporté la Coupe du monde de football 2018 ?', 'La France', 'La Croatie', 'L’Allemagne', 'Le Brésil'),
  q('sport', 1, 'Dans quel sport utilise-t-on un volant ?', 'Le badminton', 'Le tennis', 'Le squash', 'Le padel'),
  q('sport', 2, 'Combien de points vaut un essai au rugby à XV ?', '5', '3', '4', '7'),
  q('sport', 1, 'Quel tournoi de tennis se joue sur terre battue à Paris ?', 'Roland-Garros', 'Wimbledon', 'L’US Open', 'L’Open d’Australie'),
  q('sport', 1, 'Combien de trous compte un parcours de golf classique ?', '18', '9', '12', '20'),
  q('sport', 2, 'Quelle est la distance officielle d’un marathon ?', '42,195 km', '40 km', '45 km', '38,5 km'),
  q('sport', 2, 'Quel nageur détient le record de médailles d’or olympiques ?', 'Michael Phelps', 'Mark Spitz', 'Ryan Lochte', 'Ian Thorpe'),
  q('sport', 1, 'Dans quel sport réalise-t-on un « strike » ?', 'Le bowling', 'Le baseball', 'Le golf', 'Les fléchettes'),
  q('sport', 1, 'Combien de joueurs par équipe sont sur le terrain au basket-ball ?', '5', '6', '7', '4'),
  q('sport', 1, 'Quelle course cycliste se termine traditionnellement sur les Champs-Élysées ?', 'Le Tour de France', 'Le Giro', 'La Vuelta', 'Paris-Roubaix'),
  q('sport', 2, 'Combien de sets gagnants faut-il pour remporter un match masculin en Grand Chelem ?', '3', '2', '4', '5'),
  q('sport', 1, 'Dans quel pays le judo a-t-il été créé ?', 'Le Japon', 'La Chine', 'La Corée', 'Le Brésil'),
  q('sport', 1, 'Combien de minutes dure une mi-temps au football ?', '45', '40', '30', '60'),
  q('sport', 3, 'En quelle année la France a-t-elle remporté sa première Coupe du monde de football ?', '1998', '1984', '2006', '2018'),

  // ── Langue française & littérature ──────────────────────────────────────
  q('langue', 1, 'Quel est le pluriel de « cheval » ?', 'Chevaux', 'Chevals', 'Chevaus', 'Chevales'),
  q('langue', 1, 'Qui a écrit « Le Petit Prince » ?', 'Antoine de Saint-Exupéry', 'Jules Verne', 'Albert Camus', 'Marcel Pagnol'),
  q('langue', 1, 'Quel est le féminin de « acteur » ?', 'Actrice', 'Acteure', 'Acteuse', 'Actresse'),
  q('langue', 1, 'Combien de lettres compte l’alphabet français ?', '26', '24', '25', '27'),
  q('langue', 1, 'Qui a écrit « Vingt Mille Lieues sous les mers » ?', 'Jules Verne', 'Victor Hugo', 'Alexandre Dumas', 'Émile Zola'),
  q('langue', 1, 'Qui est l’auteur de la fable « Le Corbeau et le Renard » ?', 'Jean de La Fontaine', 'Molière', 'Charles Perrault', 'Jean Racine'),
  q('langue', 2, 'Quelle figure de style consiste à exagérer (« mourir de rire ») ?', 'L’hyperbole', 'La métaphore', 'La litote', 'L’euphémisme'),
  q('langue', 1, 'Quel mot est un synonyme de « rapide » ?', 'Véloce', 'Lent', 'Tardif', 'Paresseux'),
  q('langue', 2, 'Qui a écrit « L’Étranger » ?', 'Albert Camus', 'Jean-Paul Sartre', 'Marcel Proust', 'André Gide'),
  q('langue', 2, 'Comment appelle-t-on un mot qui se lit dans les deux sens (« radar ») ?', 'Un palindrome', 'Une anagramme', 'Un homonyme', 'Un acronyme'),
  q('langue', 1, 'Quel dramaturge a écrit « Le Malade imaginaire » ?', 'Molière', 'Corneille', 'Racine', 'Beaumarchais'),
  q('langue', 2, 'Quel est le participe passé du verbe « acquérir » ?', 'Acquis', 'Acquéri', 'Acquiert', 'Acquéru'),
  q('langue', 1, 'Dans « Les Trois Mousquetaires », comment s’appelle le jeune Gascon ?', 'D’Artagnan', 'Athos', 'Porthos', 'Aramis'),
  q('langue', 1, 'Quelle est la nature grammaticale du mot « rapidement » ?', 'Un adverbe', 'Un adjectif', 'Un nom', 'Un verbe'),
  q('langue', 3, 'Qui a écrit « À la recherche du temps perdu » ?', 'Marcel Proust', 'Gustave Flaubert', 'Stendhal', 'Guy de Maupassant'),
  q('langue', 2, 'Quel signe de ponctuation termine une phrase interrogative ?', 'Le point d’interrogation', 'Le point d’exclamation', 'Le point-virgule', 'Les points de suspension'),
];
