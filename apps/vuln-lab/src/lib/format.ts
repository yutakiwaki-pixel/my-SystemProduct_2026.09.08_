// Turns plain-text line breaks into <br> for display. Deliberately does not HTML-escape the
// input first — see apps/vuln-lab/CLAUDE.md (stored XSS in news/contact/reservation content).
export function nl2br(text: string): string {
  return text.replace(/\n/g, "<br />");
}

// HTML-escapes text before handing it to nl2br, for call sites that have been remediated:
// news post display (apps/vuln-lab/src/app/news/page.tsx and src/app/admin/news/page.tsx,
// per docs/journal-drafts/003-xss-news-post.md) and admin contact message display
// (apps/vuln-lab/src/app/admin/contacts/page.tsx, per
// docs/journal-drafts/009-contact-message-stored-xss.md). Other nl2br call sites (reservation
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
