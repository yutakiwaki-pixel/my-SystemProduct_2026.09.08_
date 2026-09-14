import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MEMBER_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  const store = await cookies();
  const token = store.get(MEMBER_COOKIE)?.value;
  if (token) {
    db.prepare("DELETE FROM member_sessions WHERE token = ?").run(token);
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.delete(MEMBER_COOKIE);
  return response;
}
