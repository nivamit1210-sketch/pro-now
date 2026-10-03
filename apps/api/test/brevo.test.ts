import { describe, expect, it, vi } from "vitest";
import { createBrevoEmailProvider, parseSender } from "../src/infra/email/brevo.js";

describe("Brevo email provider", () => {
  it("posts the outgoing email to Brevo's HTTPS API", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }));
    const provider = createBrevoEmailProvider("xkeysib-test", "PRO NOW <hello@example.com>", fetchImpl);

    await provider.send({
      to: "person@example.com",
      subject: "Sign in",
      text: "Open the link",
      html: "<p>Open the link</p>",
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": "xkeysib-test",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "PRO NOW", email: "hello@example.com" },
        to: [{ email: "person@example.com" }],
        subject: "Sign in",
        textContent: "Open the link",
        htmlContent: "<p>Open the link</p>",
      }),
    });
  });

  it("surfaces non-success responses without leaking the API key", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "Key not found: xkeysib-secret" }), { status: 401 })
    );
    const provider = createBrevoEmailProvider("xkeysib-secret", "hello@example.com", fetchImpl);

    const error = await provider
      .send({ to: "person@example.com", subject: "Sign in", text: "Open", html: "<p>Open</p>" })
      .then(
        () => new Error("expected Brevo to reject"),
        (caught) => caught as Error
      );
    expect(error.message).toBe("Brevo email request failed (401): {\"message\":\"Key not found: [REDACTED]\"}");
    expect(error.message).not.toContain("xkeysib-secret");
  });

  it("reads EMAIL_FROM with or without a display name", () => {
    expect(parseSender("PRO NOW <hello@example.com>")).toEqual({ name: "PRO NOW", email: "hello@example.com" });
    expect(parseSender('"PRO NOW" <hello@example.com>')).toEqual({ name: "PRO NOW", email: "hello@example.com" });
    expect(parseSender("<hello@example.com>")).toEqual({ email: "hello@example.com" });
    expect(parseSender(" hello@example.com ")).toEqual({ email: "hello@example.com" });
  });
});
