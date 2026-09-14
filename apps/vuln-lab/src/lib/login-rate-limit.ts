import { db, row } from "@/lib/db";

// Brute-force guard for the login endpoints (member + admin) — see
// docs/journal-drafts/004-login-rate-limit.md. Tracks consecutive failed attempts per
// (scope, email) in the `login_attempts` table and locks that identifier out for a fixed
// window once the threshold is exceeded, regardless of whether the next attempt's password
// would otherwise have been correct — so a locked-out identifier and a merely-wrong password
// are indistinguishable to the caller (both fall through to the same generic redirect).
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export type LoginScope = "member" | "admin";

interface LoginAttemptRow {
  fail_count: number;
  locked_until: string | null;
}

function getAttempt(scope: LoginScope, email: string): LoginAttemptRow | undefined {
  return row<LoginAttemptRow>(
    db
      .prepare("SELECT fail_count, locked_until FROM login_attempts WHERE scope = ? AND email = ?")
      .get(scope, email),
  );
}

export function isLockedOut(scope: LoginScope, email: string): boolean {
  const attempt = getAttempt(scope, email);
  if (!attempt?.locked_until) return false;
  return new Date(attempt.locked_until).getTime() > Date.now();
}

export function recordFailedAttempt(scope: LoginScope, email: string): void {
  const now = new Date();
  const failCount = (getAttempt(scope, email)?.fail_count ?? 0) + 1;
  const lockedUntil =
    failCount >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS).toISOString() : null;

  db.prepare(
    `INSERT INTO login_attempts (scope, email, fail_count, locked_until, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (scope, email) DO UPDATE SET
       fail_count = excluded.fail_count,
       locked_until = excluded.locked_until,
       updated_at = excluded.updated_at`,
  ).run(scope, email, failCount, lockedUntil, now.toISOString());
}

// Called on a successful login so a past streak of failures doesn't count against a later,
// legitimate session once the identifier isn't locked out anymore.
export function clearFailedAttempts(scope: LoginScope, email: string): void {
  db.prepare("DELETE FROM login_attempts WHERE scope = ? AND email = ?").run(scope, email);
}
