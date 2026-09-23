# 🩺 Dépannage — Elysia

Guide de résolution des problèmes les plus fréquents, classés par symptôme.
En cas de doute : **`/config salut`** dans Discord et **`npm run validate`** en local répondent à 80 % des questions.

---

## 🔌 Démarrage & connexion

### `❌ DISCORD_TOKEN manquant`
Le fichier `.env` est absent ou la variable n'est pas définie.
```bash
cp .env.example .env      # puis éditez .env
```
Sur Render : **Environment** → ajoutez `DISCORD_TOKEN` → **Save Changes**.

### `TokenInvalid` / `HTTP 401 Unauthorized`
Token révoqué, tronqué, ou entouré de guillemets/espace.
1. Developer Portal → **Bot** → **Reset Token** → **Copy**.
2. Collez **sans guillemets**, sans espace, sur **une seule ligne**.
3. Vérifiez : `npm run validate` (le script teste réellement le token auprès de Discord).

### `Used disallowed intents` / `Privileged intent provided is not enabled`
Developer Portal → **Bot** → *Privileged Gateway Intents* : activez **SERVER MEMBERS INTENT** et **MESSAGE CONTENT INTENT**, puis **Save Changes** et redémarrez.

### `Démarrage impossible [{}]` (aucun détail après le message)
Ancien bug de journalisation : le vrai message de l'erreur était masqué. Il s'affiche désormais, par ex. `{"name":"Error","message":"Used disallowed intents"}` → voir la section ci-dessus.

### `Publication des commandes impossible` — `Missing Access` (50001 / 403)
L'URL en cause se termine par `guilds/<id>/commands` : c'est la publication sur `DEV_GUILD_ID` qui échoue. Trois causes possibles :
1. **Le bot n'est pas sur ce serveur** (ou `DEV_GUILD_ID` est erroné) → mode développeur Discord → clic droit sur le serveur → *Copier l'identifiant du serveur*, et vérifiez que le bot en est membre.
2. **Le bot a été invité sans le scope `applications.commands`** → réinvitez-le via *OAuth2 → URL Generator* avec les scopes `bot` **et** `applications.commands`.
3. **`CLIENT_ID` ne correspond pas à l'application du token** → Developer Portal → *General Information* → *Application ID*.

> Le bot **bascule alors en publication globale** (il ne reste jamais sans commandes) et le signale dans les logs. Seule la publication instantanée sur ce serveur est perdue. Vérifiez ensuite `/owner commandes` : la portée utilisée y est affichée.

### `Cannot find module 'discord.js'`
Dépendances non installées : `npm install` (ou `npm ci`).

### Le bot démarre mais `ready: false` indéfini sur `/health`
La connexion à Discord n'est pas encore terminée (ou a échoué). Regardez les logs :
```bash
LOG_LEVEL=debug npm run dev
```
Recherchez `Connectée en tant que` — s'il n'apparaît pas, l'erreur de login est juste au-dessus.

### `ERR_REQUIRE_ESM` / `Cannot use import statement outside a module`
Vous avez lancé un fichier TypeScript directement avec `node`. Utilisez :
```bash
npm run dev        # tsx
npm run build && npm start   # compilation puis exécution
```

---

## 🧭 Slash-commands invisibles ou obsolètes

