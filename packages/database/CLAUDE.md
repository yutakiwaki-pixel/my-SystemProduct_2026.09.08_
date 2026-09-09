# packages/database

- **Prisma 7 has no `datasource { url }` in schema.prisma.** The connection string lives in
  `packages/database/prisma.config.ts` (CLI) and is passed to `PrismaClient` via
  `@prisma/adapter-pg` in `packages/database/src/index.ts` (runtime). Generated client output
  is `packages/database/src/generated/prisma` (gitignored, biome-ignored) — always run
  `pnpm db:generate` after a schema change.
