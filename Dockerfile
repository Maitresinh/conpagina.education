# Base stage avec Bun
FROM oven/bun:1.3.5 AS base
WORKDIR /app

# Builder stage - installe et build tout
FROM base AS builder
WORKDIR /app

# Désactiver la télémétrie Next.js
ENV NEXT_TELEMETRY_DISABLED=1

# Copier tout le projet
COPY . .

# Installer les versions validées, sans recalculer les dépendances en production.
RUN bun install --frozen-lockfile

# Build du serveur (pour générer les types et vérifier que tout est là)
WORKDIR /app/apps/server
# On ne build pas vraiment car on utilise ts-node/bun run, mais on s'assure que les deps sont là

# Build du web
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:3000
ARG NEXT_PUBLIC_APP_URL=http://localhost:3001
ENV NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

WORKDIR /app/apps/web
# Limiter la mémoire pour le build (optimisé pour VM avec RAM limitée)
ENV NODE_OPTIONS="--max-old-space-size=512"
RUN bun run build

# Server production image
FROM base AS server
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/src ./apps/server/src
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/db/drizzle.config.ts ./packages/db/

RUN mkdir -p /app/apps/server/uploads

WORKDIR /app/apps/server
EXPOSE 3000
CMD ["sh", "-c", "cd /app/packages/db && bun run db:push && cd /app/apps/server && bun run src/index.ts"]

# Web production image
FROM base AS web
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copier les node_modules depuis le builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules

COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./

WORKDIR /app/apps/web
EXPOSE 3001
# Forcer les variables d'environnement pour le runtime
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
CMD ["bun", "run", "start"]
