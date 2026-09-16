import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Salted, adaptive password KDF (scrypt) — see
// docs/journal-drafts/006-weak-password-hashing.md. Replaces the previous unsalted
// `sha256(password)` (same plaintext -> same hash across every user, and SHA-256 is a fast
// general-purpose digest, not a slow/memory-hard password KDF, so an offline attacker with the
// DB could rainbow-table or brute-force it cheaply). scrypt ships in Node's own `node:crypto`
// (used elsewhere in this file already), so no extra dependency (bcrypt/argon2) is needed.
const SCRYPT_N = 16384; // CPU/memory cost factor (2^14) — the adaptive part: expensive to brute-force
const SCRYPT_R = 8; // block size
const SCRYPT_P = 1; // parallelization
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;
// scrypt's memory use is roughly 128 * N * r bytes; give scryptSync enough headroom above the
// default 32MB cap for the cost parameters above (128 * 16384 * 8 = 16MB, so 64MB is generous
// room to raise N later without also having to remember to raise this).
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, keylen: number, n: number, r: number, p: number) {
  return scryptSync(password, salt, keylen, { N: n, r, p, maxmem: SCRYPT_MAXMEM });
}

// Stored as `scrypt$N$r$p$<saltHex>$<hashHex>` — a random per-user salt travels with the hash
// (so identical passwords never produce identical stored values across users) and the cost
// parameters ride along too, so they can be tuned later without breaking hashes already in the
// database. Pair with `verifyPassword` below for checking a login attempt; nothing should
// compare this output with `===`/SQL `=` the way the old sha256 version did.
export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const hash = scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

// Verifies a plaintext password against a hash produced by `hashPassword`. Recomputes the hash
// using the salt/cost parameters embedded in `stored` (not the current module constants, so a
// future change to SCRYPT_N etc. doesn't invalidate hashes already stored) and compares in
// constant time via `timingSafeEqual` rather than `===`, so response time can't leak how many
// leading bytes matched. Returns false (never throws) for a malformed/foreign `stored` value.
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  if (!nStr || !rStr || !pStr || !saltHex || !hashHex) return false;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = scrypt(password, salt, expected.length, n, r, p);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Session token for member_session / admin_session. Must come entirely from a CSPRNG with no
// derivable structure (see docs/journal-drafts/005-session-token-predictable.md) — no
// timestamp-based prefix (recomputable from the issuance time) and no Math.random() (not
// cryptographically secure). 256 bits of randomBytes, hex-encoded.
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}
