import { createHash, randomBytes } from "node:crypto";

// Quick password hashing so passwords aren't stored as plain text. No per-user salt and no
// slow/adaptive KDF (bcrypt/scrypt/argon2) — see apps/vuln-lab/CLAUDE.md.
export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

// Session token for member_session / admin_session. Must come entirely from a CSPRNG with no
// derivable structure (see docs/journal-drafts/005-session-token-predictable.md) — no
// timestamp-based prefix (recomputable from the issuance time) and no Math.random() (not
// cryptographically secure). 256 bits of randomBytes, hex-encoded.
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}
