/**
 * Outgoing email, vendor-neutral (CLAUDE.md §6). Mailpit speaks SMTP locally;
 * production uses Brevo's HTTPS API (Render Free blocks SMTP ports), or
 * Resend's once we own a domain.
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailProvider {
  send(email: OutgoingEmail): Promise<void>;
}
