# 📚 Référence complète des commandes — Elysia v1.0.0

**53 commandes slash** réparties en 10 catégories : modération, giveaways, rôles & panneaux, **communauté & animation**, **économie**, configuration, utilitaires, mini-jeux, **divertissement**, propriétaire. Les paramètres marqués *(opt)* sont facultatifs, les autres sont obligatoires.
Sauf mention contraire, toutes les réponses sont **privées** (éphémères) : personne ne voit vos manipulations.

> 🔑 **Permissions** — entre crochets : `[Admin]` = administrateur du serveur, `[Perm]` = permission Discord spécifique, `[Staff]` = rôle staff configuré via `/config roles-staff`, `[Hôte]` = rôle hôte de giveaway, `[Owner]` = `OWNER_IDS`.

---

## 🛡️ Modération

### `/ban` — Bannit un membre `[Perm: Bannir des membres]`
| Option | Type | Description |
|---|---|---|
| `membre` | Utilisateur | Le membre à bannir |
| `raison` | Texte *(opt)* | Visible dans les logs et en MP |
| `duree` | Texte *(opt)* | **Bannissement temporaire** — `7j`, `12h`, `30m`. Vide = permanent |
| `messages` | Choix *(opt)* | Supprimer les messages récents : rien / 1 h / 24 h / 7 j |
| `silencieux` | Oui-Non *(opt)* | Ne pas prévenir le membre par MP |
| `softban` | Oui-Non *(opt)* | Bannir puis débannir aussitôt (purge des messages, idéal anti-spam) |

```bash
/ban membre:@Léo raison:publicité répétée duree:7j messages:24h
/ban membre:@Spam softban:true
```

### `/kick` — Expulse un membre `[Perm: Expulser des membres]`
`membre` *(obligatoire)*, `raison` *(opt)*.

### `/mute` — Réduit au silence `[Perm: Exclure temporairement]`
| Option | Description |
|---|---|
| `membre` | Membre ciblé |
| `duree` *(opt)* | `10m`, `2h`, `3j`… — max **28 jours** en mode timeout |
| `raison` *(opt)* | Motif |
| `mode` *(opt)* | `timeout` (Discord, max 28 j) ou `role` (rôle muet, **illimité**) |

```bash
/mute membre:@Léo duree:30m raison:flood dans #général
/mute membre:@Lee mode:role raison:récidive (illimité jusqu'à /unmute)
```

### `/unmute` — Lève immédiatement un mute ou un timeout `[Perm: Exclure temporairement]`
Retire à la fois le timeout natif **et** le rôle muet, et clôt les cases associées.

### `/warn` — Avertit un membre `[Perm: Exclure temporairement]`
`membre` + `raison` *(obligatoires)*. Déclenche automatiquement le **seuil de sanction** configuré (`/config seuils`).

### `/sanctions` — Casier d'un membre `[Staff]`
`membre` *(obligatoire)*, `detaille` *(opt)*. Résumé par type + statut actuel (timeout en cours, compte créé, ancienneté) et boutons **Audit complet** / **Dernière case**.

### `/unban` — Débannit par identifiant `[Perm: Bannir des membres]`
`utilisateur` *(obligatoire, autocomplétion sur la liste réelle des bannis)*, `raison` *(opt)*.

### `/cases` — Gestion des cases `[Staff]`
| Sous-commande | Détail |
|---|---|
| `liste` | Filtres `type` (bans, kicks, mutes, warns, unbans) et `membre` |
| `detail` | `numero` — fiche complète de la case |
| `supprimer` | `numero` — **admin uniquement**, double confirmation |
| `exporter` | Fichier JSON de toutes les cases du serveur |

### `/purge` — Nettoyage de messages `[Perm: Gérer les messages]`
`nombre` (1–1000), `membre` *(opt)*, `filtre` *(opt : tous, bots, humains, images, liens, invitations)*, `salon` *(opt)*.
> Discord ne permet pas la suppression en masse des messages de plus de 14 jours.

### `/lock` — Verrouillage `[Perm: Gérer les salons]`
* `verrouiller` → `salon` *(opt)*, `raison` *(opt)*
* `deverrouiller` → `salon` *(opt)*
* `tout` → verrouille tous les salons textuels (max 40 par exécution, **confirmation requise**)

