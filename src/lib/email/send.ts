import { renderEmail } from "./layout";
import { byId } from "./templates";
import { bizById } from "./business-templates";
import { mayEmailOwner, recordMarketingSend } from "./consent";
import { sendMail } from "../mail";

/**
 * Sends one catalogue template. The template decides its own sender, subject and whether the footer
 * invites a reply, so a call site only supplies the data.
 */
export async function sendTemplate(id: string, to: string, data: Record<string, unknown>, extra: { replyTo?: string; headers?: Record<string, string> } = {}) {
  const tpl = byId(id);
  if (!tpl) throw new Error(`Unknown email template: ${id}`);
  const doc = tpl.build(data as never);
  const { html, text } = renderEmail({ ...doc, purpose: tpl.purpose });
  return sendMail(to, tpl.subject(data as never), text, {
    purpose: tpl.purpose,
    html,
    noFooter: true, // the layout already carries the right footer for this template
    ...extra,
  });
}

/** Renders a template with its sample data — used by the preview screen and the tests. */
export function previewTemplate(id: string) {
  const tpl = byId(id);
  if (!tpl) return null;
  const doc = tpl.build(tpl.sample as never);
  const { html, text } = renderEmail({ ...doc, purpose: tpl.purpose });
  return { tpl, subject: tpl.subject(tpl.sample as never), html, text };
}

/**
 * Sends a business-programme email, through the consent gate. Service mail always goes; lifecycle mail stops
 * at an unsubscribe; marketing needs an opt-in and obeys the frequency cap. The unsubscribe link is added
 * automatically to anything that is not strictly service mail.
 */
export async function sendBusinessTemplate(id: string, ownerId: string, to: string, data: Record<string, unknown>, extra: { replyTo?: string } = {}) {
  const tpl = bizById(id);
  if (!tpl) throw new Error(`Unknown business email template: ${id}`);
  const gate = await mayEmailOwner(ownerId, tpl.kind);
  if (!gate.send) return { skipped: true as const, reason: gate.reason };

  const doc = tpl.build(data as never);
  const { html, text } = renderEmail({ ...doc, purpose: tpl.purpose, unsubscribeUrl: gate.unsubscribeUrl ?? doc.unsubscribeUrl });
  const row = await sendMail(to, tpl.subject(data as never), text, { purpose: tpl.purpose, html, noFooter: true, ...extra });
  if (tpl.kind === "marketing") await recordMarketingSend(ownerId);
  return { skipped: false as const, row };
}

/** Preview for the admin screen and the tests: no consent gate, sample data. */
export function previewBusinessTemplate(id: string) {
  const tpl = bizById(id);
  if (!tpl) return null;
  const doc = tpl.build(tpl.sample as never);
  const unsub = tpl.kind === "service" ? undefined : `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://primestreet.uk"}/owner/unsubscribe/sample`;
  const { html, text } = renderEmail({ ...doc, purpose: tpl.purpose, unsubscribeUrl: unsub });
  return { tpl, subject: tpl.subject(tpl.sample as never), html, text };
}
