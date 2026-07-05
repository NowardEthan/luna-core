# Deploy Railway — repo github.com/NowardEthan/luna-core
#
# Layout runtime = monorepo local (mobile-api dentro de luna-core) para imports ../../src.
# OOM exit 137: npm ci --ignore-scripts evita recompilar better-sqlite3 no build.
# sharp (@xenova/transformers): postinstall baixa prebuild linux-x64 — rebuild explícito abaixo.

FROM node:22-bookworm-slim AS core-builder

WORKDIR /build

COPY package.json package-lock.json ./
COPY scripts/postinstall-native.mjs scripts/

RUN npm ci --ignore-scripts --no-audit --no-fund \
  && npm rebuild sharp --foreground-scripts

COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

FROM node:22-bookworm-slim AS api-builder

WORKDIR /build/mobile-api

COPY mobile-api/package.json mobile-api/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY mobile-api/tsconfig.json mobile-api/tsconfig.build.json ./
COPY mobile-api/src ./src

# Typecheck/compilação precisa dos .ts do core (imports ../../src)
COPY --from=core-builder /build/src ../src
COPY --from=core-builder /build/dist ../dist

RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV LUNA_STORE=firestore
ENV SKIP_SQLITE_REBUILD=1
ENV LUNA_CORE_PATH=/app/luna-core
ENV LUNA_MOBILE_API_HOST=0.0.0.0

# Core compilado + deps prod + assets fora de src/dist
COPY --from=core-builder /build/dist /app/luna-core/dist
COPY --from=core-builder /build/src /app/luna-core/src
COPY --from=core-builder /build/constitution /app/luna-core/constitution
COPY --from=core-builder /build/responder /app/luna-core/responder
COPY --from=core-builder /build/node_modules /app/luna-core/node_modules
COPY --from=core-builder /build/package.json /app/luna-core/package.json

# Mobile API
WORKDIR /app/luna-core/mobile-api
COPY mobile-api/package.json mobile-api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=api-builder /build/mobile-api/dist ./dist

EXPOSE 7742

CMD ["node", "dist/server.js"]
