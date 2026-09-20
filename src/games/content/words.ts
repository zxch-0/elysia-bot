/**
 * Dictionnaires des jeux de lettres (Pendu, Motus).
 *
 * Les mots du pendu sont en minuscules avec leurs accents (affichés à la fin),
 * ceux de Motus sont déjà normalisés (majuscules, sans accent, 5 lettres).
 */

export type HangmanTheme =
  | 'animaux'
  | 'pays'
  | 'nourriture'
  | 'metiers'
  | 'sport'
  | 'informatique'
  | 'nature'
  | 'musique'
  | 'maison';

export const HANGMAN_THEMES: Record<HangmanTheme, { label: string; emoji: string }> = {
  animaux: { label: 'Animaux', emoji: '🐾' },
  pays: { label: 'Pays', emoji: '🌍' },
  nourriture: { label: 'Nourriture & boissons', emoji: '🍽️' },
  metiers: { label: 'Métiers', emoji: '👷' },
  sport: { label: 'Sports', emoji: '⚽' },
  informatique: { label: 'Informatique', emoji: '💻' },
  nature: { label: 'Nature', emoji: '🌿' },
  musique: { label: 'Musique', emoji: '🎵' },
  maison: { label: 'Maison', emoji: '🏠' },
};

export const HANGMAN_WORDS: Record<HangmanTheme, readonly string[]> = {
  animaux: [
    'éléphant', 'girafe', 'crocodile', 'libellule', 'papillon', 'hérisson', 'écureuil', 'kangourou', 'dauphin',
    'pingouin', 'chameau', 'panthère', 'hippopotame', 'rhinocéros', 'perroquet', 'tortue', 'araignée', 'scorpion',
    'coccinelle', 'sanglier', 'chevreuil', 'blaireau', 'marmotte', 'flamant', 'autruche', 'caméléon', 'requin',
  ],
  pays: [
    'france', 'allemagne', 'espagne', 'italie', 'portugal', 'belgique', 'suisse', 'canada', 'brésil', 'argentine',
    'mexique', 'japon', 'chine', 'australie', 'égypte', 'maroc', 'sénégal', 'norvège', 'suède', 'finlande', 'irlande',
    'pologne', 'grèce', 'turquie', 'thaïlande', 'vietnam', 'colombie',
  ],
  nourriture: [
    'croissant', 'baguette', 'fromage', 'chocolat', 'raclette', 'tartiflette', 'ratatouille', 'bouillabaisse',
    'cassoulet', 'quiche', 'crêpe', 'macaron', 'éclair', 'madeleine', 'camembert', 'saucisson', 'omelette', 'gratin',
    'tomate', 'aubergine', 'courgette', 'framboise', 'abricot', 'citron', 'limonade', 'tisane', 'nougat',
  ],
  metiers: [
    'boulanger', 'médecin', 'avocat', 'architecte', 'plombier', 'électricien', 'pompier', 'infirmière', 'professeur',
    'journaliste', 'cuisinier', 'pâtissier', 'menuisier', 'jardinier', 'pharmacien', 'vétérinaire', 'comptable',
    'pilote', 'ingénieur', 'coiffeur', 'mécanicien', 'dentiste', 'bibliothécaire', 'facteur', 'photographe',
    'agriculteur',
  ],
  sport: [
    'football', 'basketball', 'tennis', 'natation', 'cyclisme', 'escalade', 'athlétisme', 'gymnastique', 'handball',
    'volleyball', 'rugby', 'badminton', 'escrime', 'judo', 'karaté', 'boxe', 'équitation', 'patinage', 'plongée',
    'surf', 'marathon', 'triathlon', 'aviron', 'biathlon', 'pétanque', 'hockey',
  ],
  informatique: [
    'ordinateur', 'clavier', 'souris', 'écran', 'logiciel', 'algorithme', 'processeur', 'mémoire', 'serveur', 'réseau',
    'internet', 'navigateur', 'programme', 'variable', 'fonction', 'compilateur', 'disque', 'imprimante', 'câble',
    'pixel', 'fichier', 'dossier', 'connexion', 'sécurité', 'robot', 'données',
  ],
  nature: [
    'montagne', 'forêt', 'rivière', 'océan', 'cascade', 'volcan', 'glacier', 'désert', 'prairie', 'vallée', 'falaise',
    'colline', 'tempête', 'orage', 'nuage', 'tonnerre', 'champignon', 'feuille', 'racine', 'source', 'marée', 'aurore',
    'brume', 'rosée', 'sable', 'corail',
  ],
  musique: [
    'guitare', 'piano', 'violon', 'batterie', 'trompette', 'saxophone', 'flûte', 'harpe', 'accordéon', 'mélodie',
    'harmonie', 'rythme', 'partition', 'concert', 'orchestre', 'chanson', 'refrain', 'couplet', 'symphonie',
    'clarinette', 'violoncelle', 'tambour', 'microphone', 'festival', 'chorale', 'solfège',
  ],
  maison: [
    'cuisine', 'chambre', 'salon', 'garage', 'grenier', 'cheminée', 'fenêtre', 'escalier', 'balcon', 'terrasse',
    'canapé', 'armoire', 'fauteuil', 'lampe', 'rideau', 'tapis', 'oreiller', 'couverture', 'miroir', 'étagère',
    'bureau', 'jardin', 'portail', 'serrure', 'robinet', 'baignoire',
  ],
};

