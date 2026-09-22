# ☁️ Déployer Elysia gratuitement sur Render + la garder éveillée avec UptimeRobot

> **Objectif de ce tutoriel :** mettre votre bot Discord en ligne 24 h/24 sans carte bancaire,
> puis empêcher Render de l'endormir grâce à un moniteur UptimeRobot gratuit.
>
> ⏱️ **Durée :** 15 à 20 minutes • 💳 **Coût :** 0 € • 🧠 **Prérequis :** un compte Discord, GitHub, Render et UptimeRobot (tous gratuits).

---

## 📑 Sommaire

1. [Comprendre l'architecture](#1-comprendre-larchitecture)
2. [Préparer le bot Discord](#2-préparer-le-bot-discord-token-client_id-et-permissions)
3. [Mettre le code sur GitHub](#3-mettre-le-code-sur-github)
4. [Déployer sur Render (méthode Blueprint)](#4-déployer-sur-render--méthode-blueprint-recommandée)
5. [Déployer sur Render (méthode manuelle)](#5-déployer-sur-render--méthode-manuelle)
6. [Vérifier que le déploiement a réussi](#6-vérifier-que-le-déploiement-a-réussi)
7. [Configurer UptimeRobot](#7-configurer-uptimerobot-le-bot-ne-sendort-plus-jamais)
8. [Configurer le bot dans Discord](#8-configurer-le-bot-dans-discord)
9. [Mettre à jour le bot](#9-mettre-à-jour-le-bot)
10. [Persistance des données](#10-persistance-des-données-point-crucial)
11. [Dépannage](#11-dépannage)
12. [Alternatives gratuites](#12-alternatives-gratuites)
13. [Checklist finale](#13-checklist-finale)

---

## 1. Comprendre l'architecture

```
   ┌────────────────┐   ping HTTP toutes les 5 min   ┌──────────────────────────┐
   │  UptimeRobot   │ ─────────────────────────────► │  Render (plan Free)      │
   │  (moniteur)    │ ◄───────────────────────────── │  Elysia                  │
   └────────────────┘       200 OK sur /health       │  • bot Discord (WebSocket)│
                                                     │  • serveur web intégré    │
   ┌────────────────┐                                │  • base JSON dans data/   │
   │ Discord        │ ◄────── commandes & événements ┤                          │
   └────────────────┘                                └──────────────────────────┘
```

Deux points importants :

* **Render n'endort que les services sans trafic _entrant_**. Le bot connecté à Discord génère du trafic *sortant* (WebSocket) : cela **ne suffit pas** à empêcher la mise en veille. D'où UptimeRobot, qui frappe `/health` toutes les 5 minutes.
* Elysia lance **son propre serveur web** (aucune configuration supplémentaire) : il fournit le health-check, un tableau de bord et des métriques.

---

## 2. Préparer le bot Discord (token, CLIENT_ID et permissions)

1. Ouvrez <https://discord.com/developers/applications> puis **New Application** → nommez-la `Elysia` (ou ce que vous voulez) → **Create**.

2. Onglet **General Information** → copiez **Application ID**. C'est votre `CLIENT_ID`. *(Il ressemble à `1234567890123456789`.)*

3. Onglet **Bot** :
   * Cliquez **Reset Token** → **Yes, do it!** → **Copy**.
     ⚠️ Ce token est un **mot de passe** : ne le partagez jamais, ne le mettez jamais dans un dépôt Git public.
   * Descendez dans **Privileged Gateway Intents** et activez :
     * ✅ **SERVER MEMBERS INTENT** (arrivées/départs, rôles)
     * ✅ **MESSAGE CONTENT INTENT** (logs de messages supprimés/édités)
     * ⬜ Presence Intent (inutile pour Elysia — laissez désactivé pour économiser des ressources)
   * Cliquez **Save Changes**.

4. Invitez le bot sur votre serveur :
   * Onglet **OAuth2 → URL Generator**.
   * **Scopes :** `bot` et `applications.commands`.
   * **Bot Permissions :** cochez **Administrator** (le plus simple : Elysia a besoin de gérer rôles, salons, sanctions et timeout).
   * Copiez l'**Generated URL** en bas, ouvrez-la dans votre navigateur, choisissez votre serveur → **Autoriser**.

   > 🔒 Vous préférez éviter Administrator ? Cochez au minimum : *View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Manage Messages, Manage Roles, Manage Channels, Manage Nicknames, Moderate Members, Kick Members, Ban Members, Manage Server, Add Reactions, Use External Emojis*.
   > Puis vérifiez avec `/config salut` une fois le bot en ligne.

5. Récupérez votre **identifiant Discord personnel** (pour `OWNER_IDS`) : Discord → *Paramètres utilisateur → Avancés → Mode développeur ✅* → clic droit sur votre profil → **Copier l'identifiant**.

Au final vous devez avoir :

```
DISCORD_TOKEN = MTIzNDU2Nzg5…        (très long, jamais partagé)
CLIENT_ID     = 1234567890123456789
OWNER_IDS     = 987654321098765432   (vous)
```

---

## 3. Mettre le code sur GitHub

| Vous avez… | Ce qu'il faut faire |
|---|---|
| Un **fork** du dépôt `zxch-0/elysia-bot` | Rien à faire ✅ |
| Le code en local | Créez un dépôt **privé** sur GitHub (New repository), puis : `git remote add origin https://github.com/VOTRE-PSEUDO/elysia-bot.git && git push -u origin main` |

> ⚠️ **Ne poussez jamais votre fichier `.env`** : il est déjà listé dans `.gitignore`. Vérifiez avec `git status` avant de committer.

---

## 4. Déployer sur Render — méthode Blueprint (recommandée)

Cette méthode lit automatiquement le fichier `render.yaml` du projet (plan gratuit, health-check, variables, etc.).

1. Créez un compte sur <https://render.com> (connexion avec GitHub conseillée).
2. Dans le tableau de bord : **New +** → **Blueprint**.
3. Autorisez Render à voir vos dépôts si demandé, puis **sélectionnez votre dépôt `elysia-bot`** → **Connect**.
4. Render détecte `render.yaml` et affiche le service **elysia-bot** avec sa liste de variables. Renseignez :

   | Variable | Valeur |
   |---|---|
   | `DISCORD_TOKEN` | votre token (coller) |
   | `CLIENT_ID` | votre Application ID |
   | `DEV_GUILD_ID` | *(optionnel)* l'identifiant de votre serveur Discord de test → commandes publiées instantanément |
   | `COMMANDS_SCOPE` | *(optionnel, `auto` par défaut)* portée de publication : `auto` (une seule portée, pas de doublon), `guild`, `global` ou `both` ⚠️ (doublons) |
   | `OWNER_IDS` | votre identifiant Discord |
   | `SELF_PING_URL` | `https://elysia-bot.onrender.com` *(à ajuster après le déploiement avec l'URL réelle donnée par Render)* |

5. Cliquez **Apply** / **Create Resources**. Render lance le `Build Command` (`npm ci --include=dev && npm run build`).
6. Patientez 2 à 5 minutes : l'état passe de `Building` → `Deploying` → **`Live`** 🎉.

---

## 5. Déployer sur Render — méthode manuelle

Si vous préférez tout régler à la main :

1. **New +** → **Web Service** (⚠️ **pas** Background Worker : un worker n'a pas d'URL publique, UptimeRobot ne pourrait pas le réveiller).
2. **Connect** votre dépôt GitHub.
3. Paramètres :

   | Champ | Valeur |
   |---|---|
   | **Name** | `elysia-bot` |
   | **Region** | la plus proche de vos membres (ex. Frankfurt) |
   | **Branch** | `main` |
   | **Runtime** | `Node` |
   | **Build Command** | `npm ci --include=dev && npm run build` |
   | **Start Command** | `npm start` |
   | **Instance Type** | **Free** |
   | **Health Check Path** | `/health` |
   | **Auto-Deploy** | `Yes` |

4. **Environment → Add Environment Variable** (une par une) :

   ```
   DISCORD_TOKEN       = MTIzNDU2Nzg5…
   CLIENT_ID           = 1234567890123456789
   OWNER_IDS           = 987654321098765432
   DEV_GUILD_ID        = 1234567890123456789   (optionnel)
   NODE_VERSION        = 22.11.0
   LOG_LEVEL           = info
   LOG_FORMAT          = json
   HOST                = 0.0.0.0
   SELF_PING_URL       = https://elysia-bot.onrender.com
   SELF_PING_INTERVAL  = 14
   ```

   > **Ne définissez pas `PORT`** : Render l'injecte automatiquement et Elysia l'utilise.

5. **Create Web Service** → attendez l'état **Live**.

---

## 6. Vérifier que le déploiement a réussi

1. **Onglet Logs** de votre service : vous devez voir (format JSON si `LOG_FORMAT=json`) :

   ```
   {"level":"success","scope":"database","message":"Base de données prête (4 collection(s))…"}
   {"level":"success","scope":"loader","message":"21 commande(s) chargée(s)…"}
   {"level":"success","scope":"modules","message":"6 modules d'interaction chargés…"}
   {"level":"success","scope":"web","message":"Serveur web à l'écoute sur http://0.0.0.0:10000"}
   {"level":"success","scope":"publisher","message":"21 commande(s) publiée(s)…"}
   {"level":"success","scope":"events","message":"Connectée en tant que Elysia#1234 — 1 serveur(s)"}
   {"level":"success","scope":"scheduler","message":"4 tâches planifiées…"}
   ```

2. Ouvrez l'URL du service dans votre navigateur :

   * `https://VOTRE-SERVICE.onrender.com/health` → `{"status":"ok","ready":true,…}`
   * `https://VOTRE-SERVICE.onrender.com/` → **tableau de bord** (latence, serveurs, mémoire, giveaways actifs).
   * `https://VOTRE-SERVICE.onrender.com/commandes` → catalogue des 52 commandes, filtrable.
   * `https://VOTRE-SERVICE.onrender.com/jeux` → classements des mini-jeux par serveur.
   * `https://VOTRE-SERVICE.onrender.com/communaute` → niveaux, suggestions, sondages, anniversaires.
   * `https://VOTRE-SERVICE.onrender.com/donnees` → sanctions, notes du staff et journaux (exige `DASHBOARD_TOKEN` s'il est défini).
   * `https://VOTRE-SERVICE.onrender.com/api` → index JSON de toutes les routes.

3. Dans Discord, tapez `/help` : les commandes doivent apparaître.
   * Si elles n'apparaissent pas tout de suite : définissez `DEV_GUILD_ID` puis **Manual Deploy → Clear build cache & deploy** (publication instantanée sur ce serveur), ou attendez jusqu'à 1 heure (publication globale).
   * Si elles apparaissent **en double** : laissez `COMMANDS_SCOPE=auto` (ou `guild`/`global`). Avec `both`, Discord affiche chaque commande deux fois sur le serveur de développement ; `/owner commandes` nettoie les doublons à chaud.

4. Mettez à jour `SELF_PING_URL` avec l'URL réelle si ce n'est pas déjà fait, puis **Save Changes** (Render redéploie automatiquement).

---

## 7. Configurer UptimeRobot (le bot ne s'endort plus jamais)

Render met un service gratuit en veille après **~15 minutes sans requête entrante**. Un moniteur UptimeRobot toutes les 5 minutes le maintient éveillé — et vous prévient par e-mail si le bot tombe.

1. Créez un compte gratuit sur <https://uptimerobot.com> (**Sign Up**).
2. Dans le tableau de bord : **+ Add New Monitor**.
3. Remplissez (voir tableau ci-dessous) :

   | Champ | Valeur |
   |---|---|
   | **Monitor Type** | `HTTP(s)` |
   | **Friendly Name** | `Elysia Bot` |
   | **URL (or IP)** | `https://VOTRE-SERVICE.onrender.com/health` |
   | **Monitoring Interval** | `5 minutes` *(le minimum gratuit est de 5 min — parfait)* |
   | **Monitor Timeout** | `30 seconds` |
   | **Alert Contacts** | ✅ cochez votre e-mail (créez-en un si la liste est vide) |

4. **Create Monitor**. Après quelques minutes, l'état doit passer à **Up** 🟢 avec un temps de réponse de quelques centaines de ms.

5. *(Optionnel mais recommandé)* Ajoutez un second moniteur :
   * **Type :** `Keyword`
   * **URL :** `https://VOTRE-SERVICE.onrender.com/health`
   * **Keyword Type :** `exists` — **Keyword :** `"ready":true`
   * Ainsi, vous serez alerté si le serveur répond mais que **le bot est déconnecté de Discord**.

### Ce qu'il faut savoir

| Point | Détail |
|---|---|
| Fréquence minimale gratuite | 5 minutes (suffisant : le seuil de veille Render est de 15 min) |
| Nombre de moniteurs gratuits | 50 |
| Alertes | E-mail, Telegram, Discord (webhook), Slack… |
| Réveil après veille | Le premier ping après une veille peut prendre 30 à 60 s (Render démarre le conteneur) |
| Alternative à UptimeRobot | [Better Stack](https://betterstack.com), [Cron-job.org](https://cron-job.org) (tâche HTTP toutes les 5 min), [Healthchecks.io], ou l'**auto-ping interne** intégré (`SELF_PING_URL`) |
| Auto-ping interne | Elysia sait s'auto-pinguer (`SELF_PING_URL` + `SELF_PING_INTERVAL`) : pratique, mais **un ping interne ne compte pas comme trafic entrant** pour Render. Gardez UptimeRobot comme solution principale. |

> 💡 **Astuce Discord :** dans UptimeRobot, *Integrations & API → Add Alert Contact → Discord webhook* : vous recevrez une notification dans un salon Discord en cas de panne (Discord → Paramètres du salon → Intégrations → Webhooks → Copier l'URL).

---

## 8. Configurer le bot dans Discord

Connectez-vous sur votre serveur et lancez, dans cet ordre :

```bash
# 1. Diagnostic : vérifie permissions, salons et hiérarchie des rôles
/config salut

# 2. Configuration guidée (salons de logs, bienvenue, rôle muet, staff, hôtes)
/config convivialite \
   logs_moderation:#logs-bot \
   logs_messages:#logs-bot \
   logs_membres:#arrivées \
   bienvenue:#bienvenue \
   departs:#départs \
   role_muet:@Muted \
   role_auto:@Membre \
   role_staff:@Modérateur \
   role_hote:@Animateur

# 3. Rôle muet (si vous n'en avez pas encore) : crée et configure tout
/config role-muet creer:true

# 4. Seuils de sanctions automatiques (facultatif, des valeurs par défaut existent)
/config seuils action:ajouter nombre:3 sanction:mute duree:1h
/config seuils action:ajouter nombre:5 sanction:mute duree:1j
/config seuils action:ajouter nombre:7 sanction:ban

# 5. Premier panneau de rôles avec image (glissez une bannière dans le champ image)
/rolepanel creer salon:#rôles titre:🎭 Choisis tes rôles \
   roles:🎮 @Gamer | 🎨 @Artiste | 🎵 @Musique | 🔔 @Notifications \
   image:<votre bannière> couleur:#8b5cf6

# 6. Premier giveaway (réservé aux admins)
/giveaway creer lot:Nitro 1 mois duree:3j gagnants:2 salon:#giveaways
```

---

## 9. Mettre à jour le bot

* **Méthode automatique** — si `autoDeploy: true` (par défaut dans `render.yaml`) : poussez vos modifications sur GitHub (`git push`), Render reconstruit et redéploie tout seul.
* **À la demande** — tableau de bord Render → votre service → **Manual Deploy** → **Deploy latest commit** (ou **Clear build cache & deploy** si une dépendance semble figée).
* **Reload des commandes sans redéployer** — dans Discord : `/owner recharger` (réservé à `OWNER_IDS`).
* **Changer une variable d'environnement** — Environment → modifiez → **Save Changes** : Render redéploie automatiquement.

---

## 10. Persistance des données (point crucial)

Les données (cases de modération, giveaways, panneaux, configuration des serveurs) sont stockées dans des fichiers JSON sous `data/`.

| Hébergement | Système de fichiers | Risque |
|---|---|---|
| **Render — plan Free** | **Éphémère** | Les données peuvent être perdues à chaque redéploiement / long arrêt |
| **Render — avec Disk** | Persistant | Nécessite un plan payant (~7 $/mois) + disque (~1 $/mois) |
| **VPS / Oracle Cloud Always Free / Docker** | Persistant | Volume Docker `/app/data` → conservez-le ! |

**Bonnes pratiques sur le plan gratuit :**

1. Exportez régulièrement : `/cases exporter` (fichier JSON téléchargeable).
2. Limitez les redéploiements inutiles (chaque déploiement repart d'une image neuve).
3. Pour un vrai usage communautaire, migrez vers un hébergement avec volume persistant (`Dockerfile` fourni) ou ajoutez un **Render Disk** monté sur `/opt/render/project/src/data`.

---

## 11. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `Deploy failed` — `npm ci` en erreur | `package-lock.json` absent ou désynchronisé | En local : `npm install` puis `git add package-lock.json && git commit && git push`. Vérifiez aussi que **Root Directory** est vide dans les réglages Render |
| Build : `error TS5108: Option 'moduleResolution=node10' has been removed` | Un TypeScript ≥ 7 a compilé à la place de celui du projet (dépendances de dev non installées, `NODE_ENV=production`) | `tsconfig.json` ne contient plus `moduleResolution` et le Build Command est `npm ci --include=dev && npm run build` (déjà en place dans `render.yaml`) → redéployez |
| Build : `sh: tsc: command not found` | `typescript`/`tsx` absents car installés sans les dépendances de dev | Build Command = `npm ci --include=dev && npm run build` |
| Log : `DISCORD_TOKEN manquant` | Variable non définie (ou mal orthographiée) | Environment → vérifiez le nom exact, sans espace, puis Save Changes |
| Log : `TokenInvalid` / HTTP 401 | Token révoqué, tronqué, ou guillemets inclus | Developer Portal → **Reset Token**, recollez la valeur **sans guillemets**. Testez en local : `npm run validate` |
| Log : `Used disallowed intents` | Intents privilégiés désactivés | Developer Portal → Bot → activez **SERVER MEMBERS INTENT** et **MESSAGE CONTENT INTENT** |
| `/help` n'affiche rien dans Discord | Commandes globales pas encore propagées | Renseignez `DEV_GUILD_ID`, redéployez (publication immédiate) et faites `Ctrl+R` sur Discord |
| `502 Bad Gateway` sur l'URL | Le service redémarre encore | Attendez 1 minute ; si ça persiste : Logs → cherchez l'erreur de démarrage |
| Le bot répond puis se tait | Service endormi faute de trafic entrant | Vérifiez que le moniteur UptimeRobot est bien **Up** sur `/health` |
| `Missing Permissions` | Permissions insuffisantes ou rôle trop bas | `/config salut` puis *Paramètres du serveur → Rôles* : remontez le rôle d'Elysia |
| Les panneaux ne donnent pas les rôles | Rôle du bot sous les rôles distribués | `/rolepanel apercu panneau:<id>` → la liste des problèmes s'affiche en bas de l'embed |
| Mémoire : `Out of memory` | Cache trop important | `LOG_LEVEL=warn`, réduisez le nombre de serveurs, ou passez à un plan supérieur |
| Le déploiement est très lent | Build sans cache | Ignorez : seuls les premiers builds sont lents (Render met en cache les dépendances) |

**Tester un déploiement sans risquer votre bot :** ajoutez `DRY_RUN=1` dans les variables d'environnement : Elysia démarre le serveur web, le tableau de bord et les données de démonstration **sans se connecter à Discord**. Idéal pour valider que Render déploie correctement, puis retirer `DRY_RUN`.

---

## 12. Alternatives gratuites

| Plateforme | Gratuit ? | Veille | Persistance | Remarque |
|---|---|---|---|---|
| **Render** | ✅ | Oui (15 min) → réglée par UptimeRobot | ❌ (sauf Disk payant) | Le plus simple, blueprints + CI/CD |
| **Koyeb** | ✅ (1 service) | Oui, selon l'offre | ❌ | Déploiement Docker direct (`Dockerfile` fourni) |
| **Railway** | Essai limité | Non (si trafic) | ✅ Volume | Payant au-delà du crédit d'essai |
| **Fly.io** | Crédit gratuit limité | Non | ✅ Volumes | Excellente latence, un peu plus technique |
| **Oracle Cloud Always Free** | ✅ (2 VM) | Non | ✅ | Le plus durable à long terme, nécessite des bases Linux (Docker + `docker compose`) |
| **Raspberry Pi / vieux PC** | ✅ | Non | ✅ | Zero coût récurrent si vous avez le matériel |

Dans tous les cas, le `Dockerfile` fourni fonctionne tel quel :

```bash
docker build -t elysia-bot .
docker run -d --name elysia --env-file .env \
  -p 3000:3000 \
  -v elysia-data:/app/data \
  -v elysia-panels:/app/assets/panels \
  --restart unless-stopped elysia-bot
```

---

## 13. Checklist finale

- [ ] Application Discord créée, **SERVER MEMBERS** et **MESSAGE CONTENT** intents activés
- [ ] Token copié, bot invité avec la permission *Administrator* (ou permissions listées)
- [ ] Code sur GitHub (`.env` **non** poussé)
- [ ] Service Render **Live**, variables `DISCORD_TOKEN`, `CLIENT_ID`, `OWNER_IDS` renseignées
- [ ] `https://VOTRE-SERVICE.onrender.com/health` renvoie `{"status":"ok"}`
- [ ] Tableau de bord accessible et latence affichée (bot connecté)
- [ ] Moniteur UptimeRobot **HTTP(s) → /health** = 🟢 **Up** (intervalle 5 min)
- [ ] Moniteur *Keyword* `"ready":true` (optionnel mais recommandé)
- [ ] `/config salut` dans Discord : aucun ❌
- [ ] `/config convivialite` effectué (logs, bienvenue, rôle muet, staff, hôtes)
- [ ] Premier panneau : `/rolepanel creer` avec image ✅
- [ ] Premier giveaway : `/giveaway creer` ✅
- [ ] Stratégie de sauvegarde définie (`/cases exporter`, Render Disk ou hébergement persistant)

🎉 **Bravo, Elysia est en ligne !** Retour au [README](../README.md) • [Référence des commandes](COMMANDES.md) • [Dépannage](DEPANNAGE.md)
