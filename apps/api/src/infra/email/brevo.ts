import type { EmailProvider, OutgoingEmail } from "./email-provider.js";

const BREVO_EMAILS_URL = "https://api.brevo.com/v3/smtp/email";

/** "PRO NOW <hello@example.com>" or a bare address, as Brevo's sender object. */
export function parseSender(from: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(from);
  if (!match) return { email: from.trim() };
  const name = match[1]!.replace(/^"(.*)"$/, "$1");
  return name ? { name, email: match[2]!.trim() } : { email: match[2]!.trim() };
}

/**
 * Brevo works before we own a domain: the sender is one verified address,
 * and Brevo rewrites its domain to @brevosend.com to pass Gmail/Yahoo rules.
 */
export function createBrevoEmailProvider(
  apiKey: string,
  from: string,
  fetchImpl: typeof fetch = fetch
): EmailProvider {
  const sender = parseSender(from);
  return {
    async send(email: OutgoingEmail) {
      const response = await fetchImpl(BREVO_EMAILS_URL, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender,
          to: [{ email: email.to }],
          subject: email.subject,
          textContent: email.text,
          htmlContent: email.html,
        }),
      });

      if (response.ok) return;

      const details = (await response.text()).trim().slice(0, 500);
      const safeDetails = details.replaceAll(apiKey, "[REDACTED]");
      throw new Error(`Brevo email request failed (${response.status})${safeDetails ? `: ${safeDetails}` : ""}`);
    },
  };
}
