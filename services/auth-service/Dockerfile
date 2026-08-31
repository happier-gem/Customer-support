# Build context is the monorepo root (pnpm workspace) — see railway.json's
# rootDirectory in this same folder. Needs the whole workspace to resolve
# @app/shared and the pnpm lockfile.
FROM node:22-slim AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run build:shared
RUN pnpm --filter auth-service exec prisma generate
RUN pnpm --filter auth-service build

FROM node:22-slim AS runner
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app .

EXPOSE 4001
# Applies pending migrations before every boot — safe to run repeatedly
# (no-op when the schema is already up to date), and keeps the DB schema
# in sync with each deploy without a separate manual migration step.
CMD ["sh", "-c", "pnpm --filter auth-service exec prisma migrate deploy && node services/auth-service/dist/src/main.js"]
