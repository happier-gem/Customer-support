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
RUN pnpm --filter gateway build

FROM node:22-slim AS runner
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app .

EXPOSE 4000
CMD ["node", "services/gateway/dist/main.js"]
