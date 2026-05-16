FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm check
RUN pnpm build

FROM node:24-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HERD_STATIC_ROOT=/app

COPY --from=build /app /app

EXPOSE 8080

CMD ["pnpm", "--filter", "@herd/server", "start"]
