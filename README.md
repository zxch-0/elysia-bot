<div align="center">

# 💜 Elysia

**Bot Discord tout-en-un : modération avancée, giveaways, panneaux de rôles avec images, mini-jeux avec classement et économie avec blackjack.**

`Node.js 20+` • `discord.js 14` • `TypeScript` • `Zéro base de données à installer`

[Déploiement gratuit sur Render](docs/DEPLOIEMENT-RENDER-UPTIMEROBOT.md) • [Référence des commandes](docs/COMMANDES.md) • [Dépannage](docs/DEPANNAGE.md)

</div>

---

## ✨ Ce que fait Elysia

### 🛡️ Modération complète
| Fonctionnalité | Détail |
|---|---|
| **Bannissements** | Permanents, **temporaires** (débannissement automatique), **softban** (purge des messages), suppression des messages jusqu'à 7 jours |
| **Expulsions** | Avec raison, notification en MP et journalisation |
| **Mute / Timeout** | Deux moteurs : **timeout natif Discord** (max 28 j) ou **rôle muet** (durée illimitée). Levée automatique à l'expiration |
| **Avertissements** | Historique par membre + **sanctions automatiques par palier** (3 warns → mute 1 h, 5 → mute 24 h, 7 → ban, tout est configurable) |
| **Cases numérotées** | Chaque sanction crée une case `#12` avec membre, modérateur, raison, durée, statut. Export JSON, suppression protégée par confirmation |
| **Purge intelligente** | Filtres : bots, humains, images, liens, invitations Discord, membre précis |
| **Verrouillage** | `/lock verrouiller`, `/lock deverrouiller`, `/lock tout` (verrouillage global avec confirmation), `/slowmode` |
| **Sécurités** | Vérification de la hiérarchie des rôles, des permissions du bot **et** de l'auteur, refus de modérer le propriétaire du serveur |

### 🎁 Giveaways (réservés aux admins / rôles hôtes)
- Lancement avec **durée**, **nombre de gagnants**, **salon**, **image**, **rôle de notification**.
- **Conditions de participation** : rôles requis, âge minimum du compte, ancienneté minimale sur le serveur.
- **Tickets bonus** : un rôle donne `+2` tickets, un autre `+3`… Le tirage est pondéré (crypto-aléatoire, sans remise).
- **Boutons** : Participer 🎉 / Se retirer 🚪 / Voir les participants 🎟️ / Relancer 🔄 (admin).
- Fin **automatique** à l'échéance ou manuelle, **relance** (reroll) des gagnants, statistiques, MP automatique aux gagnants.
- Les **membres blacklistés** (rôles exclus) ne peuvent pas participer.

### 🎭 Panneaux de rôles & créateur d'embeds
- Panneaux en **boutons** (5 par ligne, 25 max) ou **menu déroulant**.
- Mode **multi-sélection** ou **choix unique** (le nouveau rôle retire le précédent).
- **Images d'illustration** : URL **ou upload direct** — le fichier est stocké dans `assets/panels/` et renvoyé en pièce jointe, donc l'image ne disparaît jamais même si Discord purge son CDN.
- `/embed creer` : **assistant complet** (modale → aperçu privé → choix des rôles → publication), couleurs, pied de page, style de chaque bouton.
- Réparation/publication en un clic (`/rolepanel publier`), diagnostics automatiques (rôle trop haut, salon supprimé…), statistiques par rôle.

