import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ADMIN_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token) {
    db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
  }

  const response = NextResponse.redirect(new URL("/admin/login", request.url), 303);
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}
