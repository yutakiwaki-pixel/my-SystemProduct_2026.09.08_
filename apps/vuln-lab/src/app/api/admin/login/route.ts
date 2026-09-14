import { NextResponse } from "next/server";
import { generateToken, hashPassword } from "@/lib/crypto";
import { type Admin, db, row } from "@/lib/db";
import { clearFailedAttempts, isLockedOut, recordFailedAttempt } from "@/lib/login-rate-limit";
import { ADMIN_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    // Locked-out identifiers get the exact same response as a wrong password below — see
    // api/login/route.ts and docs/journal-drafts/004-login-rate-limit.md.
    if (isLockedOut("admin", email)) {
      return NextResponse.redirect(new URL("/admin/login?error=1", request.url), 303);
    }

    // Same lookup pattern as the member login (see api/login/route.ts).
    const admin = row<Admin>(
      db
        .prepare("SELECT * FROM admins WHERE email = ? AND password_hash = ?")
        .get(email, hashPassword(password)),
    );

    if (!admin) {
      recordFailedAttempt("admin", email);
      return NextResponse.redirect(new URL("/admin/login?error=1", request.url), 303);
    }

    clearFailedAttempts("admin", email);

    const token = generateToken();
    db.prepare("INSERT INTO admin_sessions (token, admin_id, created_at) VALUES (?, ?, ?)").run(
      token,
      admin.id,
      new Date().toISOString(),
    );

    const response = NextResponse.redirect(new URL("/admin", request.url), 303);
    response.cookies.set(ADMIN_COOKIE, token, { path: "/" });
    return response;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
