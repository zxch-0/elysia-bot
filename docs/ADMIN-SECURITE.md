# 🔐 Onglet admin, anti-raid et simulateur de raid

Documentation complète des fonctions de sécurité ajoutées : **onglet admin
caché**, **protection anti-raid** et **simulateur de raid** (outil de test).

> ⚠️ **À lire en premier :** changez `ADMIN_PANEL_CODE` et laissez
> `RAID_SIM_GUILD_IDS` vide en production. Tout est expliqué ci-dessous.

---

## 1. L'onglet admin caché (`/admin`)

### Où est le bouton ?

Il n'y a **aucun bouton visible** : c'est volontaire. Le panneau s'ouvre de
trois manières, toutes discrètes :

| Méthode | Comment |
| --- | --- |
| 🖱️ Clics secrets | **5 clics rapides** (moins de 4 s) sur le logo 💜 ou sur le texte `Elysia v1.0.0` en bas de page |
| ⌨️ Raccourci | **Ctrl + Maj + A** (ou **Cmd + Maj + A** sur Mac) depuis n'importe quelle page |
| 🔗 URL directe | `https://VOTRE-SERVICE.onrender.com/admin` |

Dans les deux premiers cas, une fenêtre demande le **code d'accès**. Le code est
vérifié côté serveur : sans lui, l'onglet reste fermé et chaque tentative est
journalisée.

### Le code d'accès

```
ADMIN_PANEL_CODE=1357      # valeur par défaut — À CHANGER
```

Tant que le code par défaut est actif, un bandeau rouge s'affiche en haut du
panneau pour vous le rappeler (et le bot écrit un avertissement au démarrage).

**Générer un code solide :**

```bash
node -e "console.log(require('crypto').randomBytes(12).toString('hex'))"
# → 8f3c1a94d27b6e05a1c47f0b  (24 caractères)
```

Puis dans Render : **Environment → Add Environment Variable →
`ADMIN_PANEL_CODE`** (ou dans votre `.env` en local), et redémarrez.

### Ce que contient le panneau

| Section | Contenu |
| --- | --- |
| **Tableau de bord** | Anti-raid actif ?, verrouillage en cours, raids détectés, sessions admin, tentatives ratées, état du simulateur, serveurs, commandes exécutées |
| **🛡️ Anti-raid** | Tous les réglages (seuils, sanctions, verrouillage, liste de confiance), boutons **Verrouiller** / **Déverrouiller**, test de détection |
| **🧪 Simulateur de raid** | Tests de résistance (messages + salons) et bouton **⛔ STOP RAID SIM** |
| **📜 Journal d'audit** | Qui s'est connecté, quand, depuis quelle IP, et toutes les actions |
| **🔎 Journaux du bot** | Dernières lignes de log, en direct |

---

## 2. 🛡️ Anti-raid

Actif **par défaut** sur tous les serveurs où le bot est présent. Il surveille en
permanence les comportements typiques d'un raid :