### `/slowmode` — Mode lent `[Perm: Gérer les salons]`
`secondes` (0 = désactivé, max 21600), `salon` *(opt)*, `raison` *(opt)*.

### `/note` — Notes internes du staff `[Staff]`
Carnet privé **sans sanction** : les notes ne sont jamais visibles du membre ni dans les logs publics.

| Sous-commande | Options | Description |
|---|---|---|
| `ajouter` | `membre` `note` | Enregistre une observation (800 caractères max) |
| `liste` | `membre` | Notes d'un membre, numérotées ; **vous êtes prévenu par MP** |
| `supprimer` | `membre` `numero` | Supprime la note n° (voir `liste`) |
| `resume` | — | Top 10 des membres les plus commentés par le staff |

```bash
/note ajouter membre:@Léo note:Toujours en retard en vocal
/note liste membre:@Léo
/note supprimer membre:@Léo numero:2
```

### `/bannissements` — Registre des bannissements `[Staff]`
`recherche` *(opt)*, `temporaires` *(opt)*, `export` *(opt)*.

Fusionne la liste Discord (`bans.fetch`) et les **cases** locales : raison, modérateur, date, **bannissements temporaires en cours** (avec temps restant) et export **JSON** en pièce jointe pour archivage.

### `/vocal` — Modération vocale `[Perm: Déplacer des membres]`
| Sous-commande | Options | Description |
|---|---|---|
| `deplacer` | `membre` `salon` | Déplace un membre (ou tout un salon) vers un autre vocal |
| `expulser` | `membre` | Déconnecte du vocal |
| `muet` | `membre` `actif` | Server mute / unmute |
| `verrouiller` | `salon` `verrouille` | Autorise ou interdit l'accès à un vocal |
| `limite` | `salon` `limite` | Fixe la limite de places (0 = illimité) |
| `personnes` | — | Qui est connecté, où, et avec quels états (muet, sourd, streaming) |

---

## 🎁 Giveaways

### `/giveaway` — `[Admin]` ou `[Hôte]`

#### `creer`
| Option | Description |
|---|---|
| `lot` | Ce qui est à gagner (obligatoire) |
| `duree` *(opt)* | `30m`, `6h`, `3j` — défaut : configuration du serveur |
| `gagnants` *(opt)* | 1 à 50 |
| `salon` *(opt)* | Salon d'annonce (par défaut : salon courant) |
| `description` *(opt)* | Texte complémentaire |
| `roles_requis` *(opt)* | Mentions séparées par des espaces : `@Membre @Vérifié` |
| `roles_bonus` *(opt)* | `id:nombre` — ex. `123456789012345678:3` (= 4 tickets) |
| `age_compte` *(opt)* | Âge minimum du compte Discord, en jours |
| `anciennete_membre` *(opt)* | Ancienneté minimum sur le serveur, en jours |
| `image` *(opt)* | URL d'illustration (https) |
| `ping` *(opt)* | Rôle mentionné au lancement |

```bash
/giveaway creer lot:Nitro 1 mois duree:3j gagnants:2 salon:#giveaways \
   roles_requis:@Membre age_compte:7 ping:@Annonces
```

#### Autres sous-commandes
| Commande | Effet |
|---|---|
| `terminer identifiant:3` | Fin anticipée + tirage immédiat |
| `relancer identifiant:3 gagnants:1` | Nouveau tirage parmi les non-gagnants |
| `liste` | Giveaways actifs et terminés |
| `stats` | Participations cumulées, taux moyen |
| `supprimer identifiant:3 message:true` | Suppression (confirmation requise) |

**Boutons du message de giveaway :** 🎉 Participer • 🚪 Se retirer • 🎟️ Voir les participants • 🔄 Relancer (hôtes uniquement).

---

## 🎭 Rôles & embeds

### `/rolepanel` — Panneaux de rôles `[Perm: Gérer les rôles]`

#### `creer` (publication directe)
| Option | Description |
|---|---|
| `salon` | Salon de publication |
| `titre` | Titre de l'embed |
| `roles` | `🎮 @Gamer \| 🎨 @Artiste \| 🎵 @Musique` (séparateur `\|`) |
| `description` *(opt)* | Texte de l'embed |
| `image` *(opt)* | **Image jointe** (bannière 1024×512 recommandée) |
| `image_url` *(opt)* | Alternative par lien |
| `mode` *(opt)* | `Boutons` ou `Menu déroulant` |
| `comportement` *(opt)* | `Multi-sélection` ou `Choix unique` |
| `styles` *(opt)* | `primary,success,danger` — couleurs dans l'ordre |
| `couleur` *(opt)* | Couleur de l'embed `#8b5cf6` |
| `pied` *(opt)* | Pied de page |

