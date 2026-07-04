# Deploy Railway — repo github.com/NowardEthan/luna-core (raiz = este pacote)

FROM node:22-bookworm-slim AS core-builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV LUNA_CORE_PATH=/app/luna-core
ENV LUNA_MOBILE_API_HOST=0.0.0.0

COPY --from=core-builder /build /app/luna-core

WORKDIR /app/api

COPY mobile-api/package.json mobile-api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY mobile-api/tsconfig.json mobile-api/tsconfig.build.json ./
COPY mobile-api/src ./src
RUN npm run build

EXPOSE 7742

CMD ["node", "dist/server.js"]