| Détection | Seuil par défaut | Réaction |
| --- | --- | --- |
| **Vagues d'arrivées** | 8 membres en 10 s | Alerte + verrouillage automatique (10 min) |
| **Création massive de salons** | 5 salons en 10 s | Salons créés **supprimés** + verrouillage |
| **Suppression massive de salons** | 5 salons en 10 s | Alerte + verrouillage |
| **Création massive de rôles** | 3 rôles en 10 s | Rôles créés **supprimés** + verrouillage |
| **Bannissements en série** | 5 bans en 20 s | Alerte immédiate (compte staff compromis ?) |
| **Spam de messages** | *désactivé par défaut* | Timeout configurable (8 messages / 5 s) |
| **Comptes trop récents** | *action désactivée par défaut* | Expulsion pendant un raid (7 jours d'ancienneté minimum) |

### Le verrouillage

Le verrouillage retire l'écriture à `@everyone` dans **tous les salons textuels**.
Avant chaque modification, Elysia **mémorise la permission d'origine** : au
déverrouillage, l'état exact d'avant est restauré (elle ne « débannit » jamais
une permission que vous aviez volontairement retirée).

- **Automatique** : déclenché par la détection, expire après
  `lockdown.durationSeconds` (10 min par défaut).
- **Manuel** : bouton dans le panneau admin ou `/antiraid verrouiller`.
- **Levée** : bouton **Déverrouiller**, `/antiraid deverrouiller`, ou expiration.
- Si le bot redémarre pendant un verrouillage, il le reprend en compte et le
  lève à l'échéance prévue.

### Les membres de confiance

Ils ne sont **jamais** comptés ni sanctionnés :

- le propriétaire du serveur et les **administrateurs** (permission
  *Administrateur*) ;
- les identifiants de `OWNER_IDS` ;
- le bot lui-même ;
- les membres/rôles ajoutés via `/antiraid confiance` ou le champ « confiance »
  du panneau admin.

### Alertes

En cas de détection, Elysia envoie un embed **🚨 RAID DÉTECTÉ** dans le salon
d'alerte (sinon dans le salon de logs de modération) et peut mentionner les
rôles staff (rôle « staff » de `/config`).

### Pilotage depuis Discord

```
/antiraid statut                    → état complet de la protection
/antiraid activer | desactiver      → interrupteur général
/antiraid seuils arrivees:5 fenetre_arrivees:10 salons:4 sanction_raid:kick
/antiraid verrouiller raison:raid duree:15
/antiraid deverrouiller
/antiraid confiance cible:@Modérateur
/antiraid test                      → explique ce qui se déclencherait
```

### Réglages conseillés selon la taille du serveur

| Serveur | `joins.threshold` | `joins.windowSeconds` | `lockdown.durationSeconds` | `accountAge.actionDuringRaid` |
| --- | --- | --- | --- | --- |
| Petit (< 500 membres) | 5 | 10 | 600 | `kick` |
| Moyen (500–10 000) | 10 | 10 | 900 | `kick` |
| Grand (> 10 000) | 20 | 15 | 1 800 | `ban` |
| Communauté ouverte (portes grandes ouvertes) | 40 | 30 | 600 | `none` |

> Ajustez **après avoir observé** : le panneau admin conserve les 40 derniers
> événements pour repérer les faux positifs.

---

## 3. 🧪 Simulateur de raid (outil de test)

### À quoi ça sert ?

À vérifier concrètement qu'un serveur — et l'anti-raid — tiennent la charge face
à une vague de messages et de salons, **sans jamais toucher aux salons
existants**.

### ⚠️ Activation obligatoire

```bash
RAID_SIM_GUILD_IDS=123456789012345678   # identifiant du SERVEUR DE TEST
# (vide = simulateur totalement désactivé)
```

En production : **laissez cette variable vide** ou ne mettez que votre serveur
de test. Le bot le rappelle au démarrage.

### Les garde-fous (appliqués côté serveur, impossibles à contourner)

1. **Liste blanche** — tout serveur absent de `RAID_SIM_GUILD_IDS` reçoit un
   `403`. Impossible de viser un serveur de production.
2. **Salons dédiés** — la simulation crée **sa propre** catégorie et ses propres
   salons `sim-raid-*`, puis écrit uniquement dedans. Elle n'écrit **jamais**
   dans vos salons existants, et ne supprime jamais autre chose.
3. **Plafonds durs** — 60 messages, 10 salons, intervalles minimums
   (1,1 s entre deux messages, 0,9 s entre deux salons), durée maximale 2 minutes.
4. **Mentions neutralisées** — `@everyone`, `@here`, `@rôle`, `@membre` sont
   remplacés par du texte inerte et l'envoi se fait avec `allowedMentions: []` :
   **aucun ping réel** ne peut être déclenché.
5. **Confirmation** — il faut taper exactement `SIMULATION` dans le panneau.
6. **Nettoyage garanti** — les salons temporaires sont supprimés à la fin, à
   l'arrêt d'urgence, et un bouton « Nettoyer les salons `sim-raid-*` restants »
   permet de repasser après un redémarrage du bot.
7. **Anti-raid non trompé** — le bot est un membre de confiance : ses propres
   actions ne déclenchent pas le verrouillage automatique.

### Utilisation

1. Ouvrez `/admin` (méthode de votre choix) et saisissez le code.
2. Section **🧪 Simulateur de raid** : choisissez le serveur de test, le nombre
   de messages, le nombre de salons et le texte.
3. Tapez `SIMULATION` puis **🚀 Lancer la simulation**.
4. Observez le journal en direct dans le panneau (et les salons `sim-raid-*`
   apparaître puis disparaître sur Discord).
5. En cas de besoin : **⛔ STOP RAID SIM** — l'arrêt est immédiat et le
   nettoyage démarre dans la seconde.

### Mode démonstration

Avec `DRY_RUN=1`, la simulation se déroule entièrement en local (aucune requête
vers Discord) : idéal pour se familiariser avec le panneau sans aucun risque.

---

## 4. 🛡️ Durcissements de sécurité effectués

En plus de l'onglet et de l'anti-raid, ces protections ont été ajoutées :

| Menace | Protection |
| --- | --- |
| **Vol de code en mémoire** | Le code n'est jamais comparé caractère par caractère : hachage SHA-256 + comparaison en temps constant (`timingSafeEqual`). |
| **Brute-force du code** | 5 échecs par IP → verrouillage de 15 min ; 12 échecs au total → verrouillage global ; délai minimal croissant entre deux essais ; journalisation de chaque tentative. |
| **Vol de session dans le navigateur** | Cookie `HttpOnly` (invisible en JavaScript) + `SameSite=Strict` + `Secure` automatique en HTTPS. Le jeton de session (256 bits) n'apparaît jamais dans le HTML. |
| **Réutilisation d'un cookie volé** | Session liée à l'IP et à l'agent utilisateur ; toute session s'ouvrant d'ailleurs est fermée immédiatement. |
| **Sessions qui traînent** | Expiration (60 min par défaut, prolongée à chaque action), 8 sessions maximum, purge automatique, bouton de déconnexion. |
| **CSRF** | `SameSite=Strict` **et** en-tête personnalisé `x-elysia-admin` obligatoire pour toute écriture. |
| **Fuite du code par le site** | `/admin` est absent de la navigation, de `/api` et de `robots.txt`. Les pages publiques ne contiennent aucune information sur l'onglet. |
| **Injection HTML dans le panneau** | Toutes les valeurs affichées sont échappées (`esc()`), y compris les identifiants, pseudos et messages. |
| **Requête géante** | Corps limité à 32 Ko (réponse 413), délai de lecture de 10 s. |
| **Accès depuis une adresse non autorisée** | `ADMIN_ALLOWED_IPS` : refus immédiat de toute autre IP. |
| **Jeton du tableau de bord** | Comparaison en temps constant (`DASHBOARD_TOKEN`), en-têtes `nosniff` et `no-referrer` déjà en place. |
| **Raids Discord** | Voir la section 2 (anti-raid). |

### Points d'attention restants

- **Le code compte** : avec 4 chiffres, un attaquant patient finit par le
  trouver malgré les verrouillages. Utilisez un code de 16 caractères ou plus,
  et **activez `ADMIN_ALLOWED_IPS`** si votre IP est fixe.
- **Le site est public** : `/`, `/commandes`, `/jeux`, `/economie`,
  `/communaute` et les API associées sont ouvertes. Définissez
  `DASHBOARD_TOKEN` pour protéger `/donnees`, `/api/cases`, `/api/notes`,
  `/api/reminders` et `/api/logs`.
- **`DRY_RUN=0`** en production, sinon le bot ne se connecte pas à Discord.
- **Ne committez jamais `.env`** ni `ADMIN_PANEL_CODE` : le dépôt est public.

---

## 5. Dépannage

| Symptôme | Cause probable / solution |
| --- | --- |
| Le panneau dit « Code incorrect » | Vérifiez `ADMIN_PANEL_CODE` puis redéployez. Le champ est sensible à la casse. |
| « Trop d'échecs : accès temporairement verrouillé » | Protection anti-brute-force. Patientez `ADMIN_LOCKOUT_SECONDS` (15 min par défaut) ou redémarrez le service (le compteur est en mémoire). |
| « Patientez 2 s avant un nouvel essai » | Délai croissant après plusieurs échecs : c'est normal. |
| Le bouton « Lancer la simulation » est grisé | `RAID_SIM_GUILD_IDS` est vide ou ne contient pas ce serveur : complétez la variable, puis redémarrez. |
| « Serveur absent de la liste blanche » | Ajoutez l'identifiant du serveur de test dans `RAID_SIM_GUILD_IDS`. |
| Des salons `sim-raid-*` sont restés | Panneau admin → Simulateur de raid → bouton **🧹 Nettoyer les salons `sim-raid-*` restants**. |
| Le verrouillage échoue | Vérifiez que le bot a bien **Gérer les salons** et **Gérer les rôles** sur le serveur. |
| Aucune alerte reçue pendant un raid | Configurez un salon d'alerte (panneau admin → Anti-raid → « Salon d'alerte ») ou les logs de modération via `/config`. |
| Le bot ne sanctionne personne automatiquement | Comportement par défaut : `accountAge.action = none` (alerte seule). Choisissez l'action dans le panneau admin. |
