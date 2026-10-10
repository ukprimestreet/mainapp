import { randomBytes } from "crypto";
import { db } from "../db";
import { siteLink } from "../mail";

/**
 * Who may be sent what.
 *
 * Three kinds of email, and the difference is legal as much as editorial:
 *  - `service`   Something they asked for or need: a sign-in link, a claim decision, a customer enquiry, a receipt.
 *                Always sends. No unsubscribe link, because turning these off would break their account.
 *  - `lifecycle` Useful, occasional prompts about their own listing: a review waiting for a reply, a quiet month.
 *                Sends unless they have unsubscribed. Carries an unsubscribe link.
 *  - `marketing` Selling something. Needs an explicit opt-in, obeys the frequency cap, always unsubscribable.
 *
 * Under PECR a sole trader or a partnership counts as an individual, and most businesses in this directory are
 * exactly that. So marketing requires consent rather than assuming a B2B exemption that often would not apply.
 */
export type MailKind = "service" | "lifecycle" | "marketing";

/** No more than one promotional email a fortnight, however many rules fire at once. */
export const MARKETING_GAP_MS = 14 * 86400_000;

export async function unsubscribeToken(ownerId: string) {
  const owner = await db.owner.findUnique({ where: { id: ownerId } });
  if (!owner) return null;
  if (owner.unsubToken) return owner.unsubToken;
  const token = randomBytes(18).toString("base64url");
  await db.owner.update({ where: { id: ownerId }, data: { unsubToken: token } });
  return token;
}

export const unsubscribeUrl = (token: string) => siteLink(`/owner/unsubscribe/${token}`);

export type Decision = { send: true; unsubscribeUrl?: string } | { send: false; reason: string };

/** The one gate every owner email goes through. */
export async function mayEmailOwner(ownerId: string, kind: MailKind): Promise<Decision> {
  const owner = await db.owner.findUnique({ where: { id: ownerId } });
  if (!owner) return { send: false, reason: "No such owner." };
  if (kind === "service") return { send: true };

  if (owner.unsubscribedAt) return { send: false, reason: "They have unsubscribed from non-essential email." };
  if (kind === "marketing") {
    if (!owner.marketingOptIn) return { send: false, reason: "No marketing opt-in on record." };
    if (owner.lastMarketingAt && Date.now() - owner.lastMarketingAt.getTime() < MARKETING_GAP_MS) {
      return { send: false, reason: "Frequency cap: a promotional email went out within the last fortnight." };
    }
  }
  const token = await unsubscribeToken(ownerId);
  return { send: true, unsubscribeUrl: token ? unsubscribeUrl(token) : undefined };
}

/** Called after a marketing email actually goes out, so the cap means something. */
export const recordMarketingSend = (ownerId: string) =>
  db.owner.update({ where: { id: ownerId }, data: { lastMarketingAt: new Date() } });

export async function unsubscribeByToken(token: string) {
  const owner = await db.owner.findFirst({ where: { unsubToken: token } });
  if (!owner) return null;
  if (!owner.unsubscribedAt) {
    await db.owner.update({ where: { id: owner.id }, data: { unsubscribedAt: new Date(), marketingOptIn: false } });
  }
  return owner;
}

export async function resubscribeByToken(token: string) {
  const owner = await db.owner.findFirst({ where: { unsubToken: token } });
  if (!owner) return null;
  await db.owner.update({ where: { id: owner.id }, data: { unsubscribedAt: null } });
  return owner;
}
