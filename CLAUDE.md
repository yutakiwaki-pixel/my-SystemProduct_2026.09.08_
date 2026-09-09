# Product Monorepo

Next.js 16 / React 19 (App Router) product on Turborepo + pnpm workspaces. Full stack
summary and setup steps: [README.md](README.md). Exhaustive step-by-step operations manual
(first-time setup, day-to-day commands, and the `/feature` harness usage/troubleshooting):
[RUNBOOK.md](RUNBOOK.md).

- `apps/web` — the Next.js app.
- `packages/database` — Prisma 7 schema/client (`@repo/database`), shared by future apps.

## Verifying changes

Always verify with these before considering work done:

```
pnpm check       # Biome lint + format
pnpm typecheck    # tsc --noEmit across the workspace
pnpm test         # Vitest (unit/component)
pnpm build        # Next.js build
```

`pnpm test:e2e` (Playwright) additionally when a change touches user-facing routes or flows.

## Repo-specific gotchas (already solved once — don't rediscover them)

- **`transpilePackages: ["@repo/database"]`** in `next.config.ts` is required for Turbopack to
  resolve the workspace package's TS source. Add any new internal `@repo/*` package here too.
- Import the generated Prisma client without a `.js` extension
  (`from "./generated/prisma/client"`, not `client.js`) — Turbopack fails to resolve the
  TS-style `.js` import for this generated output across the workspace-package boundary.
- Package-specific gotchas live in `packages/database/CLAUDE.md` and `apps/web/CLAUDE.md`.

## The `/feature` loop

For any new feature or non-trivial task, use `/feature <description>` instead of implementing
ad hoc. It runs an autonomous two-phase pipeline (spec → verify → implement → verify) in an
isolated sandbox and only comes back to you at the end for review. See
`.claude/skills/feature/SKILL.md` for the mechanics.

**Session start**: if the user references prior `/feature` work, or asks "what's the status of
X", or it's otherwise unclear whether anything is in flight, run `scripts/feature-sandbox.sh
list` before answering — a sandbox from a previous session may still be pending review, blocked
on a question, or simply forgotten. Don't assume a clean slate.

This is the one place unattended multi-attempt work (retrying a rejected spec, retrying a failed
implementation, running builds/tests repeatedly) is pre-authorized — it exists specifically so
the loop doesn't need to ask permission at every retry, because everything it touches is
confined to the sandbox until you explicitly `apply` it. It does not apply outside of `/feature`
runs, and it never touches git — this repo has no git history; `apply`/`discard` are the only
undo mechanism.