#### Gestion
| Sous-commande | Options | Effet |
|---|---|---|
| `ajouter` | `panneau` `role` `libelle?` `emoji?` `style?` `description?` | Ajoute un bouton (republie automatiquement) |
| `retirer` | `panneau` `role` | Retire un bouton |
| `modifier` | `panneau` + `titre?` `description?` `couleur?` `pied?` `image_url?` `image?` `comportement?` `mode?` | Modifie et republie |
| `publier` | `panneau` `salon?` | Republie net (répare les boutons après un redémarrage) |
| `apercu` | `panneau` | Aperçu privé + diagnostics |
| `liste` | — | Tous les panneaux + boutons **Stats** / **Aperçu** |
| `supprimer` | `panneau` `message?` | Suppression (confirmation) |

### `/embed` — Créateur d'embeds interactif `[Perm: Gérer les rôles]`

| Sous-commande | Description |
|---|---|
| `creer` | Ouvre une **modale** (titre, description, couleur, image, rôles). Pré-remplissage possible : `titre`, `description`, `image_url`, `roles`, `couleur` |
| `modifier` | `panneau` + champs à changer (conserve les boutons de rôles) |
| `image` | `panneau` + `fichier` — **upload direct** d'une image d'illustration (PNG/JPG/GIF/WEBP, 8 Mo max), ou `retirer:true` |
| `json` | Exporte le payload JSON de l'embed (développeurs) |

**Flux de `creer` :** modale → **aperçu privé** → boutons *Publier* / *Rôles* / *Image* / *Salon* / *Boutons-Menu* / *Couleurs* / *Annuler* → publication.
Le brouillon expire après 20 minutes et reste privé jusqu'à validation.

### `/role` — Gestion manuelle des rôles `[Perm: Gérer les rôles]`
* `donner` : `membre` `role` `raison?`
* `retirer` : `membre` `role` `raison?`
* `info` : `role` (couleur, nombre de membres, position, mentionnable, **attribuable par le bot** ou non)

---

## 🎉 Communauté & animation

### `/sondage` — Sondages interactifs
`question` `choix` (`Pizza | Burger | Sushi`, 2 à 10) • `duree?` (`1h`, `2j`) • `multiple?` • `anonyme?` • `ping?` • `epingler?`.

Vote par **boutons**, résultats en direct dans l'embed, **clôture automatique** à l'échéance avec annonce du gagnant, boutons `Résultats` / `Terminer` / `Effacer mon vote`.

### `/suggestion` — Boîte à idées

| Sous-commande | Options | Description |
|---|---|---|
| `envoyer` | `idee` `anonyme?` | Publie dans le salon configuré (fil de discussion automatique si activé) |
| `liste` | `statut?` | Dernières suggestions (`ouverte`, `acceptee`, `refusee`, `archivee`) |
| `top` | — | Suggestions les mieux notées (score = 👍 − 👎) |
| `config` | `salon?` `anonyme_par_defaut?` `fils?` | Réglages réservés aux administrateurs |

Boutons 👍 / 👎 / 📊 / ✅ acceptée / ❌ refusée / 🗄️ archivée : chaque membre vote une fois, le score se met à jour en direct, l'auteur peut modifier sa suggestion.

### `/anniversaire` — Anniversaires du serveur
`definir jour: mois: annee?` • `retirer` • `prochain nombre?` • `liste` • `moi`.

Le jour J, le bot publie une annonce dans le salon configuré (fuseau réglable via `BIRTHDAY_TIMEZONE`), avec l'âge quand l'année est renseignée.

### `/compte-a-rebours` — Compte à rebours d'événement
`creer titre: echeance: description? salon? ping?` • `liste` • `supprimer identifiant:`.

Dates en **horodatage Discord** (`dans 3 heures`), boutons **⏱️ Temps restant** et **🔔 Me prévenir** (rappel privé 10 minutes avant), annonce automatique avec mention du rôle à l'échéance.

