import { Resend } from "resend";
import type { ReactElement } from "react";
import { env } from "./env";

// Thin wrapper over Resend. Without RESEND_API_KEY nothing is sent: the message is logged so local development works.

const DEFAULT_FROM = "Riverside Barbers <onboarding@resend.dev>";

let client: Resend | null = null;

export type SendResult = "sent" | "skipped";

export async function sendEmail(opts: { to: string; subject: string; react: ReactElement }): Promise<SendResult> {
  if (!env.RESEND_API_KEY) {
    console.info(`[email] RESEND_API_KEY not set, skipped "${opts.subject}" to ${opts.to}`);
    return "skipped";
  }

  client ??= new Resend(env.RESEND_API_KEY);
  const { error } = await client.emails.send({
    from: env.EMAIL_FROM ?? DEFAULT_FROM,
    to: opts.to,
    subject: opts.subject,
    react: opts.react,
  });
  // The Resend SDK reports failures in the result instead of throwing, so surface them here.
  if (error) throw new Error(`Resend rejected "${opts.subject}" to ${opts.to}: ${error.message}`);
  return "sent";
}
