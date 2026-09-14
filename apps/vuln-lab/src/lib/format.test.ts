import { describe, expect, it } from "vitest";
import { nl2br } from "@/lib/format";

describe("nl2br", () => {
  it("replaces newlines with <br />", () => {
    expect(nl2br("line1\nline2")).toBe("line1<br />line2");
  });

  it("does not escape HTML (intentional — see apps/vuln-lab/CLAUDE.md)", () => {
    expect(nl2br("<b>hi</b>")).toBe("<b>hi</b>");
  });
});
