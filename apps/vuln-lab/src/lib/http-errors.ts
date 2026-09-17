import { NextResponse } from "next/server";

// Shared catch-all for the state-changing POST endpoints (contact, reservations, admin/news,
// admin/login, login). An uncaught exception in the try block (a malformed request body, a DB
// error, ...) is logged in full server-side for local debugging, but the client only ever sees
// a fixed, generic message — never `String(err)`, which would leak the exception's class name
// and runtime-internal validation text (and, for a DB error, potentially query/column names).
// See docs/journal-drafts/008-verbose-error-messages.md.
export function internalErrorResponse(err: unknown): NextResponse {
  console.error(err);
  return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
}
