import { describe, expect, it } from "vitest";
import { nl2br, nl2brSafe } from "@/lib/format";

describe("nl2br", () => {
  it("replaces newlines with <br />", () => {
    expect(nl2br("line1\nline2")).toBe("line1<br />line2");
  });

  it("does not escape HTML (intentional — see apps/vuln-lab/CLAUDE.md)", () => {
    expect(nl2br("<b>hi</b>")).toBe("<b>hi</b>");
  });
});

describe("nl2brSafe", () => {
  it("replaces newlines with <br />", () => {
    expect(nl2brSafe("line1\nline2")).toBe("line1<br />line2");
  });

  it("escapes an onerror-based XSS payload (regression for stored XSS in news posts)", () => {
    // apps/vuln-lab/docs journal draft 003: <script> alone never runs via
    // dangerouslySetInnerHTML, but an event-handler payload like this does unless escaped.
    expect(nl2brSafe("<img src=x onerror=alert(1)>")).toBe("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("escapes angle brackets, ampersands, and quotes", () => {
    expect(nl2brSafe(`<b>hi</b> & "quote" 'a'`)).toBe(
      "&lt;b&gt;hi&lt;/b&gt; &amp; &quot;quote&quot; &#39;a&#39;",
    );
  });
});