### `/niveau` — XP, niveaux et récompenses
`voir membre?` • `classement taille?` • `recompenses` • `config` • `recompense action: niveau: role:` • `ajuster membre: xp:` *(staff)*.

Gain d'XP par message (15–25 XP, une fois par minute), courbe `100 × niveau²`, annonce des montées de niveau et **rôles automatiques** par palier.

### `/tirage` — Tirage au sort séparé des giveaways
`gagnants?` `role?` `anciennete?` `avec_bots?` `recompense?` — fonctionne immédiatement, sans concours ni participation : idéal pour départager un salon.

---

## 💰 Économie

### `/argent` — Solde, fortunes et administration
Chaque message rapporte de l'argent (8–20 🪙, anti-flood 5 s par défaut). Cet argent se **mise au blackjack** (`/blackjack`), se **donne** aux autres membres et alimente le **classement des fortunes**, aussi visible sur le site intégré (onglet 💰 Économie).

| Sous-commande | Options | Description |
|---|---|---|
| `voir` | `membre?` | Solde, rang, gagné en discutant, bilan casino, transferts |
| `classement` | `taille?` (5–25) | Classement des membres les plus riches |
| `donner` | `membre` `montant` | Transfère de l'argent à un autre membre (solde vérifié) |
| `ajouter` | `membre` `montant` | **[Admin]** Crédite un portefeuille (crédation illimitée) |
| `retirer` | `membre` `montant` | **[Admin]** Débite un portefeuille (jamais en dessous de zéro) |
| `reinitialiser` | `membre` | **[Admin]** Remet le solde du membre à zéro |
| `config` | `actif?` `argent_min?` `argent_max?` `delai?` `capital?` | **[Admin]** Gain par message, anti-flood et capital de départ (50 🪙 par défaut) |

Le module peut être désactivé avec `/config modules module:💰 Économie actif:false`.

---

## 🛠️ Configuration

### `/config` — `[Admin]`

| Sous-commande | Options | Description |
|---|---|---|
| `voir` | — | Configuration complète actuelle |
| `salut` | — | **Diagnostic** : permissions manquantes, salons supprimés, hiérarchie, salons inaccessibles |
| `convivialite` | `logs_moderation?` `logs_messages?` `logs_membres?` `bienvenue?` `departs?` `role_muet?` `role_auto?` `role_staff?` `role_hote?` | **Tout configurer en une commande** |
| `salon` | `type` `salon?` | Salon par type (retirer le salon = désactiver) |
| `role-muet` | `role?` `creer?` | Définit/crée le rôle muet (permissions de mute appliquées à tous les salons) |
| `roles-staff` | `action` `role?` | Rôles autorisés à administrer le bot |
| `roles-hotes` | `action` `role?` | Rôles autorisés à lancer des giveaways |
| `modules` | `module` `actif` | Active/désactive : modération, giveaways, panneaux, logs, bienvenue, autorôles |
| `mute-mode` | `mode?` `duree?` | `timeout` ou `role` + durée par défaut |
| `seuils` | `action` `nombre?` `sanction?` `duree?` | Ajoute/retire/efface un palier de sanctions automatiques |
| `giveaway` | `gagnants?` `duree?` `age_compte?` `anciennete?` `mp_gagnants?` | Valeurs par défaut des giveaways |
| `blacklist` | `action` `role?` | Rôles exclus des giveaways |
| `bienvenue` | `message?` `couleur?` `actif?` `embed?` | Message de bienvenue (`{mention}` `{user}` `{server}` `{membercount}`) |
| `depart` | `message?` `actif?` | Message de départ |
| `reset` | — | Réinitialise la configuration (double confirmation) |

```bash
/config convivialite logs_moderation:#logs-bot role_muet:@Muted role_staff:@Modo
/config seuils action:ajouter nombre:3 sanction:mute duree:1h
/config modules module:🎁 Giveaways actif:false
```

### `/autorole` — Rôles automatiques `[Perm: Gérer les rôles]`
`ajouter role:` • `retirer role:` • `liste` • `appliquer` (rattrapage sur les membres existants, 50 max par exécution).

---

## ✨ Utilitaires

