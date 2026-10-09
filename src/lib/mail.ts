import { db } from "./db";
import { SITE } from "./constants";

/**
 * Outgoing email.
 *
 * Each purpose sends from its own address, so recipients can see at a glance what an email is about and can
 * filter it. Only `hello@` is a real, monitored inbox; every other address is send-only, so mail from one
 * carries a footer telling the reader not to reply and to write to hello@ instead. Reply-To is still set to
 * the monitored inbox as a safety net, because a reply that bounces into nothing is worse than one that lands
 * somewhere a person reads.
 *
 * Every message is recorded in EmailOutbox whether or not a provider is configured, so nothing is ever lost
 * and the admin outbox is a complete record.
 */
const domain = () => (process.env.MAIL_DOMAIN ?? "primestreet.uk").replace(/^@/, "").trim();
const at = (local: string) => `${local}@${domain()}`;

/** The one inbox a human reads. Everything else points here. */
export const SUPPORT_EMAIL = () => process.env.MAIL_SUPPORT ?? at("hello");

export const SENDERS = {
  accounts: { local: "accounts", name: "PrimeStreet Accounts", monitored: false, about: "Sign-in links, invitations, password resets" },
  editorial: { local: "editorial", name: "PrimeStreet Editorial", monitored: false, about: "Review decisions, submissions, writer guidance" },
  enquiries: { local: "enquiries", name: "PrimeStreet Enquiries", monitored: false, about: "Customer enquiries forwarded to a business" },
  reviews: { local: "reviews", name: "PrimeStreet Reviews", monitored: false, about: "Review confirmations and moderation outcomes" },
  claims: { local: "claims", name: "PrimeStreet Claims", monitored: false, about: "Business claims and ownership reports" },
  digest: { local: "digest", name: "PrimeStreet", monitored: false, about: "The weekly newsletter" },
  billing: { local: "billing", name: "PrimeStreet Billing", monitored: false, about: "Subscriptions, payments and receipts" },
  alerts: { local: "alerts", name: "PrimeStreet Alerts", monitored: false, about: "Internal notifications to the PrimeStreet team" },
  hello: { local: "hello", name: "PrimeStreet", monitored: true, about: "Person-to-person mail that expects a reply" },
} as const;
export type MailPurpose = keyof typeof SENDERS;

export const senderAddress = (purpose: MailPurpose) => {
  const override = process.env[`MAIL_FROM_${purpose.toUpperCase()}`];
  return override ?? at(SENDERS[purpose].local);
};
export const senderHeader = (purpose: MailPurpose) => `${SENDERS[purpose].name} <${senderAddress(purpose)}>`;

/** True once a provider key and a domain are configured; until then mail is recorded but not delivered. */
export const mailConfigured = () => !!process.env.RESEND_API_KEY && (!!process.env.MAIL_DOMAIN || !!process.env.MAIL_FROM);

const NO_REPLY_NOTE = (support: string) =>
  [
    "",
    "—",
    "This email was sent from an address that nobody reads, so please don't reply to it: no one will see your message.",
    `If you need help, or something here looks wrong, email ${support} and a person will answer.`,
  ].join("\n");

export type MailOptions = {
  purpose?: MailPurpose;
  /** Overrides Reply-To. Used for customer enquiries, where a business should be able to reply to the customer. */
  replyTo?: string;
  headers?: Record<string, string>;
  /** Suppresses the do-not-reply footer. Only for mail that genuinely invites a reply. */
  noFooter?: boolean;
};

export async function sendMail(to: string, subject: string, bodyIn: string, opts: MailOptions = {}) {
  const purpose: MailPurpose = opts.purpose ?? "alerts";
  const sender = SENDERS[purpose];
  const support = SUPPORT_EMAIL();
  const replyTo = opts.replyTo ?? support;

  // Send-only addresses always say so, unless the caller has written its own guidance.
  const body = sender.monitored || opts.noFooter ? bodyIn : `${bodyIn.replace(/\s+$/, "")}\n${NO_REPLY_NOTE(support)}`;

  const from = process.env.MAIL_FROM && !process.env.MAIL_DOMAIN ? process.env.MAIL_FROM : senderHeader(purpose);
  const row = await db.emailOutbox.create({
    data: { to, subject, body, purpose, fromAddress: from, replyTo },
  });
  if (!mailConfigured()) return row;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to, subject, text: body,
        reply_to: replyTo,
        ...(opts.headers ? { headers: opts.headers } : {}),
      }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    await db.emailOutbox.update({ where: { id: row.id }, data: { sentAt: new Date() } });
  } catch (e) {
    await db.emailOutbox.update({ where: { id: row.id }, data: { error: String(e).slice(0, 300) } });
  }
  return row;
}

export const siteLink = (path: string) => `${SITE.url}${path}`;
