import { NextResponse } from "next/server";
import { generateToken, hashPassword } from "@/lib/crypto";
import { db, type Member, row } from "@/lib/db";
import { MEMBER_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    // Looks up the member by email + password hash directly. Built as a plain string so
    // the query is easy to log/debug while wiring this up — see apps/vuln-lab/CLAUDE.md.
    const query = `SELECT * FROM members WHERE email = '${email}' AND password_hash = '${hashPassword(
      password,
    )}'`;
    const member = row<Member>(db.prepare(query).get());

    if (!member) {
      return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
    }

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
