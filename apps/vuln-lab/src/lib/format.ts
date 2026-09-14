// Turns plain-text line breaks into <br> for display. Deliberately does not HTML-escape the
// input first — see apps/vuln-lab/CLAUDE.md (stored XSS in news/contact/reservation content).
export function nl2br(text: string): string {
  return text.replace(/\n/g, "<br />");
}

// HTML-escapes text before handing it to nl2br, for the one call site (news post display,
// apps/vuln-lab/src/app/news/page.tsx and src/app/admin/news/page.tsx) that has been remediated
// per docs/journal-drafts/003-xss-news-post.md. Other nl2br call sites (contacts, reservation
// notes) are intentionally left unescaped — see apps/vuln-lab/CLAUDE.md.
export function nl2brSafe(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return nl2br(escaped);
}
