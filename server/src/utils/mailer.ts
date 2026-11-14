import { env } from "../env.js";

/**
 * Outgoing e-mail through Brevo's HTTP API (free: 300 mails/day; works from Render, which may block
 * SMTP ports). Needs BREVO_API_KEY + MAIL_FROM (a sender address verified in Brevo). Without them
 * e-mail is simply off and callers fall back to "ask the server owner for a reset link".
 */
export function mailConfigured(): boolean {
  return !!env.BREVO_API_KEY && !!env.MAIL_FROM;
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  if (!mailConfigured()) return false;
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "ШмиркаТа", email: env.MAIL_FROM },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) console.error("sendMail failed", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (err) {
    console.error("sendMail failed", err);
    return false;
  }
}
