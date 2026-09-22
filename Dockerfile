# Image Docker optionnelle (VPS, Docker Desktop, Fly.io, Koyeb…)
# Build : docker build -t elysia-bot .
# Run   : docker run -d --env-file .env -p 3000:3000 -v elysia-data:/app/data elysia-bot

FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
# --include=dev : indispensable si NODE_ENV=production fuite dans l'étape de build
# (sinon typescript/tsx ne sont pas installés et `npm run build` échoue).
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Dépendances de production uniquement
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Données persistantes (base JSON + images de panneaux)
RUN mkdir -p /app/data /app/assets/panels
VOLUME ["/app/data", "/app/assets/panels"]

# Utilisateur non privilégié
RUN addgroup -S elysia && adduser -S elysia -G elysia && chown -R elysia:elysia /app
USER elysia

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/src/index.js"]