| Cause | Solution |
|---|---|
| Publication **globale** en cours (jusqu'à 1 h) | Définissez `DEV_GUILD_ID` (votre serveur) → publication instantanée |
| Client Discord en cache | `Ctrl + R` (ou redémarrer l'application) |
| Bot invité sans le scope `applications.commands` | Réinvitez-le avec **OAuth2 → URL Generator** : `bot` + `applications.commands` |
| `403 Missing Access` sur `guilds/<id>/commands` | Bot absent du serveur `DEV_GUILD_ID`, scope `applications.commands` manquant, ou `CLIENT_ID` erroné (voir *Démarrage & connexion*) |
| Commande renommée/supprimée | `/owner recharger` ou `npm run deploy:commands -- --clear` |
| `CLIENT_ID` erroné | Developer Portal → General Information → Application ID |
| **Chaque commande apparaît en double** | Publier la même commande à la fois en global et sur un serveur la fait afficher **deux fois** (section « Commandes de serveur » + section globale). Passez `COMMANDS_SCOPE=auto` (défaut : une seule portée) puis `/owner commandes` — les doublons sont supprimés et l'autre portée nettoyée. `Ctrl+R` sur Discord pour rafraîchir |
| Commandes présentes seulement sur le serveur de test | `COMMANDS_SCOPE=guild` (ou `auto` avec `DEV_GUILD_ID` et un seul serveur) ne publie que sur ce serveur : passez à `auto`/`global` pour tous les serveurs |
| Commandes fantômes après un renommage | `npm run deploy:commands -- --clear`, puis redémarrez le bot |

---

## 🤖 Permissions & hiérarchie des rôles

### `Missing Permissions` sur une sanction ou un panneau
Trois vérifications :
1. **Permission du bot** : `/config salut` liste précisément ce qui manque (*Paramètres du serveur → Rôles → rôle d'Elysia*).
2. **Position du rôle** : le rôle du bot doit être **au-dessus** des rôles qu'il gère. *Paramètres du serveur → Rôles* : glissez « Elysia » haut dans la liste (juste sous les rôles d'administration).
3. **Position de l'auteur** : vous ne pouvez pas sanctionner quelqu'un dont le rôle est ≥ au vôtre (sauf propriétaire du serveur).

### Le panneau de rôles s'affiche mais les boutons ne donnent rien
`/rolepanel apercu panneau:<id>` affiche en bas de l'embed la liste des rôles **non attribuables** (gérés par une intégration ou trop hauts).
Corrections : remonter le rôle du bot, ou choisir d'autres rôles.

### `Le rôle muet configuré n'existe plus`
`/config role-muet creer:true` recrée un rôle `Muted` propre et réapplique les permissions sur tous les salons textuels.

### Le bot ne peut pas écrire dans un salon (logs manquants)
`/config salut` liste les salons inaccessibles. Vérifiez *Modifier le salon → Permissions → Elysia → Envoyer des messages + Intégrer des liens*.

---

## 🎁 Giveaways

| Symptôme | Explication / solution |
|---|---|
| « Les giveaways sont réservés aux administrateurs » | Ajoutez un rôle hôte : `/config roles-hotes action:ajouter role:@Animateur` |
| Le bouton **Participer** refuse un membre | Conditions du giveaway : rôles requis, âge de compte, ancienneté, blacklist. `/config blacklist` pour vérifier |
| Aucun gagnant annoncé | Zéro participation valide, ou les participants ont quitté le serveur |
| Le tirage semble figé | Le message se rafraîchit toutes les 2 minutes ; le tirage lui-même est automatique à l'échéance exacte |
| Les gagnants ne sont pas mentionnés | Permission *Mentionner @everyone / tous les rôles* ou le salon est configuré sans notification |
| Giveaway « fantôme » après suppression du salon | `/giveaway supprimer identifiant:<n>` ou `/owner nettoyer` |

**Astuce équité :** les tickets bonus (`roles_bonus`) multiplient les chances — documentez-les dans la description pour que les membres comprennent le tirage.

---

## ☁️ Déploiement Render

| Symptôme | Solution |
|---|---|
| `Deploy failed` sur `npm ci` | `package-lock.json` manquant/désynchronisé → en local : `npm install`, commit, push |
| Build : `error TS5108 … 'moduleResolution=node10' has been removed` | Un TypeScript ≥ 7 a compilé à la place de celui du projet : retirez `"moduleResolution"` de `tsconfig.json` (déjà fait) **et** utilisez `npm ci --include=dev && npm run build` comme Build Command |
| Build : `tsc: command not found` | `NODE_ENV=production` fait sauter les dépendances de dev (`typescript`, `tsx`) → `npm ci --include=dev` |
| Build OK mais service en échec | Ouvrez **Logs** : 90 % du temps il s'agit de `DISCORD_TOKEN` absent ou d'un intent désactivé |
| `502 Bad Gateway` | Le conteneur redémarre. Patientez 1 min ; si persistant, cherchez l'erreur dans les Logs |
| « No open ports detected » | Vous avez défini `PORT` manuellement : **supprimez** la variable, Render l'injecte lui-même |
| Le service s'endort | Réglé par UptimeRobot sur `/health` toutes les 5 min → [tutoriel](DEPLOIEMENT-RENDER-UPTIMEROBOT.md#7-configurer-uptimerobot-le-bot-ne-sendort-plus-jamais) |
| Redéploiement à chaque push non désiré | Render → Settings → **Auto-Deploy** = `No` |
| Données perdues après redéploiement | Le plan gratuit a un système de fichiers **éphémère** → voir [Persistance](DEPLOIEMENT-RENDER-UPTIMEROBOT.md#10-persistance-des-données-point-crucial) |
| Build très lent (>5 min) | Normal au premier build (installation des dépendances). Les suivants utilisent le cache |
| `Out of memory (512 Mo)` | Réduisez les messages en cache (`src/core/client.ts`), passez `LOG_LEVEL=warn`, ou limitez le nombre de serveurs |

### Vérifier la santé du service à distance
```bash
curl -s https://VOTRE-SERVICE.onrender.com/health
# {"status":"ok","ok":true,"message":"pong","ready":true,"uptimeMs":…,"latencyMs":42}
```
`ready:true` = bot connecté à Discord. `ready:false` avec `status:ok` = serveur web vivant mais bot déconnecté (regardez les logs).

### Tester un déploiement sans risque
Ajoutez `DRY_RUN=1` aux variables d'environnement : le serveur web, le tableau de bord et les données de démonstration démarrent **sans connexion Discord**. Retirez la variable pour passer en production.

### Explorer le site intégré (6 pages + API JSON)
```bash
# Pages HTML (aucune ressource externe, affichables dans une iframe)
open https://VOTRE-SERVICE.onrender.com/            # tableau de bord
open https://VOTRE-SERVICE.onrender.com/commandes   # catalogue des 53 commandes
open https://VOTRE-SERVICE.onrender.com/jeux        # classements des mini-jeux
open https://VOTRE-SERVICE.onrender.com/communaute  # niveaux, sondages, suggestions…
open https://VOTRE-SERVICE.onrender.com/donnees     # cases, notes du staff, journaux

# API JSON
curl -s https://VOTRE-SERVICE.onrender.com/api | head -40
curl -s "https://VOTRE-SERVICE.onrender.com/api/leaderboard?limit=5" | head -40
curl -s -H "x-dashboard-token: VOTRE_JETON" https://VOTRE-SERVICE.onrender.com/api/logs
```

| Symptôme | Solution |
|---|---|
| `/api/logs`, `/api/cases`, `/api/notes` ou `/api/reminders` répond `401 Jeton du tableau de bord requis` | Comportement voulu dès que `DASHBOARD_TOKEN` est défini : ajoutez `-H "x-dashboard-token: VOTRE_JETON"` (ou `?token=…`). Pour libérer l'accès, videz la variable |
| La page `/donnees` reste vide avec un message « jeton » | Cliquez sur **🔑 Jeton du tableau de bord**, collez votre jeton : il est mémorisé dans le navigateur puis envoyé à chaque requête |
| Les pages s'affichent mais tous les compteurs sont à zéro | Vérifiez `/api/stats` : `ready:false` = bot déconnecté de Discord ; `guilds: []` = le bot n'est sur aucun serveur |
| Une page reste sur « Chargement… » | L'API est bloquée par un proxy ou le service redémarre : ouvrez la console du navigateur, puis testez `curl -s https://VOTRE-SERVICE.onrender.com/api/stats` |

---

## 💾 Données & persistance

| Symptôme | Solution |
|---|---|
| Cases/giveaways/panneaux disparus | `data/` est éphémère sur le plan gratuit → sauvegardez via `/cases exporter`, ou utilisez un Render Disk / un hébergement persistant |
| `Collection « … » illisible, réinitialisation` dans les logs | Fichier JSON corrompu (arrêt brutal pendant une écriture). Les écritures sont atomiques ; restaurez une sauvegarde si nécessaire |
| Où sont mes fichiers ? | `data/cases.json`, `data/giveaways.json`, `data/panels.json`, `data/guilds.json` • images : `assets/panels/` |
| Sauvegarder manuellement | Arrêtez le bot (Ctrl+C, la sauvegarde est automatique), copiez `data/` et `assets/panels/` |
| Restaurer | Replacez les fichiers aux mêmes emplacements **avant** de démarrer le bot |

---

## 🎨 Panneaux & images

| Symptôme | Solution |
|---|---|
| L'image ne s'affiche pas | Format accepté : PNG, JPG, JPEG, GIF, WEBP (8 Mo max). Un fichier `.avif`, `.svg` ou un PDF est refusé (message explicite) |
| L'image a disparu après quelques jours (URL) | Discord purge les liens de pièces jointes ; utilisez **`/embed image`** (upload) qui stocke le fichier localement |
| Le panneau a perdu ses boutons après un redémarrage | `/rolepanel publier panneau:<id>` republie le message et reconnecte les interactions |
| « Ce brouillon a expiré » (`/embed creer`) | Les aperçus expirent après 20 minutes : relancez la commande |
| Trop de rôles dans un panneau | Maximum 25 rôles, 5 boutons par ligne (limite Discord) |
| `styles:` sans effet | Le nombre de couleurs doit correspondre aux rôles, ou une seule couleur s'applique à tous |

---

## 🔇 Mute & sanctions automatiques

| Symptôme | Solution |
|---|---|
| « Le mode timeout est limité à 28 jours » | Normal : limite Discord. Utilisez `mode:role` (rôle muet) ou `/ban` |
| Le mute n'expire pas tout seul (mode rôle) | Le planificateur lève la sanction toutes les 60 s ; vérifiez que le bot est bien en ligne et que `autoRevertAt` est enregistré (case active dans `/cases detail`) |
| Le membre peut encore écrire malgré le rôle muet | Le rôle `Muted` doit avoir *Envoyer des messages* désactivé sur **chaque salon** → `creer:true` réapplique les permissions automatiquement |
| Aucune sanction automatique à 3 avertissements | Vérifiez `/config seuils` et le nombre d'avertissements **actifs** (`/sanctions`) |
| Seuil déclenché trop tôt | Les avertissements supprimés (`/cases supprimer`) ne comptent plus ; vérifiez avec `/sanctions detaille:true` |

---

## 🧪 Diagnostic avancé

```bash
# 1. Contrôle complet avant déploiement
npm run validate

# 2. Auto-test métier (aucune connexion Discord requise)
npm run self-test

# 3. Logs détaillés (affiche aussi les tâches planifiées et les rate-limits Discord)
LOG_LEVEL=debug LOG_FORMAT=pretty npm run dev

# 4. État interne du bot dans Discord
/owner statut      # mémoire, base, tâches, compteurs  [Owner]

# 5. Santé du serveur Discord
/config salut      # permissions, salons, hiérarchie   [Admin]

# 6. Métriques Prometheus (Grafana, Uptime Kuma…)
curl -s http://localhost:3000/metrics
```

### Erreurs fréquentes et leur signification

| Erreur | Signification |
|---|---|
| `Unknown interaction` | L'action a dépassé 3 s (rare : le bot diffère automatiquement ses réponses) |
| `Missing Access` | Le bot n'est pas dans le salon / n'a pas accès à la ressource |
| `Unknown Message` | Le message ciblé a été supprimé (souvent un log ou un panneau republié) |
| `rate limit` | Discord limite temporairement : le bot réessaie automatiquement (3 tentatives) |
| `DiscordAPIError[50013]` | Permissions insuffisantes pour l'action demandée |
| `DiscordAPIError[50035]` | Payload invalide — souvent une image trop lourde ou un émoji non valide |

---

## 📣 Obtenir de l'aide

1. Reproduisez le problème avec `LOG_LEVEL=debug`.
2. Notez : la commande exacte, le message d'erreur complet, la version (`/bot-stats`).
3. Ouvrez une **issue** sur le dépôt GitHub en joignant ces éléments (⚠️ **supprimez toute trace de votre token** avant de publier des logs).
