import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/contact", () => {
  beforeEach(() => {
    // The fix logs the caught exception server-side via console.error — silence it in the
    // test output, but still let the assertions below inspect what was (or wasn't) logged.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    "does not leak the internal exception in the response body when the request body isn't " +
      "form data (verbose-error-messages regression)",
    async () => {
      // Exact PoC from docs/journal-drafts/008-verbose-error-messages.md: a JSON body sent to
      // an endpoint whose handler calls request.formData() makes that call throw a TypeError
      // whose message names the runtime's own validation internals.
      const request = new Request("http://localhost:3100/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ foo: "bar" }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toEqual({ error: "Internal Server Error" });
      // Neither the exception's class name nor its runtime-internal message text should ever
      // reach the client.
      expect(body.error).not.toMatch(/TypeError/);
      expect(body.error).not.toMatch(/multipart\/form-data/);

      // The full exception is still available server-side for debugging.
      expect(console.error).toHaveBeenCalledWith(expect.any(Error));
    },
  );

  it("still accepts a normal form submission", async () => {
    const form = new FormData();
    form.append("name", "Taro");
    form.append("email", "taro@example.com");
    form.append("message", "hello");
    const request = new Request("http://localhost:3100/api/contact", {
      method: "POST",
      body: form,
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3100/contact?sent=1");
  });
});
