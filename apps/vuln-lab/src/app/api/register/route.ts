import { NextResponse } from "next/server";
import { generateToken, hashPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import { MEMBER_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const name = String(form.get("name") ?? "");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const now = new Date().toISOString();

    const result = db
      .prepare("INSERT INTO members (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)")
      .run(email, hashPassword(password), name, now);

    const token = generateToken();
    db.prepare("INSERT INTO member_sessions (token, member_id, created_at) VALUES (?, ?, ?)").run(
      token,
      result.lastInsertRowid,
      now,
    );

    const response = NextResponse.redirect(new URL("/mypage", request.url), 303);
    response.cookies.set(MEMBER_COOKIE, token, { path: "/" });
    return response;
  } catch (_err) {
    // Most likely a duplicate email (UNIQUE constraint) — send the user back to try again.
    return NextResponse.redirect(new URL("/register?error=1", request.url), 303);
  }
}