### 🎉 Communauté & animation
- **Sondages** : 2 à 10 choix, vote multiple, anonyme, durée (`2j`), clôture automatique avec annonce du gagnant, résultats en direct.
- **Suggestions** : salon dédié, fil de discussion automatique, votes 👍/👎, statuts `acceptée / refusée / archivée` (staff), classement des meilleures idées.
- **Anniversaires** : chacun enregistre sa date (`/anniversaire definir`), le bot annonce le jour J (fuseau `BIRTHDAY_TIMEZONE`) et liste les prochains.
- **Comptes à rebours** : sortie de jeu, tournoi, vacances… avec boutons **⏱️ Temps restant** et **🔔 Me prévenir** (rappel privé avant l'échéance) et mention du rôle le jour J.
- **Niveaux & XP** : gain par message, classement, courbe `100 × niveau²`, annonces de montée et **rôles automatiques par palier**.
- **Tirages au sort** : `/tirage` (filtres par rôle et ancienneté) pour départager un salon sans passer par un giveaway.

### ✨ Utilitaires du quotidien
- `/profil` `/avatar` `/serveur` `/roles` `/emojis` `/membres` `/invitations` — fiches et inventaires du serveur, avec diagnostics.
- `/snipe` (dernier message supprimé ou modifié), `/rappel` (rappels avec snooze), `/heure` (25 villes), `/meteo` (Open-Meteo, sans clé).
- `/calculer` (`sqrt(144) + 2^10`, `15% de 240`), `/convertir` (45+ unités), `/motdepasse` (entropie estimée), `/code` (Base64, morse, SHA-256…).
- `/note`, `/bannissements`, `/vocal` côté modération : notes internes du staff, registre exportable des bans, outils vocaux.

### 🤪 Divertissement
`/des` (`2d6+3`), `/8ball`, `/citation`, `/blague` (chute cachée derrière un bouton), `/pile-ou-face` (séries jusqu'à 50 lancers), `/duel` (défis de dés avec gage, boutons Accepter/Refuser, mort subite et revanche).

### 🎮 Mini-jeux (10 jeux, classement par serveur)
- **Morpion** et **Puissance 4** contre un membre, en partie ouverte ou contre l'IA (minimax imbattable, alpha-bêta à 4 niveaux avec profondeur itérative).
- **Pierre-Feuille-Ciseaux** en plusieurs manches (variante Lézard-Spock), choix simultanés et secrets.
- **Quiz** multijoueur chronométré : 7 thèmes, 3 difficultés, bonus de rapidité, révélation automatique, podium.
- **Pendu** (9 thèmes, mode coopératif pour tout le salon), **Motus** (mot de 5 lettres, façon Wordle).
- **Démineur** (premier clic toujours sûr, mode drapeau, chrono), **2048** (annulations limitées), **Blackjack** (mises en argent réel, doubler), **Memory** (solo chrono ou duel).
- Invitations avec **Accepter / Refuser**, revanche en un clic (nouveau défi entre membres, redémarrage immédiat contre l'IA), abandon, forfait automatique par inactivité.
- **Statistiques persistantes** par joueur (`/jeu stats`) et **classement** général ou par jeu (`/jeu classement`). Module désactivable via `/config modules`.

### 💰 Économie & argent
- **Argent gagné en discutant** : chaque message rapporte des 🪙 (montant et anti-flood configurables), capital de départ offert aux nouveaux portefeuilles.
- **Blackjack à mises réelles** : `/blackjack` (commande autonome, hors `/jeu`) mise votre solde (`/argent voir`) avec un montant libre choisi dans une modale, blackjack payé 3:2, double possible.
- **Commandes complètes** : `/argent` (`voir`, `classement`, `donner`, `ajouter`, `retirer`, `reinitialiser`, `config` pour les admins).
- **Classement des fortunes** dans Discord (`/argent classement`) et sur le site intégré (onglet 💰 Économie).

### 🛠️ Configuration & infrastructure
- `/config convivialite` : **toute la configuration en une seule commande**.
- `/config salut` : **diagnostic** des permissions, salons et hiérarchie des rôles.
- Logs séparés : modération, messages (suppression/édition), membres (arrivée/départ).
- Rôles automatiques à l'arrivée, messages de bienvenue/départ personnalisables (`{mention}`, `{server}`, `{membercount}`…).
- **Site web intégré (6 pages)** : tableau de bord, **catalogue des commandes**, **classements des mini-jeux**, **classement d'argent** (onglet 💰 Économie), **communauté** (niveaux, suggestions, sondages, anniversaires) et **données internes** (cases, notes du staff, journaux) — plus `/health` (UptimeRobot), une **API JSON** complète et `/metrics` (Prometheus). Interface 100 % autonome (aucune ressource externe), protégeable par `DASHBOARD_TOKEN`.
- **Base JSON persistante** (aucun MongoDB/Postgres à installer), écriture atomique, sauvegarde à l'arrêt.
- Prêt pour Render : `render.yaml`, `Dockerfile`, CI GitHub Actions, **auto-ping** intégré.

---

## 🚀 Démarrage rapide (5 minutes, en local)

```bash
# 1. Récupérer le projet
git clone https://github.com/zxch-0/elysia-bot.git
cd elysia-bot

# 2. Installer les dépendances
npm install

# 3. Créer le fichier de configuration
cp .env.example .env
#    → ouvrez .env et collez votre DISCORD_TOKEN et votre CLIENT_ID

# 4. Vérifier que tout est prêt (connexion réelle à l'API Discord)
npm run validate

# 5. Lancer le bot
npm run dev          # mode développement (rechargement automatique)
# ou
npm run build && npm start
```

> 💡 **Sans token ?** Testez le site et la persistance avec :
> `DRY_RUN=1 npm run preview` → ouvrez http://localhost:3000 (`/`, `/commandes`, `/jeux`, `/communaute`, `/donnees`)

### Où trouver `DISCORD_TOKEN` et `CLIENT_ID` ?

1. Rendez-vous sur https://discord.com/developers/applications → **New Application**.
2. Onglet **General Information** → copiez **Application ID** → c'est votre `CLIENT_ID`.
3. Onglet **Bot** → **Reset Token** → copiez la valeur → c'est votre `DISCORD_TOKEN`.
4. Toujours dans **Bot**, activez les *Privileged Gateway Intents* : **SERVER MEMBERS INTENT** et **MESSAGE CONTENT INTENT** (indispensables pour les logs et la modération).
5. Onglet **OAuth2 → URL Generator** : cochez `bot` + `applications.commands`, permission **Administrator**, puis ouvrez l'URL générée pour inviter Elysia. (Ou tapez `/invite` dans Discord, le bot génère le lien.)

### `OWNER_IDS`

Activez le mode développeur Discord (*Paramètres → Avancés → Mode développeur*), faites un clic droit sur votre profil → **Copier l'identifiant**. Collez-le dans `OWNER_IDS` (plusieurs identifiants séparés par des virgules). Ces personnes accèdent à `/owner` (maintenance, diffusion, rechargement).

---

## ⚙️ Variables d'environnement

| Variable | Obligatoire | Défaut | Description |
|---|:---:|---|---|
| `DISCORD_TOKEN` | ✅ | — | Token du bot (Developer Portal → Bot → Reset Token) |
| `CLIENT_ID` | ✅ | — | Application ID (Developer Portal → General Information) |
| `DEV_GUILD_ID` | — | — | Serveur de test : les slash-commands y sont publiées **instantanément** |
| `OWNER_IDS` | — | — | Identifiants des propriétaires (accès `/owner`) |
| `PORT` | — | `3000` | Fourni automatiquement par Render |
| `HOST` | — | `0.0.0.0` | Interface d'écoute du serveur web |
| `LOG_LEVEL` | — | `info` | `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | — | `pretty` | `pretty` (lisible) ou `json` (idéal sur Render) |
| `DEFAULT_LOCALE` | — | `fr` | `fr` ou `en` |
| `SELF_PING_URL` | — | — | URL publique du service pour l'auto-ping interne (ex. `https://elysia-bot.onrender.com`) |
| `SELF_PING_INTERVAL` | — | `14` | Intervalle de l'auto-ping en minutes (`0` = désactivé) |
| `DRY_RUN` | — | `0` | `1` = démarre sans se connecter à Discord (test de déploiement) |
| `COMMANDS_SCOPE` | — | `auto` | Portée des slash-commands : `auto`, `guild`, `global` ou `both`. `auto` = serveur de dev si `DEV_GUILD_ID` est défini, sinon global — **une seule portée à la fois** pour éviter les commandes en double |
| `BIRTHDAY_TIMEZONE` | — | `Europe/Paris` | Fuseau utilisé pour déterminer le jour des annonces d'anniversaires |
| `DASHBOARD_TOKEN` | — | — | Jeton protégeant la page `/donnees` et les routes `/api/cases`, `/api/notes`, `/api/reminders`, `/api/logs` (vide = accès libre) |

---

## ☁️ Déployer gratuitement sur Render (résumé)

> 📖 **Tutoriel détaillé, étape par étape : [`docs/DEPLOIEMENT-RENDER-UPTIMEROBOT.md`](docs/DEPLOIEMENT-RENDER-UPTIMEROBOT.md)**

1. **Forkez** ce dépôt sur votre compte GitHub.
2. Sur [render.com](https://render.com) : **New +** → **Blueprint** → sélectionnez votre fork (Render lit `render.yaml`).
   *Alternative manuelle :* **New + → Web Service**, `Build Command` = `npm ci --include=dev && npm run build`, `Start Command` = `npm start`, plan **Free**.
3. Renseignez les variables secrètes : `DISCORD_TOKEN`, `CLIENT_ID`, `DEV_GUILD_ID` (optionnel), `OWNER_IDS`, `SELF_PING_URL`.
4. Attendez le déploiement (`Deploy live` 🎉) puis vérifiez `https://VOTRE-SERVICE.onrender.com/health`.
5. Créez un moniteur **HTTP(s)** sur [UptimeRobot](https://uptimerobot.com) pointant vers `https://VOTRE-SERVICE.onrender.com/health`, intervalle **5 minutes** → le service ne s'endort plus.
6. Dans Discord : `/config convivialite`, `/config salut`, puis créez votre premier panneau `/rolepanel creer`.

---

## 📚 Référence des commandes

Liste complète et détaillée : **[docs/COMMANDES.md](docs/COMMANDES.md)**

**53 commandes** au total (catégories affichées par `/help`, consultables avec `/help categorie:…`).

| Catégorie | Commandes |
|---|---|
| 🛡️ Modération | `/ban` `/kick` `/mute` `/unmute` `/warn` `/sanctions` `/unban` `/cases` `/purge` `/lock` `/slowmode` `/note` `/bannissements` `/vocal` |
| 🎁 Giveaways | `/giveaway` (`creer`, `terminer`, `relancer`, `liste`, `stats`, `supprimer`) |
| 🎭 Rôles & embeds | `/rolepanel` `/embed` `/role` |
| 🎉 Communauté & animation | `/sondage` `/suggestion` `/anniversaire` `/compte-a-rebours` `/niveau` `/tirage` |
| 💰 Économie | `/argent` (`voir`, `classement`, `donner`, `ajouter`, `retirer`, `reinitialiser`, `config`) |
| 🛠️ Configuration | `/config` `/autorole` |
| ✨ Utilitaires | `/help` `/bot-stats` `/invite` `/profil` `/avatar` `/serveur` `/roles` `/emojis` `/membres` `/invitations` `/snipe` `/rappel` `/heure` `/meteo` `/calculer` `/convertir` `/motdepasse` `/code` |
| 🎮 Mini-jeux | `/jeu` (`morpion`, `puissance4`, `pfc`, `memory`, `pendu`, `motus`, `quiz`, `demineur`, `2048`, `blackjack`, `stats`, `classement`, `liste`) |
| 🤪 Divertissement | `/des` `/8ball` `/citation` `/blague` `/pile-ou-face` `/duel` |
| 👑 Propriétaire | `/owner` (`statut`, `serveurs`, `quitter`, `diffuser`, `recharger`, `commandes`, `activite`, `nettoyer`) |

---

## 🎭 Guide : panneau de rôles avec image

```bash
# Panneau complet en une commande (image jointe depuis votre PC !)
/rolepanel creer \
  salon:#rôles \
  titre:🎭 Choisis tes rôles \
  roles:🎮 @Gamer | 🎨 @Artiste | 🎵 @Musique | 🔔 @Notifications \
  description:Clique sur un bouton pour recevoir ou retirer un rôle. \
  image:<glissez votre bannière 1024×512> \
  couleur:#8b5cf6 \
  comportement:choix unique
```

* `roles:` accepte `émoji @Rôle` séparés par `|`.
* `styles:` (ex. `primary,success,danger`) colore les boutons dans l'ordre.
* Le bot **vérifie la hiérarchie** : son rôle doit être au-dessus des rôles distribués (sinon il vous le dit clairement).
* Gestion ensuite : `/rolepanel ajouter`, `/rolepanel retirer`, `/rolepanel modifier`, `/rolepanel publier`, `/rolepanel apercu`, `/rolepanel liste`, `/rolepanel supprimer`.
* Création guidée avec aperçu privé : `/embed creer` (modale, choix des rôles, bascule boutons/menu, couleurs, publication).

---

## 🎁 Guide : giveaway en 30 secondes

```bash
/giveaway creer lot:Nitro 1 mois duree:3j gagnants:2 salon:#giveaways \
  roles_requis:@Membre age_compte:7 roles_bonus:123456789:3 ping:@Annonces image:https://…/banniere.png
```

* Réservé aux **administrateurs** et aux rôles hôtes (`/config roles-hotes action:ajouter role:@Animateur`).
* Terminer avant l'heure : `/giveaway terminer identifiant:1` — Nouveau tirage : `/giveaway relancer identifiant:1`.
* Les tickets bonus pondèrent le tirage (un membre avec `+3` a 4 fois plus de chances).

---

## 🗂️ Structure du projet

```
elysia-bot/
├── src/
│   ├── index.ts                 # Entrée : base, client, serveur web, planificateur
│   ├── core/                    # Client Discord, config, base JSON, erreurs, loaders
│   ├── commands/                # 52 slash-commands classées par catégorie
│   │   ├── moderation/          #   ban, kick, mute, warn, purge, lock, note, vocal…
│   │   ├── giveaways/           #   giveaway
│   │   ├── roles/               #   rolepanel, embed, role
│   │   ├── community/           #   sondage, suggestion, anniversaire, niveau…
│   │   ├── config/              #   config, autorole
│   │   ├── utility/             #   help, profil, rappel, calculer, convertir…
│   │   ├── games/               #   jeu (10 mini-jeux + stats + classement)
│   │   ├── fun/                 #   des, 8ball, citation, blague, duel…
│   │   └── owner/               #   owner
│   ├── games/                   # Mini-jeux : moteurs purs (engine/), rendu Discord (ui/), contenu (content/)
│   ├── modules/                 # Interactions : boutons, menus, modales, confirmations, mini-jeux
│   ├── fun/                     # Contenus de divertissement (citations, blagues, duels)
│   ├── services/                # Modération, cases, giveaways, panneaux, logs, jeux, XP, rappels, sondages, planificateur
│   ├── ui/                      # Embeds, composants, thème, images
│   ├── utils/                   # Durées, formatage, aléatoire, permissions, calcul, unités, dés, codecs, fuseaux
│   └── web/                     # Serveur HTTP : pages HTML (pages.ts/ui.ts), API JSON, auto-ping, dry-run
├── scripts/                     # validate.ts, deploy-commands.ts, self-test.ts, games-fuzz.ts
├── docs/                        # Tutoriels (Render + UptimeRobot, commandes, dépannage)
├── data/                        # Base JSON (générée, ignorée par Git)
├── assets/panels/               # Images d'illustration (générées, ignorées par Git)
├── render.yaml                  # Déploiement Render en un clic
└── Dockerfile                   # Déploiement Docker / VPS / Koyeb / Fly.io
```

### Site web intégré

Six pages HTML autonomes (aucune CDN, aucun build front) accessibles dès que le bot tourne :

| Page | Contenu |
|---|---|
| `/` | **Tableau de bord** : latence, uptime, mémoire, serveurs, giveaways, panneaux, XP, suggestions, sondages, cases, planificateur interne et volumétrie de la base JSON |
| `/commandes` | **Catalogue des commandes** : recherche, filtre par catégorie, options, exemples d'usage, permissions, cooldowns |
| `/jeux` | **Classements des mini-jeux** : top par serveur, victoires/défaites/nuls, meilleures séries, catalogue des 10 jeux |
| `/economie` | **Classement des fortunes** 💰 : argent en circulation, top des portefeuilles, gagné en discutant, bilan casino, volume misé |
| `/communaute` | **Vie communautaire** : niveaux & barres de progression, suggestions et votes, sondages en cours/terminés, anniversaires, comptes à rebours |
| `/donnees` | **Données internes** (protégé par `DASHBOARD_TOKEN`) : sanctions actives, notes du staff, journaux en direct |

> 🔒 Avec `DASHBOARD_TOKEN`, la page `/donnees` reste consultable mais affiche un bouton **« Jeton du tableau de bord »** : le jeton est stocké dans le navigateur puis envoyé dans l'en-tête `x-dashboard-token`.

### API JSON

| Route | Rôle |
|---|---|
| `/health` | Health-check JSON — **l'endpoint à mettre dans UptimeRobot** (alias : `/api/health`, `/ping`, `/keepalive`) |
| `/api` | Index de toutes les routes disponibles |
| `/api/stats` | Statistiques complètes (Discord, services, base JSON, planificateur) |
| `/api/commands` | Catalogue des commandes (catégories, options, usage, permissions) |
| `/api/games` | Mini-jeux : joueurs, points, parties jouées, sessions en cours |
| `/api/leaderboard` | Classement des mini-jeux d'un serveur — `?guild=&game=&limit=` |
| `/api/economy` | Classement des fortunes et agrégats économiques — `?guild=&limit=` |
| `/api/community` | Niveaux, suggestions, sondages, anniversaires, comptes à rebours — `?guild=&limit=` |
| `/api/giveaways` | Concours en cours et terminés (participants, gagnants) |
| `/api/panels` | Panneaux de rôles publiés |
| `/api/scheduler` | Tâches planifiées (fréquence, exécutions, erreurs) |
| `/api/cases` 🔒 | Sanctions récentes — `?guild=&limit=` |
| `/api/notes` 🔒 | Notes du staff agrégées par membre |
| `/api/reminders` 🔒 | Rappels en attente |
| `/api/logs` 🔒 | 400 dernières lignes de journal (`{time, level, scope, message}`) |
| `/metrics` | Métriques format Prometheus (`elysia_up`, `elysia_guilds`, `elysia_xp_total`, `elysia_money_total`…) |
| `/robots.txt` | Exclusion des robots d'indexation sur `/api/` et `/donnees` |

🔒 = exige l'en-tête `x-dashboard-token` (ou `?token=…`) quand `DASHBOARD_TOKEN` est défini.

### Scripts npm

| Commande | Description |
|---|---|
| `npm run dev` | Développement avec rechargement automatique (tsx watch) |
| `npm run build` | Compilation TypeScript → `dist/` |
| `npm start` | Démarrage en production (utilisé par Render) |
| `npm run typecheck` | Vérification des types sans compiler |
| `npm run validate` | Diagnostic complet avant déploiement (token, permissions, dossiers) |
| `npm run self-test` | Auto-test métier hors ligne (308 contrôles : durées, base JSON, calcul, unités, dés, codecs, services, mini-jeux, aide, pages et API du site) |
| `npm run fuzz:games` | Fuzzing des mini-jeux : des millions de contrôles sur un faux Discord, limites de l'API et invariants (≈ 1 min ; `FUZZ_ROUNDS=25` pour un passage intensif, `FUZZ_SEED` pour rejouer un échec) |
| `npm run deploy:commands` | Publie/rafraîchit les slash-commands (`-- --clear` pour tout réinitialiser) |
| `npm run preview` | Mode démonstration : tableau de bord sans connexion Discord (`DRY_RUN=1`) |

---

## 🩺 Dépannage express

| Symptôme | Solution |
|---|---|
| `DISCORD_TOKEN manquant` | Créez `.env` à partir de `.env.example` et collez le token |
| `Invalid token` / `401` | Token révoqué ou mal copié → **Reset Token** puis `npm run validate` |
| Les commandes n'apparaissent pas | Renseignez `DEV_GUILD_ID` (publication instantanée) ou attendez jusqu'à 1 h ; CTRL+R sur Discord |
| Les commandes apparaissent **en double** | Vous êtes en `COMMANDS_SCOPE=both` : passez à `auto` (une seule portée), puis lancez `/owner commandes` ou redémarrez le bot — l'autre portée est nettoyée automatiquement |
| `Missing Permissions` | Le rôle du bot doit être **au-dessus** des rôles gérés + permission manquante |
| Les panneaux ne donnent pas les rôles | `/config salut` ou `/rolepanel apercu` → diagnostics automatiques |
| Le bot s'endort sur Render | Configurez UptimeRobot sur `/health` (voir tutoriel) |
| Build Render : `error TS5108` (`moduleResolution=node10`) | `tsconfig.json` sans `moduleResolution` + Build Command `npm ci --include=dev && npm run build` |

👉 Toutes les causes et solutions : **[docs/DEPANNAGE.md](docs/DEPANNAGE.md)**

---

## ❓ FAQ

<details>
<summary>Le bot est-il vraiment hébergeable gratuitement ?</summary>

Oui : le plan **Free** de Render suffit (512 Mo de RAM, service web Node). Il met le service en veille après ~15 minutes sans trafic **entrant** : un moniteur UptimeRobot de 5 minutes le maintient éveillé. Limites : stockage éphémère (voir ci-dessous), temps de démarrage après un redéploiement, et un seul service gratuit par compte.
</details>

<details>
<summary>Mes données (cases, giveaways, panneaux) survivent-elles à un redéploiement ?</summary>

La base est un fichier JSON dans `data/`. **Sur Render (plan gratuit), le système de fichiers est éphémère** : un redéploiement ou une mise en veille longue peut réinitialiser les données.
Solutions : (1) ajouter un **Render Disk** (payant, ~1 $/mois) monté sur `/opt/render/project/src/data` ; (2) exporter régulièrement (`/cases exporter`) ; (3) héberger sur un VPS/Oracle Cloud Always Free avec le `Dockerfile` fourni (données conservées via le volume `/app/data`).
</details>

<details>
<summary>Pourquoi mon panneau ne distribue-t-il pas certains rôles ?</summary>

Discord interdit à un bot de gérer un rôle **supérieur ou égal au sien**. Paramètres du serveur → Rôles → glissez le rôle d'Elysia **au-dessus** des rôles concernés. `/config salut` et `/rolepanel apercu` listent précisément les rôles problématiques.
</details>

<details>
<summary>Comment changer le préfixe des commandes ?</summary>

Elysia n'utilise que des **slash-commands** (`/`) : c'est plus propre, autocomplété et sécurisé par Discord. Aucun préfixe texte à gérer.
</details>

<details>
<summary>Puis-je ajouter mes propres commandes ?</summary>

Oui : créez un fichier dans `src/commands/<catégorie>/ma-commande.ts` qui exporte par défaut un objet `Command` (`data` = `SlashCommandBuilder`, `run` = fonction recevant le contexte). Il est chargé automatiquement au démarrage — aucun enregistrement manuel.
</details>

---

## 📄 Licence & crédits

Projet distribué sous licence **MIT** (voir [LICENSE](LICENSE)).
Construit avec [discord.js](https://discord.js.org) et ❤️ pour les communautés francophones.
