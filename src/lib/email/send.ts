import { renderEmail } from "./layout";
import { byId } from "./templates";
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
