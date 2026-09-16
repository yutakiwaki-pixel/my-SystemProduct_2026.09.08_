import { NextResponse } from "next/server";
import { generateToken, verifyPassword } from "@/lib/crypto";
import { db, type Member, row } from "@/lib/db";
import { clearFailedAttempts, isLockedOut, recordFailedAttempt } from "@/lib/login-rate-limit";
import { MEMBER_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    // Locked-out identifiers get the exact same response as a wrong password below, so a
    // brute-force attempt can't distinguish "locked out" from "just guessed wrong" — see
    // docs/journal-drafts/004-login-rate-limit.md.
    if (isLockedOut("member", email)) {
      return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
    }

    // Looked up by email alone, then the stored hash is checked with verifyPassword — the
    // hash is salted (see src/lib/crypto.ts), so it can no longer be matched at the SQL level
    // the way an unsalted hash could.
    const member = row<Member>(db.prepare("SELECT * FROM members WHERE email = ?").get(email));

    if (!member || !verifyPassword(password, member.password_hash)) {
      recordFailedAttempt("member", email);
      return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
    }

    clearFailedAttempts("member", email);

    const token = generateToken();
    db.prepare("INSERT INTO member_sessions (token, member_id, created_at) VALUES (?, ?, ?)").run(
      token,
      member.id,
      new Date().toISOString(),
    );

    const response = NextResponse.redirect(new URL("/mypage", request.url), 303);
    response.cookies.set(MEMBER_COOKIE, token, { path: "/" });
    return response;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
