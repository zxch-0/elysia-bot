# 📚 Référence complète des commandes — Elysia v1.0.0

**22 commandes slash.** Les paramètres marqués *(opt)* sont facultatifs, les autres sont obligatoires.
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

| Commande | Description |
|---|---|
| `/help` | Aide **paginée** par catégorie (`categorie?` pour filtrer) |
| `/bot-stats` | Latence, uptime, mémoire, serveurs, giveaways, panneaux, compteurs de session |
| `/invite` | Génère le lien d'invitation du bot (bouton cliquable) |

---

## 🎮 Mini-jeux

### `/jeu` — 10 mini-jeux interactifs avec classement *(réponses publiques)*

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
| `blackjack` | — | Table de blackjack (100 jetons virtuels) : miser, tirer, rester, doubler. Blackjack payé 3:2. |
| `stats` | `membre?` | Statistiques d'un joueur : points, rang, victoires/défaites/nuls par jeu, séries et records. |
| `classement` | `jeu?` | Top 10 du serveur (points cumulés) — général ou limité à un jeu. |
| `liste` | — | Catalogue des jeux avec une description de chacun. |

**Points de classement (exemples)** : victoire contre un membre (morpion 10, Puissance 4 15), contre l'IA selon le niveau (Puissance 4 expert : 35), Motus selon le nombre d'essais (14 → 4), quiz : moitié du score obtenu, démineur : 3 × nombre de mines, 2048 : selon la meilleure tuile.

**Limites** : 3 parties actives par hôte, 8 par salon. Une partie terminée reste affichée avec un bouton **Revanche / Rejouer** pendant 15 minutes.

---

## 👑 Propriétaire `[Owner]`

| Sous-commande | Description |
|---|---|
| `statut` | État interne : PID, mémoire, base de données, tâches planifiées, compteurs |
| `serveurs` | Liste des serveurs (triée par taille) |
| `quitter identifiant:` | Fait quitter le bot d'un serveur (confirmation) |
| `diffuser message:` | MP à tous les propriétaires de serveurs |
| `recharger` | Recharge et republie les commandes à chaud |
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

Un refus renvoie toujours un message **explicatif** (permission manquante, rôle trop haut, cible hors de portée…), jamais une erreur muette.

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
| Boutons / menus / modales des mini-jeux (`g:`) | Cases de jeu, choix de réponse, lettres du pendu, mots de Motus, mises du blackjack, Accepter/Refuser/Rejoindre, Abandonner, Revanche — seuls les joueurs concernés peuvent agir |
