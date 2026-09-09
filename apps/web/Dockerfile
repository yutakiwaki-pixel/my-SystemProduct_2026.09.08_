# syntax=docker/dockerfile:1
# Build context must be the monorepo root:
#   docker build -f apps/web/Dockerfile -t product-web .

FROM node:24-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY . .
RUN npx turbo prune web --docker

FROM base AS installer
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
ENV DOCKER_BUILD=1
RUN pnpm turbo run build --filter=web

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=installer /app/apps/web/public ./apps/web/public
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
