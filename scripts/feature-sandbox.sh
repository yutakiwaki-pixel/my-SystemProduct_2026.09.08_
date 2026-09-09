#!/usr/bin/env bash
# Manage an isolated sandbox copy of the repo for one /feature run.
# No git required: isolation is a real filesystem copy under
# .claude/features/<slug>/workdir, with heavy dirs (node_modules) symlinked
# back to the main tree so `pnpm install` doesn't need to re-run.
#
# Usage:
#   scripts/feature-sandbox.sh create  <slug>
#   scripts/feature-sandbox.sh diff    <slug>
#   scripts/feature-sandbox.sh apply   <slug>
#   scripts/feature-sandbox.sh discard <slug>
#   scripts/feature-sandbox.sh list
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Sandboxes live OUTSIDE the project tree (as a sibling), not under
# $ROOT/.claude/features. Nesting a sandbox inside the real project caused
# Turbopack to resolve the symlinked `next` package back to the real root's
# node_modules and treat the whole real tree as "the workspace root", which
# made it refuse to build anything under the nested sandbox path. Keeping
# the sandbox as a sibling directory avoids that ancestor-lockfile collision
# entirely: it becomes a fully independent workspace root.
FEATURES_DIR="$(dirname "$ROOT")/.claude-feature-sandboxes/$(basename "$ROOT")"

# Excluded from both the sandbox copy and the diff/apply steps: dependency
# trees plus build/test artifacts that are regenerated, not authored, so they
# only add noise to the diff.
EXCLUDES=(
  --exclude node_modules --exclude .next --exclude .turbo --exclude .git --exclude .claude
  --exclude playwright-report --exclude test-results --exclude blob-report --exclude coverage
  --exclude '*.tsbuildinfo' --exclude generated
)
DIFF_EXCLUDES=(
  -x node_modules -x .next -x .turbo -x .git -x .claude
  -x playwright-report -x test-results -x blob-report -x coverage
  -x '*.tsbuildinfo' -x generated
)

usage() {
  echo "Usage: $0 {create|diff|apply|discard|list} [slug]" >&2
  exit 1
}

require_slug() {
  if [[ -z "${1:-}" ]]; then
    echo "Error: slug required" >&2
    usage
  fi
}

sandbox_dir() {
  echo "$FEATURES_DIR/$1/workdir"
}

cmd_create() {
  local slug="$1"
  local sandbox
  sandbox="$(sandbox_dir "$slug")"
  if [[ -e "$sandbox" ]]; then
    echo "Error: sandbox already exists at $sandbox" >&2
    exit 1
  fi
  mkdir -p "$sandbox"
  rsync -a "${EXCLUDES[@]}" "$ROOT"/ "$sandbox"/

  # node_modules is cloned, not symlinked: pnpm refuses to run if
  # node_modules itself is a symlink, and Turbopack refuses to follow any
  # symlink that points outside the sandbox's filesystem root. On APFS,
  # `cp -Rc` (clonefile) makes this a fast, disk-cheap copy-on-write clone
  # rather than a real duplication.
  for nm in "node_modules" "apps/web/node_modules" "packages/database/node_modules"; do
    if [[ -d "$ROOT/$nm" ]]; then
      mkdir -p "$(dirname "$sandbox/$nm")"
      cp -Rc "$ROOT/$nm" "$sandbox/$nm"
      # Turbo's per-project task-run-state dir embeds absolute paths from
      # the source tree; let each tool recreate it fresh in the sandbox.
      rm -rf "$sandbox/$nm"/.pnpm-task-run-state*
    fi
  done

  echo "$sandbox"
}

cmd_diff() {
  local slug="$1"
  local sandbox
  sandbox="$(sandbox_dir "$slug")"
  if [[ ! -d "$sandbox" ]]; then
    echo "Error: no sandbox for '$slug' at $sandbox" >&2
    exit 1
  fi
  diff -ruN "${DIFF_EXCLUDES[@]}" "$ROOT" "$sandbox" || true
}

cmd_apply() {
  local slug="$1"
  local sandbox
  sandbox="$(sandbox_dir "$slug")"
  if [[ ! -d "$sandbox" ]]; then
    echo "Error: no sandbox for '$slug' at $sandbox" >&2
    exit 1
  fi
  # Intentionally no --delete: file removals made inside the sandbox are
  # NOT propagated automatically. Review `diff` output for "Only in <root>"
  # entries that should be deleted and remove them by hand after applying.
  rsync -a "${EXCLUDES[@]}" "$sandbox"/ "$ROOT"/
  echo "Applied $slug into $ROOT"
}

cmd_discard() {
  local slug="$1"
  local dir="$FEATURES_DIR/$slug"
  if [[ ! -d "$dir" ]]; then
    echo "Error: no sandbox for '$slug' at $dir" >&2
    exit 1
  fi
  rm -rf "$dir"
  echo "Discarded $slug"
}

cmd_list() {
  if [[ ! -d "$FEATURES_DIR" ]]; then
    echo "(none)"
    exit 0
  fi
  find "$FEATURES_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \;
}

case "${1:-}" in
  create)
    require_slug "${2:-}"
    cmd_create "$2"
    ;;
  diff)
    require_slug "${2:-}"
    cmd_diff "$2"
    ;;
  apply)
    require_slug "${2:-}"
    cmd_apply "$2"
    ;;
  discard)
    require_slug "${2:-}"
    cmd_discard "$2"
    ;;
  list)
    cmd_list
    ;;
  *)
    usage
    ;;
esac
