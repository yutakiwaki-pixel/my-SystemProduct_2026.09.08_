import { createHash } from "node:crypto";

// Quick password hashing so passwords aren't stored as plain text. No per-user salt and no
// slow/adaptive KDF (bcrypt/scrypt/argon2) — see apps/vuln-lab/CLAUDE.md.
export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export function generateToken(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}