/** Mots de 5 lettres pour Motus (majuscules, sans accent, sans doublon). */
export const MOTUS_WORDS: readonly string[] = [
  'ABORD', 'ACHAT', 'ACIER', 'ACTIF', 'ADIEU', 'AGENT', 'AIGLE', 'AIGRE', 'AIMER', 'AINSI', 'ALBUM', 'ALLER', 'ALORS',
  'AMANT', 'AMOUR', 'AMPLE', 'ANCRE', 'ANGLE', 'ANNEE', 'APPEL', 'APRES', 'ARBRE', 'ARENE', 'ARGOT', 'ARMEE', 'ARRET',
  'ASILE', 'ASTRE', 'AUDIT', 'AUTEL', 'AUTRE', 'AVANT', 'AVION', 'AVOIR', 'AZOTE',
  'BAGUE', 'BALAI', 'BANAL', 'BANDE', 'BARBE', 'BARRE', 'BASSE', 'BATON', 'BELLE', 'BERGE', 'BETON', 'BICHE', 'BIERE',
  'BLANC', 'BLOND', 'BOITE', 'BONTE', 'BORNE', 'BOULE', 'BOURG', 'BRAVE', 'BRISE', 'BRUIT', 'BRUME', 'BUCHE', 'BUSTE',
  'CABLE', 'CADRE', 'CALME', 'CANAL', 'CANON', 'CARTE', 'CASSE', 'CAUSE', 'CHAIR', 'CHANT', 'CHAUD', 'CHIEN', 'CHOIX',
  'CHOSE', 'CHUTE', 'CIBLE', 'CITER', 'CLAIR', 'CLOWN', 'COEUR', 'COLLE', 'COMTE', 'CONTE', 'CORDE', 'CORPS', 'COTON',
  'COUDE', 'COUPE', 'COURS', 'COURT', 'CRABE', 'CRAIE', 'CREME', 'CRIER', 'CROIX', 'CUIRE', 'CYCLE',
  'DANSE', 'DEBUT', 'DECOR', 'DELAI', 'DEMON', 'DENSE', 'DEPOT', 'DESIR', 'DETTE', 'DIGNE', 'DINER', 'DOIGT', 'DONNE',
  'DOUTE', 'DRAME', 'DROIT', 'DROLE', 'DUREE',
  'ECOLE', 'ECRAN', 'ECRIT', 'EFFET', 'ELEVE', 'ELIRE', 'EMAIL', 'ENFER', 'ENJEU', 'ENNUI', 'ENTRE', 'EPAIS', 'EPICE',
  'EPOUX', 'ESSAI', 'ETAGE', 'ETANG', 'ETUDE', 'EVEIL', 'EXACT', 'EXILE',
  'FABLE', 'FACHE', 'FAIRE', 'FAUTE', 'FEMME', 'FERME', 'FIBRE', 'FICHE', 'FIGUE', 'FILLE', 'FINIR', 'FLEUR', 'FOIRE',
  'FONTE', 'FORCE', 'FORET', 'FORME', 'FOULE', 'FRAIS', 'FRERE', 'FROID', 'FRUIT', 'FUMEE', 'FUSEE',
  'GAGNE', 'GARDE', 'GEANT', 'GELEE', 'GENIE', 'GENRE', 'GESTE', 'GIVRE', 'GLACE', 'GLOBE', 'GORGE', 'GRACE', 'GRAIN',
  'GRAND', 'GRAVE', 'GUIDE',
  'HABIT', 'HACHE', 'HAINE', 'HALTE', 'HAUTE', 'HERBE', 'HEURE', 'HIBOU', 'HIVER', 'HONTE', 'HOTEL', 'HUILE',
  'IDEAL', 'IMAGE', 'INDEX', 'ISSUE',
  'JAUNE', 'JETER', 'JEUNE', 'JOUER', 'JOUET', 'JUGER', 'JUSTE',
  'KAYAK', 'KOALA',
  'LACET', 'LAINE', 'LAMPE', 'LANCE', 'LAPIN', 'LARGE', 'LARME', 'LAVER', 'LEGER', 'LEVER', 'LEVRE', 'LIBRE', 'LIGNE',
  'LINGE', 'LIVRE', 'LOGER', 'LOUER', 'LOURD', 'LUEUR', 'LUNDI', 'LUTTE',
  'MAGIE', 'MAIRE', 'MALIN', 'MARDI', 'MARGE', 'MARIN', 'MASSE', 'MATIN', 'MELON', 'MERCI', 'METAL', 'METRE', 'MIEUX',
  'MINCE', 'MIXTE', 'MODEM', 'MOINE', 'MOINS', 'MONDE', 'MORAL', 'MOTIF', 'MOULE', 'MUSEE',
  'NAGER', 'NAPPE', 'NEIGE', 'NEUVE', 'NICHE', 'NOEUD', 'NORME', 'NOTER', 'NUAGE', 'NUIRE',
  'OBEIR', 'OCEAN', 'ODEUR', 'OMBRE', 'ONCLE', 'ONGLE', 'OPERA', 'ORAGE', 'ORDRE', 'OUBLI', 'OUEST', 'OUTIL', 'OVALE',
  'PAIRE', 'PALME', 'PANNE', 'PAROI', 'PARTI', 'PATTE', 'PAUSE', 'PEINE', 'PENTE', 'PERLE', 'PESTE', 'PETIT', 'PHARE',
  'PHOTO', 'PIANO', 'PIECE', 'PIEGE', 'PIQUE', 'PISTE', 'PLACE', 'PLAGE', 'PLAIE', 'PLEIN', 'PLUIE', 'PLUME', 'POCHE',
  'POELE', 'POEME', 'POIDS', 'POING', 'POIRE', 'POMME', 'POMPE', 'PORTE', 'POSTE', 'POULE', 'PRISE', 'PROIE', 'PROSE',
  'PUITS', 'PULPE', 'PUNIR',
  'QUART', 'QUEUE', 'QUOTA',
  'RADIO', 'RAIDE', 'RAMER', 'RAYON', 'REGLE', 'REINE', 'REPAS', 'REPOS', 'RESTE', 'REVER', 'RICHE', 'RIVAL', 'ROBOT',
  'ROCHE', 'RONDE', 'ROUGE', 'ROUTE', 'RUCHE',
  'SABLE', 'SABRE', 'SAINT', 'SALLE', 'SALON', 'SALUT', 'SANTE', 'SAUCE', 'SAULE', 'SCENE', 'SERIE', 'SERRE', 'SEUIL',
  'SIEGE', 'SIGNE', 'SINGE', 'SOBRE', 'SOEUR', 'SOLDE', 'SOMME', 'SONGE', 'SORTE', 'SOUPE', 'STADE', 'STYLE', 'SUCRE',
  'SUITE', 'SUJET',
  'TABLE', 'TACHE', 'TALON', 'TAPIS', 'TARTE', 'TASSE', 'TAUPE', 'TEMPS', 'TENIR', 'TENTE', 'TERRE', 'TEXTE', 'THEME',
  'TIGRE', 'TIRER', 'TISSU', 'TITRE', 'TOILE', 'TOMBE', 'TORDU', 'TOTAL', 'TRACE', 'TRAIN', 'TRAIT', 'TRIBU', 'TROIS',
  'TRONC', 'TUILE', 'TUYAU',
  'UNION', 'USAGE', 'USINE', 'UTILE',
  'VACHE', 'VAGUE', 'VALSE', 'VASTE', 'VEINE', 'VENIR', 'VENTE', 'VERBE', 'VERRE', 'VERTU', 'VESTE', 'VIDEO', 'VIEUX',
  'VILLE', 'VIRUS', 'VITRE', 'VIVRE', 'VOILE', 'VOLER', 'VOTER', 'VOUTE',
  'WAGON', 'YACHT', 'ZEBRE', 'ZESTE',
];

/**
 * Normalise une saisie : accents retirés (é → E), ligatures développées
 * (œ → OE, æ → AE), majuscules, uniquement les lettres A–Z.
 */
export function normalizeWord(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}