| Commande | Options | Description |
|---|---|---|---|
| `/help` | `categorie?` | Aide **paginée** par catégorie |
| `/bot-stats` | — | Latence, uptime, mémoire, serveurs, giveaways, panneaux, compteurs de session |
| `/invite` | — | Génère le lien d'invitation du bot (bouton cliquable) |
| `/profil` | `membre?` `public?` | Fiche complète : ancienneté, rôles, niveau/XP, statistiques de jeux, sanctions |
| `/avatar` | `membre?` `banniere?` | Avatar, bannière et liens de téléchargement (PNG, WebP, GIF) |
| `/serveur` | — | Population, salons, boosts, fonctionnalités, date de création |
| `/roles` | `tri?` `recherche?` `page?` `diagnostic?` | Rôles triés par membres/position/nom + **diagnostic** (rôles vides, doublons, non attribuables) |
| `/emojis` | `type?` `tri?` `recherche?` `page?` | Émojis et stickers (usages estimés, date d'ajout, pagination) |
| `/membres` | `derniers?` | Statistiques de population : humains/bots, présence, ancienneté moyenne |
| `/invitations` | `liste` • `creer salon? duree? utilisations? temporaire?` | Invitations actives (usages) ou création sur mesure |
| `/snipe` | `type?` `position?` `historique?` | Dernier message **supprimé** ou **modifié** du salon (30 min de mémoire) |
| `/rappel` | `creer dans: quoi: salon? mention?` • `liste tous?` • `supprimer identifiant:` | Rappels à la seconde, boutons **⏰ +10 min / ✅ Terminé / 🗑️ Annuler** (10 rappels max par membre) |
| `/heure` | `ville` `ville2?` `ville3?` `ville4?` | Heure locale de 25 villes du monde, décalage et date |
| `/meteo` | `ville` `jours?` | Météo actuelle + prévisions 1 à 4 jours (Open-Meteo, sans clé d'API) |
| `/calculer` | `expression` `public?` | Calculatrice : opérateurs, fonctions scientifiques, `15% de 240`, factorielles, `pi` |
| `/convertir` | `valeur` `de` `vers` | Conversions entre 45+ unités (longueurs, masses, températures, données, temps, vitesse…) |
| `/motdepasse` | `type?` `longueur?` `nombre?` | Mot de passe / phrase de passe / PIN / jeton + entropie estimée (réponse privée) |
| `/code` | `encoder` • `decoder` • `hacher` | Base64, hexadécimal, binaire, URL, morse, César, inversion + SHA-256/512/1, MD5 |

---

## 🎮 Mini-jeux

### `/jeu` — 9 mini-jeux interactifs avec classement *(réponses publiques)*

Toutes les parties se jouent dans le salon avec des boutons, menus et modales. Les parties inactives expirent automatiquement (le joueur qui n'a pas joué perd par forfait en duel). Le module peut être désactivé avec `/config modules module:🎮 Mini-jeux actif:false`.

| Sous-commande | Paramètres | Description |
|---|---|---|
| `morpion` | `adversaire?` `niveau?` (facile, normal, imbattable) `ouvert?` | Morpion 3×3. Sans adversaire : IA (minimax). `ouvert:true` : le premier membre qui clique **Rejoindre** joue. |
| `puissance4` | `adversaire?` `niveau?` (facile, normal, difficile, expert) `ouvert?` | Puissance 4 — IA négamax alpha-bêta avec approfondissement itératif et budget de temps (expert ≈ 12 coups d’avance). |
| `pfc` | `adversaire?` `variante?` (classique, lezard-spock) `manches?` (1, 3, 5, 7) `ouvert?` | Pierre-Feuille-Ciseaux au meilleur des N manches, choix simultanés et secrets. |
| `memory` | `adversaire?` `paires?` (6, 8, 10) `ouvert?` | Memory : solo chronométré ou duel au tour par tour (une paire trouvée = on rejoue). |
| `pendu` | `theme?` (9 thèmes ou aléatoire) `mode?` (solo, tous) | Pendu : lettres via menus déroulants, proposition du mot entier via modale. Mode `tous` : tout le salon coopère. |
| `motus` | — | Mot mystère de 5 lettres en 6 essais (🟩 bien placée, 🟨 présente, ⬛ absente), clavier récapitulatif. |
| `quiz` | `theme?` (7 thèmes ou mélangés) `difficulte?` `questions?` (3–20) `secondes?` (10–60) | Quiz multijoueur chronométré : tout le monde répond, bonus de rapidité, révélation automatique, podium final. L'hôte peut **Passer** ou **Arrêter**. |
| `demineur` | `mines?` (2–8) | Démineur 5×4 : premier clic toujours sûr, mode drapeau, chrono et compteur de coups. |
| `2048` | — | 2048 sur grille 4×4 avec flèches, 3 annulations et meilleur score. |
| `stats` | `membre?` | Statistiques d'un joueur : points, rang, victoires/défaites/nuls par jeu, séries et records. |
| `classement` | `jeu?` | Top 10 du serveur (points cumulés) — général ou limité à un jeu. |
| `liste` | — | Catalogue des jeux avec une description de chacun. |

**Points de classement (exemples)** : victoire contre un membre (morpion 10, Puissance 4 15), contre l'IA selon le niveau (Puissance 4 expert : 35), Motus selon le nombre d'essais (14 → 4), quiz : moitié du score obtenu, démineur : 3 × nombre de mines, 2048 : selon la meilleure tuile.

**Limites** : 3 parties actives par hôte, 8 par salon. Une partie terminée reste affichée avec un bouton **Revanche / Rejouer** pendant 15 minutes (le bouton est ensuite retiré automatiquement). Entre membres, la revanche envoie un **nouveau défi** que l'adversaire doit accepter ; contre l'IA ou en solo, la nouvelle partie démarre aussitôt sur le même message.

### `/blackjack` — Blackjack contre le croupier, mises en argent réel *(réponses publiques)*

Commande autonome (hors `/jeu`, pour ne pas la confondre avec les mini-jeux de loisir) : elle met en jeu l'argent gagné en discutant (solde `/argent voir`).

- Bouton **💰 Miser** → modale demandant **directement la somme à miser** : montant entier libre, **sans plafond** (seul le solde fait limite), pas de boutons de montants prédéfinis.
- Ensuite : **🃏 Tirer**, **✋ Rester**, **⏫ Doubler** (deuxième carte, solde vérifié), **🚪 Quitter la table** (abandon de la mise en cours de main).
- Blackjack payé 3:2, croupier tire jusqu'à 17. Mise rendue en cas d'égalité.
- Le bilan de la table alimente les statistiques (`/jeu stats`) et le classement du serveur. Module désactivable avec `/config modules module:🎮 Mini-jeux actif:false`.

---

## 🤪 Divertissement

| Commande | Options | Description |
|---|---|---|
| `/des` | `notation?` `lancers?` `seuil?` `prive?` | Notation `2d6+3`, `4d6`, `d20` — détail des dés, totaux, réussites/seuil, statistiques |
| `/8ball` | `question` | Boule magique 🎱 : réponse parmi 20, ambiance garantie |
| `/citation` | `theme?` | Citations (motivation, sagesse, amitié, code, absurde) |
| `/blague` | `categorie?` `direct?` | Blague avec **chute cachée** derrière un bouton (ou `direct:true`) |
| `/pile-ou-face` | `pari?` `lancers?` | Pile ou face, pari et séries (jusqu'à 50 lancers, plus longue série) |
| `/duel` | `adversaire` `gage?` `manches?` | Duel de dés 1, 3 ou 5 manches : boutons **Accepter / Refuser / Annuler**, mort subite, revanche, gage affiché au perdant |

---

## 👑 Propriétaire `[Owner]`

### `/owner` — Maintenance du bot

| Sous-commande | Description |
|---|---|
| `statut` | État interne : PID, mémoire, base de données, tâches planifiées, compteurs |
| `serveurs` | Liste des serveurs (triée par taille) |
| `quitter identifiant:` | Fait quitter le bot d'un serveur (confirmation) |
| `diffuser message:` | MP à tous les propriétaires de serveurs |
| `recharger` | Recharge et republie les commandes à chaud (publication en **une seule portée**) |
| `commandes` | **Diagnostic des doublons** : portée configurée, commandes globales et par serveur, suppression immédiate des doublons détectés |
| `activite texte:` | Change le statut affiché du bot |
| `nettoyer` | Supprime les giveaways orphelins et les cases archivées de plus de 6 mois |

---

## 🎯 Permissions Discord demandées par commande

| Commande | Permission utilisateur | Permission du bot |
|---|---|---|
| `/ban`, `/unban` | Bannir des membres | Bannir des membres |
| `/kick` | Expulser des membres | Expulser des membres |
| `/mute`, `/unmute`, `/warn`, `/sanctions` | Exclure temporairement | Exclure temporairement + Gérer les rôles |
| `/purge` | Gérer les messages | Gérer les messages |
| `/lock`, `/slowmode` | Gérer les salons | Gérer les salons |
| `/rolepanel`, `/embed`, `/role`, `/autorole` | Gérer les rôles | Gérer les rôles + Intégrer des liens + Joindre des fichiers |
| `/config` | Gérer le serveur | Gérer les rôles |
| `/giveaway` | Admin ou rôle hôte | Intégrer des liens, Envoyer des messages |
| `/note` | Rôle staff | Gérer les rôles (MP de notification uniquement) |
| `/bannissements` | Rôle staff | Bannir des membres (lecture de la liste) |
| `/vocal` | Déplacer des membres | Déplacer des membres, Rendre muet, Gérer les salons |
| `/tirage` | Rôle hôte ou auteur | Envoyer des messages |
| `/suggestion config`, `/niveau config`, `/niveau recompense` | Gérer le serveur | Gérer les rôles |
| `/argent ajouter`, `/argent retirer`, `/argent reinitialiser`, `/argent config` | Gérer le serveur | — |

Un refus renvoie toujours un message **explicatif** (permission manquante, rôle trop haut, cible hors de portée…), jamais une erreur muette.

---

## 🕒 Tâches automatiques (planificateur interne)

| Tâche | Fréquence | Effet |
|---|---|---|
| Giveaways | 15 s | Clôture à l'échéance, tirage pondéré, MP aux gagnants |
| Rôles de panneaux | 2 min | Réparation des messages supprimés, statistiques |
| Cases expirées | 1 min | Levée automatique des mutes/banissements temporaires |
| Rappels | 20 s | Déclenchement à la seconde + boutons snooze |
| Comptes à rebours | 30 s | Annonce avec mention du rôle le jour J |
| Sondages | 20 s | Clôture automatique et annonce du gagnant |
| Anniversaires | 5 min | Annonce du jour (fuseau `BIRTHDAY_TIMEZONE`) |
| Entretien | 30 min | Purge des rappels (> 7 j), comptes à rebours, sondages et vieilles parties (> 30 j) |

---

## 🧩 Fonctionnalités déclenchées par les composants (boutons / menus)

| Interaction | Effet |
|---|---|
| Bouton de rôle d'un panneau | Attribue ou retire le rôle (choix unique : remplace la sélection) |
| Menu déroulant d'un panneau | Synchronise la sélection complète des rôles |
| 🎉/🚪 d'un giveaway | Rejoint/quitte, avec vérification des conditions |
| 🎟️ Participants | Liste paginée avec les tickets de chaque membre |
| 🔄 Relancer | Nouveau tirage (hôtes uniquement) |
| Boutons `Confirmer/Annuler` | Toute action destructrice (purge globale, reset, suppression) — seul l'auteur peut confirmer, expiration 60 à 90 s |
| Pagination de `/help` | Navigation ⏮️ ◀️ ▶️ ⏭️ |
| Boutons du créateur d'embed | Rôles, image, salon, type de composant, couleurs, publication |
| 🗳️ Vote d'un sondage (`poll:`) | Vote, changement ou retrait du vote ; `Résultats`, `Terminer` (auteur), `Effacer mon vote` |
| 👍/👎 d'une suggestion (`sug:`) | Vote unique par membre ; `📊 Statistiques`, `✅ Acceptée`, `❌ Refusée`, `🗄️ Archivée` (staff) |
| ⏱️/🔔 d'un compte à rebours (`cd:`) | Temps restant (éphémère) et **rappel privé** à l'approche de l'échéance |
| ⚔️ Boutons de duel (`duel:`) | Accepter / Refuser / Annuler / Revanche / Fermer, mort subite automatique |
| ⏰ Boutons de rappel (`rem:`) | Snooze +10 min, Terminé, Annuler, Repousser à demain |
| 😂 Chute d'une blague (`fun:punchline:`) | Révèle la chute (seul l'auteur du message peut la dévoiler) |
| Boutons / menus / modales des mini-jeux (`g:`) | Cases de jeu, choix de réponse, lettres du pendu, mots de Motus, mises du blackjack, Accepter/Refuser/Rejoindre, Abandonner, Revanche — seuls les joueurs concernés peuvent agir |
