// Turns plain-text line breaks into <br> for display. Deliberately does not HTML-escape the
// input first — see apps/vuln-lab/CLAUDE.md (stored XSS in news/contact/reservation content).
export function nl2br(text: string): string {
  return text.replace(/\n/g, "<br />");
}
