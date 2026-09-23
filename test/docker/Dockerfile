FROM node:26-bookworm-slim AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.10.0

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY playground/package.json playground/
RUN pnpm install --frozen-lockfile

COPY . .

ENV PLAYGROUND_MEDIA_STORAGE=filesystem

RUN pnpm dev:prepare \
    && pnpm prepack \
    && pnpm exec nuxt build playground

FROM node:26-bookworm-slim AS runner

WORKDIR /app

COPY --from=builder /repo/playground/.output ./.output

RUN mkdir -p /data && chown node:node /data

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NUXT_CMS_DB_PATH=/data/cms.db \
    NUXT_CMS_MEDIA_DIR=/data/media

USER node

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
