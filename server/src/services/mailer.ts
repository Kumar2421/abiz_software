import { env } from "../env.js";

/**
 * Sends transactional email via Resend's HTTP API.
 *
 * A single POST, no SMTP connection to hold open — which matters inside a
 * Netlify function that may live for one request and then freeze. Provider
 * kept singular and swappable behind this one function; nothing that calls
 * `sendEmail` knows or cares which service is behind it.
 */

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback for clients that do not render HTML. */
  text: string;
}

export type SendEmailResult =
  | { sent: true }
  | { sent: false; reason: string };

/** True once RESEND_API_KEY and MAIL_FROM are both set. */
export const mailerConfigured = (): boolean =>
  Boolean(env.RESEND_API_KEY && env.MAIL_FROM);

/**
 * Sends one email. Never throws — a mail provider outage must not surface as
 * a 500 on an auth endpoint, and the caller decides what to do with a failure
 * (log it, but still answer the customer with the same uniform message, so a
 * delivery failure cannot be used to probe which addresses have accounts).
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!mailerConfigured()) {
    return {
      sent: false,
      reason: "RESEND_API_KEY or MAIL_FROM is not set",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        sent: false,
        reason: `Resend responded ${response.status}: ${body.slice(0, 300)}`,
      };
    }

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Plain HTML, no external assets or tracking pixels: password-reset mail is
 * the one email most likely to be read in a plain-text or stripped-down
 * client, and a broken remote image here reads as suspicious rather than
 * merely ugly.
 */
export function passwordResetEmail(params: {
  resetUrl: string;
  ttlMinutes: number;
}): { subject: string; html: string; text: string } {
  const { resetUrl, ttlMinutes } = params;

  return {
    subject: "Reset your Abiz password",
    text: `Reset your Abiz password by opening this link within ${ttlMinutes} minutes:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email — your password will not change.`,
    html: `
<div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #18181b;">
  <h1 style="font-size: 18px; margin: 0 0 16px;">Reset your Abiz password</h1>
  <p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
    Someone requested a password reset for this Abiz account. Click the button
    below within <strong>${ttlMinutes} minutes</strong> to choose a new password.
  </p>
  <a href="${resetUrl}"
     style="display: inline-block; background: #18181b; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600;">
    Reset password
  </a>
  <p style="font-size: 12px; line-height: 1.6; color: #71717a; margin: 24px 0 0;">
    If you did not request this, you can safely ignore this email — your
    password will not change. This link works once and expires in ${ttlMinutes}
    minutes.
  </p>
  <p style="font-size: 12px; line-height: 1.6; color: #a1a1aa; margin: 16px 0 0; word-break: break-all;">
    Or paste this link into your browser: ${resetUrl}
  </p>
</div>`.trim(),
  };
}
