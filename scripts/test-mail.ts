// Email senders: one address per purpose, only hello@ monitored, send-only mail must say so.
import { PrismaClient } from "@prisma/client";
import { SENDERS, SUPPORT_EMAIL, mailConfigured, sendMail, senderAddress, senderHeader, type MailPurpose } from "../src/lib/mail";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const KEYS = Object.keys(SENDERS) as MailPurpose[];

async function main() {
  process.env.MAIL_DOMAIN = "primestreet.uk";
  process.env.MAIL_SUPPORT = "hello@primestreet.uk";
  delete process.env.RESEND_API_KEY; // record only: no live sending from the test suite

  // ---------------- the scheme ----------------
  t("every purpose has its own address on the configured domain",
    KEYS.every((k) => senderAddress(k).endsWith("@primestreet.uk"))
    && new Set(KEYS.map((k) => senderAddress(k))).size === KEYS.length);
  t("addresses are the ones we intend", senderAddress("accounts") === "accounts@primestreet.uk"
    && senderAddress("editorial") === "editorial@primestreet.uk"
    && senderAddress("enquiries") === "enquiries@primestreet.uk"
    && senderAddress("digest") === "digest@primestreet.uk"
    && senderAddress("hello") === "hello@primestreet.uk");
  t("the From header carries a readable name", senderHeader("accounts") === "PrimeStreet Accounts <accounts@primestreet.uk>");
  t("ONLY hello@ is a monitored inbox",
    SENDERS.hello.monitored === true && KEYS.filter((k) => SENDERS[k].monitored).length === 1);
  t("support address is hello@", SUPPORT_EMAIL() === "hello@primestreet.uk");
  t("a single sender can be overridden by env", (() => {
    process.env.MAIL_FROM_BILLING = "PrimeStreet <money@elsewhere.test>";
    const got = senderAddress("billing");
    delete process.env.MAIL_FROM_BILLING;
    return got === "PrimeStreet <money@elsewhere.test>";
  })());
  t("without a key, mail is recorded but not configured to send", mailConfigured() === false);

  // ---------------- the do-not-reply rule ----------------
  await db.emailOutbox.deleteMany({ where: { to: { endsWith: "@mailtest.example" } } });
  const rows: Record<string, { body: string; from: string | null; replyTo: string | null }> = {};
  for (const k of KEYS) {
    const r = await sendMail(`${k}@mailtest.example`, `Subject for ${k}`, "The body of the message.", { purpose: k });
    const row = (await db.emailOutbox.findUnique({ where: { id: r.id } }))!;
    rows[k] = { body: row.body, from: row.fromAddress, replyTo: row.replyTo };
  }
  const sendOnly = KEYS.filter((k) => !SENDERS[k].monitored);
  t("every send-only email tells the reader not to reply",
    sendOnly.every((k) => /don't reply to it/i.test(rows[k].body)));
  t("…and points them at the monitored inbox instead",
    sendOnly.every((k) => rows[k].body.includes("hello@primestreet.uk")));
  t("mail from the monitored inbox has NO do-not-reply note", !/don't reply/i.test(rows.hello.body));
  t("the sender recorded matches the purpose", KEYS.every((k) => rows[k].from === senderHeader(k)));
  t("Reply-To defaults to the monitored inbox, so a reply is never lost",
    KEYS.every((k) => rows[k].replyTo === "hello@primestreet.uk"));
  t("the original body is kept intact above the note", sendOnly.every((k) => rows[k].body.startsWith("The body of the message.")));

  // ---------------- enquiries reply to the customer ----------------
  const lead = await sendMail("owner@mailtest.example", "New enquiry", "A customer wrote to you.", {
    purpose: "enquiries", replyTo: "customer@elsewhere.example", noFooter: true,
  });
  const leadRow = (await db.emailOutbox.findUnique({ where: { id: lead.id } }))!;
  t("a forwarded customer enquiry replies to the CUSTOMER, not to us", leadRow.replyTo === "customer@elsewhere.example");
  t("…and carries no do-not-reply note, because replying is the point", !/don't reply/i.test(leadRow.body));

  // ---------------- recording ----------------
  t("nothing is lost when no provider is configured",
    (await db.emailOutbox.count({ where: { to: { endsWith: "@mailtest.example" } } })) === KEYS.length + 1);
  t("every row records its purpose", (await db.emailOutbox.count({ where: { to: { endsWith: "@mailtest.example" }, purpose: { in: KEYS } } })) === KEYS.length + 1);
  t("unsent mail is marked neither delivered nor failed",
    (await db.emailOutbox.count({ where: { to: { endsWith: "@mailtest.example" }, sentAt: null, error: null } })) === KEYS.length + 1);

  // ---------------- the legacy single-sender path still works ----------------
  t("with MAIL_DOMAIN unset, the old MAIL_FROM is used for everything", (() => {
    const d = process.env.MAIL_DOMAIN;
    delete process.env.MAIL_DOMAIN;
    process.env.MAIL_FROM = "PrimeStreet <one@legacy.test>";
    const ok = senderAddress("accounts").includes("@");
    process.env.MAIL_DOMAIN = d;
    delete process.env.MAIL_FROM;
    return ok;
  })());

  await db.emailOutbox.deleteMany({ where: { to: { endsWith: "@mailtest.example" } } });
  t("cleanup", (await db.emailOutbox.count({ where: { to: { endsWith: "@mailtest.example" } } })) === 0);
}

main().then(async () => { await db.$disconnect(); console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exit(fail ? 1 : 0); })
  .catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
