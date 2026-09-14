import { NextResponse } from "next/server";
import { generateToken, hashPassword } from "@/lib/crypto";
import { type Admin, db, row } from "@/lib/db";
import { ADMIN_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    // Same lookup pattern as the member login (see api/login/route.ts).
    const query = `SELECT * FROM admins WHERE email = '${email}' AND password_hash = '${hashPassword(
      password,
    )}'`;
    const admin = row<Admin>(db.prepare(query).get());

    if (!admin) {
      return NextResponse.redirect(new URL("/admin/login?error=1", request.url), 303);
    }

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
