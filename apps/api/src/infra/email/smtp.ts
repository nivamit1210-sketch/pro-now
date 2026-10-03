import nodemailer from "nodemailer";
import type { EmailProvider, OutgoingEmail } from "./email-provider.js";

export function createSmtpEmailProvider(smtpUrl: string, from: string): EmailProvider {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(email: OutgoingEmail) {
      await transport.sendMail({ from, ...email });
    },
  };
}

/**
 * For a local run with no email provider: refuses loudly instead of pretending
 * the email went out. loadEnv already refuses staging/production without one.
 */
export const unconfiguredEmailProvider: EmailProvider = {
  async send() {
    throw new Error("Email is not configured: set SMTP_URL locally or BREVO_API_KEY in production.");
  },
};
