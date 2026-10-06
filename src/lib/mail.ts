import { db } from "./db";
import { SITE } from "./constants";

/**
 * Every email is recorded in EmailOutbox. If RESEND_API_KEY + MAIL_FROM are set it is also sent via Resend's HTTP API.
 * (Provider path is implemented but UNTESTED against a live account — no credentials available at build time.)
 */
export async function sendMail(to: string, subject: string, body: string, opts: { headers?: Record<string, string> } = {}) {
  const row = await db.emailOutbox.create({ data: { to, subject, body } });
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from) return row;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text: body, ...(opts.headers ? { headers: opts.headers } : {}) }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}`);
    await db.emailOutbox.update({ where: { id: row.id }, data: { sentAt: new Date() } });
  } catch (e) {
    await db.emailOutbox.update({ where: { id: row.id }, data: { error: String(e).slice(0, 300) } });
  }
  return row;
}

export const siteLink = (path: string) => `${SITE.url}${path}`;
