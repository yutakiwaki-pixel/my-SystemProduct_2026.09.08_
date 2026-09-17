import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { internalErrorResponse } from "@/lib/http-errors";
import { getCurrentAdmin } from "@/lib/session";

// CSRF protection: getCurrentAdmin() only proves the admin_session cookie is valid, not
// that this request was actually triggered by our own admin pages — a browser attaches
// cookies to a cross-site form submission just as it would to a same-site one. Requiring the
// Origin header (falling back to Referer when a browser omits Origin) to match this endpoint's
// own origin rejects those cross-site submissions while still accepting normal same-site
// posts, without needing any change to how the admin_session cookie itself is issued. Same
// approach as POST /api/reservations, see docs/journal-drafts/007-csrf-reservation-create.md.
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
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 303);
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const title = String(form.get("title") ?? "");
    const body = String(form.get("body") ?? "");

    db.prepare("INSERT INTO news (title, body, created_at) VALUES (?, ?, ?)").run(
      title,
      body,
      new Date().toISOString(),
    );

    return NextResponse.redirect(new URL("/admin/news", request.url), 303);
  } catch (err) {
    return internalErrorResponse(err);
  }
}
