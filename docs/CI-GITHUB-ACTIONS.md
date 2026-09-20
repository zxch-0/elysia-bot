# 🤖 Intégration continue (GitHub Actions)

Le projet est fourni avec un workflow prêt à l'emploi : vérification des types, compilation,
auto-test métier hors ligne et démarrage à blanc du serveur web.

> ℹ️ **Pourquoi ce fichier n'est-il pas déjà dans `.github/workflows/` ?**
> L'outil utilisé pour pousser ce dépôt n'a pas la permission `workflows` de GitHub.
> Il suffit de créer le fichier une fois à la main (2 minutes) — le contenu est ci-dessous.

## Mise en place

1. Dans votre dépôt GitHub : **Add file → Create new file**.
2. Nom du fichier : `.github/workflows/ci.yml`.
3. Collez le contenu ci-dessous, puis **Commit changes**.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  quality:
    name: Types, build & auto-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Installation des dépendances
        run: npm ci

      - name: Vérification des types
        run: npm run typecheck

      - name: Compilation
        run: npm run build

      - name: Auto-test métier (66 vérifications hors ligne)
        run: npm run self-test

      - name: Démarrage à blanc (mode démonstration)
        env:
          DRY_RUN: "1"
          PORT: "3100"
          LOG_LEVEL: error
        run: |
          node dist/src/index.js &
          SERVER_PID=$!
          sleep 6
          curl --fail --silent http://127.0.0.1:3100/health | tee /dev/stderr | grep -q '"status":"ok"'
          kill $SERVER_PID
```

## Ce que vérifie la CI

| Étape | Rôle |
|---|---|
| `npm run typecheck` | Aucune erreur TypeScript (mode `strict`) |
| `npm run build` | La compilation en `dist/` doit réussir |
| `npm run self-test` | 138 vérifications : durées, base JSON, tirages pondérés, panneaux, mini-jeux, routes web… |
| Démarrage à blanc | Le serveur web répond bien `{"status":"ok"}` sur `/health` avec `DRY_RUN=1` |

## Alternative locale (sans GitHub Actions)

```bash
npm run typecheck && npm run build && npm run self-test
```

Ces trois commandes constituent exactement la même vérification que la CI.
