# apps/vuln-lab

**(a) This app is intentionally vulnerable, on purpose, for the user's own self-study
penetration-testing practice.** It is a small fictional local-business site (café) built as if
a non-engineer had ordered it from an AI without specifying any security requirements. Do not
"fix" it reflexively — a generic security review (`/security-review` or similar) will flag
real issues here, and that is expected. Only change its vulnerabilities if the user explicitly
asks (e.g. a follow-up remediation task), not as a drive-by cleanup while working on something
else in this repo.

When the user hands you a finding they've already reproduced themselves (payload, endpoint,
steps), use **`/vuln-remediate <finding>`** rather than fixing it ad hoc — see the root
`CLAUDE.md`'s "The `/vuln-remediate` loop" section. Discovery itself (attacking the app to find
the vulnerability) is always the user's job, not yours.

**(b) Never deploy or expose this app.** Local/`localhost` only:
- No `build` / `start` / `test:e2e` script in `package.json` — it cannot be built, started in
  production mode, or exercised by Playwright through the root scripts.
- `.github/workflows/ci.yml` never runs any command against this package.
- No `Dockerfile`, and it is not referenced from any Docker/Vercel/deploy configuration.
- Its data lives in a local SQLite file (`apps/vuln-lab/.data/dev.sqlite3`, gitignored) fully
  separate from `@repo/database` / PostgreSQL.

If you ever find yourself wiring this app into a build, a Dockerfile, a deploy workflow, or a
CI step, stop — that contradicts this app's entire reason for existing.

**(c) Intentional vulnerability categories** — see below.

## Running it

```bash
pnpm --filter vuln-lab dev
```

Opens on `http://localhost:3100` (not the default 3000, to avoid clashing with `apps/web`).
The SQLite database is created and seeded automatically on first run
(`apps/vuln-lab/src/lib/db.ts`) — no separate migration step. Seeded accounts for convenience:

- Member: `sato@example.com` / `password123` (has one existing reservation, id `1`)
- Admin: `admin@example.com` / `admin123`

`pnpm --filter vuln-lab typecheck` and `pnpm --filter vuln-lab test` also work standalone.
There is no `lint` script — the root `pnpm check` (Biome, run directly against the whole repo)
already covers this package.

## Intentional vulnerability categories (for the user's own attack log)

Left in deliberately, as the natural result of an "implement the ticket, nothing more" build
with no stated security requirements (see the feature spec this app was built from). Kept at
category + area granularity on purpose — no payloads, endpoint names, or parameter names, so
there's still something to find.

- **IDOR** — ~~around the reservation detail view in マイページ~~ found and fixed, see
  `docs/journal-drafts/001-idor-mypage-reservation-detail.md`.
- **SQL injection** — ~~around the login flows (member and admin)~~ found and fixed, see
  `docs/journal-drafts/002-sqli-admin-login.md`.
- **Stored XSS** — around how posted/submitted text (news, contact messages, reservation
  notes) gets displayed back.
- **Auth / session handling** — how passwords are stored and how session tokens are issued.
- **CSRF** — the state-changing forms (contact, register, login, reservation, admin news post)
  have no protection against cross-site submission.
- **Misconfiguration** — error responses, and the seeded credentials above.
- **Design weaknesses** — where authorization checks live (or don't) relative to authentication
  checks.

Deliberately **not** present, and not worth adding: SSRF (no server-side "fetch a URL the user
gave us" feature exists) and vulnerable dependencies (scaffolded on the same current, non-
vulnerable Next.js/React versions as `apps/web`). See the feature spec for why.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
