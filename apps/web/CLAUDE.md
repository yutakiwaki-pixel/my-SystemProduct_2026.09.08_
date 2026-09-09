# apps/web

- **`apps/web/next.config.ts`** only sets `output: "standalone"` when `DOCKER_BUILD=1` (see
  `apps/web/Dockerfile`). Plain `output: "standalone"` breaks local/CI `next start` —
  don't re-add it unconditionally.
