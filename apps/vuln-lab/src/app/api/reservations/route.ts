import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { internalErrorResponse } from "@/lib/http-errors";
import { getCurrentMember } from "@/lib/session";

// CSRF protection: getCurrentMember() only proves the member_session cookie is valid, not
// that this request was actually triggered by our own pages — a browser attaches cookies to
// a cross-site form submission just as it would to a same-site one. Requiring the Origin
// header (falling back to Referer when a browser omits Origin) to match this endpoint's own
// origin rejects those cross-site submissions while still accepting normal same-site posts,
// without needing any change to how the member_session cookie itself is issued.
function isSameOriginRequest(request: Request): boolean {
  const expectedOrigin = new URL(request.url).origin;

  const origin = request.headers.get("origin");
  if (origin !== null) {
    return origin === expectedOrigin;
  }

  const referer = request.headers.get("referer");
  if (referer !== null) {
    try {
      return new URL(referer).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  // Neither header present: a real same-site browser form submission always sends at least
  // one of them, so fail closed instead of assuming same-origin.
  return false;
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const menu = String(form.get("menu") ?? "");
    const reservedAt = String(form.get("reservedAt") ?? "");
    const partySize = Number(form.get("partySize") ?? 1);
    const note = String(form.get("note") ?? "");

    db.prepare(
      "INSERT INTO reservations (member_id, menu, party_size, reserved_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(member.id, menu, partySize, reservedAt, note, new Date().toISOString());

    return NextResponse.redirect(new URL("/mypage", request.url), 303);
  } catch (err) {
    return internalErrorResponse(err);
  }
}
