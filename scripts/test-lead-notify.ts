/**
 * Notification and escalation.
 *
 * Run with mail unconfigured (no `MAIL_DOMAIN`), which every suite here does: `sendMail` records to
 * `EmailOutbox` first and only then calls Resend, so this reads exactly what would have been sent without a
 * single real email leaving the building.
 *
 * Time is moved by writing `createdAt` and `notifiedAt` backwards. That is the honest way to test a thing
 * that happens after four hours: the alternative is waiting four hours, or trusting the arithmetic.
 *
 * The failure all of this exists to prevent: a business pays a credit, never opens its dashboard, and a
 * customer waits a week for a call that was never coming. Nobody reports that as a bug.
 */
import { PrismaClient } from "@prisma/client";
import { creditBalance } from "../src/lib/credits";
import { mailConfigured } from "../src/lib/mail";
import { createJobRequest, type JobInput } from "../src/lib/leads";
import {
  chaseUnopened, ESCALATE_AFTER_HOURS, escalateUnopened, notifyAssignment, notifyPendingAssignments,
  REMIND_AFTER_HOURS, runLeadNotifications, TELL_CUSTOMER_AFTER_HOURS, tellCustomerNothingYet,
} from "../src/lib/lead-notify";
import { assignmentsFor, markDelivered, matchJobRequest } from "../src/lib/matching";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

const MARK = "test-notify-suite";
const SLUG = "notify-suite-";
const OWNER = "owner@notify-suite.example";

async function cleanup() {
  const jobs = await db.jobRequest.findMany({ where: { ipHash: MARK }, select: { id: true } });
  const ids = jobs.map((j) => j.id);
  if (ids.length) {
    await db.matchDecision.deleteMany({ where: { jobRequestId: { in: ids } } });
    await db.leadAssignment.deleteMany({ where: { jobRequestId: { in: ids } } });
    await db.auditLog.deleteMany({ where: { targetType: "JobRequest", targetId: { in: ids } } });
    await db.jobRequest.deleteMany({ where: { id: { in: ids } } });
  }
  const biz = await db.business.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const bids = biz.map((b) => b.id);
  if (bids.length) {
    await db.matchDecision.deleteMany({ where: { businessId: { in: bids } } });
    await db.leadAssignment.deleteMany({ where: { businessId: { in: bids } } });
    await db.creditTransaction.deleteMany({ where: { businessId: { in: bids } } });
    await db.creditAccount.deleteMany({ where: { businessId: { in: bids } } });
    await db.businessServiceArea.deleteMany({ where: { businessId: { in: bids } } });
    await db.businessCategory.deleteMany({ where: { businessId: { in: bids } } });
    await db.businessOwner.deleteMany({ where: { businessId: { in: bids } } });
    await db.auditLog.deleteMany({ where: { targetType: "Business", targetId: { in: bids } } });
    await db.business.deleteMany({ where: { id: { in: bids } } });
  }
  await db.emailOutbox.deleteMany({ where: { OR: [{ to: { contains: "notify-suite" } }, { to: { contains: "notify-customer" } }] } });
  const o = await db.owner.findUnique({ where: { email: OWNER }, select: { id: true } });
  if (o) { await db.ownerLoginToken.deleteMany({ where: { ownerId: o.id } }); await db.owner.delete({ where: { id: o.id } }); }
}

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);
const outboxTo = (email: string) => db.emailOutbox.findMany({ where: { to: email }, orderBy: { createdAt: "asc" } });

let seq = 0;
async function job(categoryId: string, placeId: string) {
  const input: JobInput = {
    name: "Notify Suite Customer", email: `notify-customer-${++seq}@example.test`, phone: "020 7946 0188",
    categoryId, placeId, postcode: "E8 3AA",
    description: `A fixture job from the notification suite, number ${seq}, long enough to pass validation.`,
    urgency: "EMERGENCY", contactTime: "Mornings", marketingOptIn: false,
  };
  return (await createJobRequest(input, MARK)).request;
}

async function main() {
  await cleanup();
  // Mail is switched off IN THIS PROCESS rather than being assumed off, so the suite is safe to run on a
  // machine whose .env holds a real Resend key. `sendMail` still records to EmailOutbox, which is what is
  // being asserted. A test that emails strangers is not a test.
  delete process.env.RESEND_API_KEY;
  if (mailConfigured()) throw new Error("mail is still configured to send; refusing to run");

  const borough = (await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: "Hackney" } }))!;
  const here = (await db.place.findFirst({ where: { parentId: borough.id, kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } }, orderBy: { name: "asc" } }))!;
  const trade = (await db.category.findFirst({ where: { slug: "plumbing" } }))!;
  const lonely = (await db.category.findFirst({ where: { slug: "roofing" } }))!;
  const any = (await db.business.findFirst({ where: { slug: { not: { startsWith: SLUG } } }, select: { locationId: true, cityId: true } }))!;
  const owner = await db.owner.create({ data: { email: OWNER, name: "Nina Notify" } });

  async function trader(n: number, opts: { claimed?: boolean; email?: string | null; credits?: number } = {}) {
    const b = await db.business.create({
      data: {
        name: `Notify Suite Trader ${n}`, slug: `${SLUG}${n}`,
        summary: "A fixture, created and removed by scripts/test-lead-notify.ts.",
        description: "A fixture, created and removed by scripts/test-lead-notify.ts.",
        categoryId: trade.id, locationId: any.locationId, cityId: any.cityId,
        published: true, isSample: false, email: opts.email ?? null,
      },
    });
    await db.businessCategory.create({ data: { businessId: b.id, categoryId: trade.id, isPrimary: true } });
    await db.businessServiceArea.create({ data: { businessId: b.id, placeId: borough.id, mode: "INCLUDES_CHILDREN" } });
    await db.creditAccount.create({ data: { businessId: b.id, balance: opts.credits ?? 5 } });
    if (opts.claimed !== false) await db.businessOwner.create({ data: { ownerId: owner.id, businessId: b.id } });
    return b;
  }

  // ---------------- a business is told, once
  const a = await trader(1);
  const j1 = await job(trade.id, here.id);
  const r1 = await matchJobRequest(j1.id);
  t("the job was assigned", r1.assigned.length === 1);
  const asg1 = (await assignmentsFor(j1.id))[0];
  t("…and nothing has been sent yet, because the matcher does not send email", asg1.notifiedAt === null);

  const first = await notifyAssignment(asg1.id);
  t("the business is emailed", first.sent === 1);
  const mail = await outboxTo(OWNER);
  t("…once", mail.length === 1);
  t("…from the enquiries address, not the marketing one", mail[0].purpose === "enquiries");
  t("…with the reference in the subject, so a reply can be matched to it", mail[0].subject.includes(j1.reference));
  t("…and the trade and area in the subject", /plumbing/i.test(mail[0].subject) && mail[0].subject.includes(here.label));
  t("the email carries the customer's phone number, which is what the credit bought", mail[0].body.includes("020 7946 0188"));
  t("…their name", mail[0].body.includes("Notify Suite Customer"));
  t("…the urgency, because an emergency reads differently from 'planning'", /emergency/i.test(mail[0].body));
  t("…the job description", mail[0].body.includes("fixture job from the notification suite"));
  t("…the best time to call", /mornings/i.test(mail[0].body));
  t("…that a credit was charged", /one lead credit has been charged/i.test(mail[0].body));
  t("…the two-business promise, so they know it is worth ringing", /maximum of two/i.test(mail[0].body));
  t("…a link to their dashboard", mail[0].body.includes(`/owner/business/${a.id}/leads`));
  t("…and the limit on what they may do with the details", /this job only/i.test(mail[0].body));
  t("it was NOT actually sent, because mail is off for this suite", mail[0].sentAt === null);
  t("the assignment records that it was told", !!(await db.leadAssignment.findUnique({ where: { id: asg1.id } }))?.notifiedAt);

  const again = await notifyAssignment(asg1.id);
  t("telling them twice sends nothing", again.sent === 0 && (await outboxTo(OWNER)).length === 1);

  // ---------------- a business with nobody to email is a visible gap, not a silent success
  const orphan = await trader(2, { claimed: false, email: null });
  await db.businessServiceArea.deleteMany({ where: { businessId: a.id } }); // so the orphan is the only option
  const j2 = await job(trade.id, here.id);
  await matchJobRequest(j2.id);
  const asg2 = (await assignmentsFor(j2.id))[0];
  const none = await notifyAssignment(asg2.id);
  t("a business with no address cannot be emailed", none.sent === 0 && none.reason === "no address");
  t("…and is left unnotified rather than marked as told", (await db.leadAssignment.findUnique({ where: { id: asg2.id } }))?.notifiedAt === null);
  t("…with the gap recorded where somebody will see it",
    !!(await db.auditLog.findFirst({ where: { targetType: "Business", targetId: orphan.id, action: { contains: "not possible" } } })));

  // The business's own address is used when nobody has claimed it.
  await db.business.update({ where: { id: orphan.id }, data: { email: "trader2@notify-suite.example" } });
  const viaBusiness = await notifyAssignment(asg2.id);
  t("an unclaimed business is emailed at its own address", viaBusiness.sent === 1);
  t("…and only that address, not twice", (await outboxTo("trader2@notify-suite.example")).length === 1);

  // ---------------- the sweep catches anything missed
  await db.businessServiceArea.create({ data: { businessId: a.id, placeId: borough.id, mode: "INCLUDES_CHILDREN" } });
  const j3 = await job(trade.id, here.id);
  await matchJobRequest(j3.id);
  const swept = await notifyPendingAssignments();
  t("the sweep sends anything that was never notified", swept.sent >= 1, JSON.stringify(swept));
  t("…and a second sweep sends nothing", (await notifyPendingAssignments()).sent === 0);

  // ---------------- chasing
  const beforeChase = (await outboxTo(OWNER)).length;
  const fresh = (await assignmentsFor(j3.id)).find((x) => x.businessId === a.id)!;
  t("a job notified five minutes ago is not chased", (await chaseUnopened()).sent === 0);

  await db.leadAssignment.update({ where: { id: fresh.id }, data: { notifiedAt: hoursAgo(REMIND_AFTER_HOURS + 1), createdAt: hoursAgo(REMIND_AFTER_HOURS + 1) } });
  const chased = await chaseUnopened();
  t(`one unopened for over ${REMIND_AFTER_HOURS} hours is chased`, chased.sent === 1, JSON.stringify(chased));
  const chaseMail = (await outboxTo(OWNER)).slice(beforeChase);
  t("…with a subject that says it is still waiting", /still waiting/i.test(chaseMail[0].subject));
  t("…saying the customer is waiting, which is the actual point", /customer is waiting/i.test(chaseMail[0].body));
  t("…offering the way out rather than only nagging", /tell us and we will pass it on/i.test(chaseMail[0].body));
  t("…and warning what happens next", new RegExp(`${ESCALATE_AFTER_HOURS} hours`).test(chaseMail[0].body));
  t("chasing twice sends nothing", (await chaseUnopened()).sent === 0);
  t("…and the chase is recorded on the row", !!(await db.leadAssignment.findUnique({ where: { id: fresh.id } }))?.remindedAt);

  // ---------------- opening it stops the chasing
  const j4 = await job(trade.id, here.id);
  await matchJobRequest(j4.id);
  const opened = (await assignmentsFor(j4.id)).find((x) => x.businessId === a.id)!;
  await notifyAssignment(opened.id);
  await db.leadAssignment.update({ where: { id: opened.id }, data: { notifiedAt: hoursAgo(REMIND_AFTER_HOURS + 1), createdAt: hoursAgo(REMIND_AFTER_HOURS + 1) } });
  await markDelivered(opened.id);
  t("a business that has opened the job is not chased", (await chaseUnopened()).sent === 0);

  // ---------------- escalation
  const balanceBefore = await creditBalance(a.id);
  const second = await trader(3);
  await db.leadAssignment.update({ where: { id: fresh.id }, data: { createdAt: hoursAgo(ESCALATE_AFTER_HOURS + 1) } });
  const escalated = await escalateUnopened();
  t(`a job unopened for over ${ESCALATE_AFTER_HOURS} hours is taken back`, escalated.taken >= 1, JSON.stringify(escalated));
  t("…the credit is refunded, because charging for a job nobody looked at is indefensible",
    (await creditBalance(a.id)) === balanceBefore + 1, `${balanceBefore} -> ${await creditBalance(a.id)}`);
  t("…the assignment is marked reversed rather than deleted", (await db.leadAssignment.findUnique({ where: { id: fresh.id } }))?.status === "REVERSED");
  t("…with the reason on the row", /not opened within/i.test((await db.leadAssignment.findUnique({ where: { id: fresh.id } }))?.failedReason ?? ""));
  t("…the business is told it lost the job", (await outboxTo(OWNER)).some((m) => /taken back/i.test(m.subject)));
  t("…and told its credit is back", (await outboxTo(OWNER)).some((m) => /credit has been put back/i.test(m.body)));
  t("…and pointed at the areas it can change itself", (await outboxTo(OWNER)).some((m) => m.body.includes(`/areas`)));
  t("the job was given to somebody else", escalated.reassigned >= 1, JSON.stringify(escalated));
  const now = (await assignmentsFor(j3.id)).filter((x) => x.status !== "REVERSED");
  t("…who is a different business", now.length >= 1 && now.every((x) => x.businessId !== a.id || x.status === "REVERSED"));
  t("…and who was emailed about it", now.every((x) => !!x.notifiedAt));
  t("escalating again does nothing to the same row", (await escalateUnopened()).taken === 0);

  // ---------------- a closed request is left alone
  const j5 = await job(trade.id, here.id);
  await matchJobRequest(j5.id);
  const onClosed = (await assignmentsFor(j5.id))[0];
  await db.leadAssignment.update({ where: { id: onClosed.id }, data: { createdAt: hoursAgo(ESCALATE_AFTER_HOURS + 2), notifiedAt: hoursAgo(ESCALATE_AFTER_HOURS + 2) } });
  await db.jobRequest.update({ where: { id: j5.id }, data: { status: "CLOSED" } });
  t("a closed request is not escalated", (await escalateUnopened()).taken === 0);
  t("…and its assignment is left as it was", (await db.leadAssignment.findUnique({ where: { id: onClosed.id } }))?.status === "PENDING");

  // ---------------- the customer is told, honestly, once
  const nobody = await job(lonely.id, here.id);
  await matchJobRequest(nobody.id);
  t("nobody could take it", (await assignmentsFor(nobody.id)).length === 0);
  // Scoped to THIS request rather than to the whole run: `tellCustomerNothingYet()` is global, so asserting
  // that it sent nothing at all would be asserting something about whatever else happens to be in dev.
  await tellCustomerNothingYet();
  t("a request six minutes old does not email the customer yet", (await outboxTo(nobody.email)).length === 0);

  await db.jobRequest.update({ where: { id: nobody.id }, data: { createdAt: hoursAgo(TELL_CUSTOMER_AFTER_HOURS + 1) } });
  const told = await tellCustomerNothingYet();
  t(`after ${TELL_CUSTOMER_AFTER_HOURS} hours the customer is told`, told.sent === 1, JSON.stringify(told));
  const custMail = await outboxTo((await db.jobRequest.findUnique({ where: { id: nobody.id } }))!.email);
  t("…in plain words, that we have not found anyone", /not managed to find you anyone/i.test(custMail[0].body));
  t("…telling them not to hold out for us if it is urgent", /do not hold out for us/i.test(custMail[0].body));
  t("…giving them the reference", custMail[0].body.includes(nobody.reference));
  t("…and confirming nobody has their details", /not passed your details/i.test(custMail[0].body));
  t("the request is marked as escalated, so it is visible as such", (await db.jobRequest.findUnique({ where: { id: nobody.id } }))?.status === "ESCALATED");
  t("…with the time we told them", !!(await db.jobRequest.findUnique({ where: { id: nobody.id } }))?.customerNotifiedAt);
  t("…and an audit row", !!(await db.auditLog.findFirst({ where: { targetType: "JobRequest", targetId: nobody.id, action: { contains: "Customer told" } } })));
  t("telling them twice sends nothing", (await tellCustomerNothingYet()).sent === 0 && custMail.length === 1);

  // ---------------- a customer who HAS somebody is never told nobody came
  const assignedJob = await job(trade.id, here.id);
  await matchJobRequest(assignedJob.id);
  await db.jobRequest.update({ where: { id: assignedJob.id }, data: { createdAt: hoursAgo(TELL_CUSTOMER_AFTER_HOURS + 2) } });
  await tellCustomerNothingYet();
  const assignedCustomer = (await db.jobRequest.findUnique({ where: { id: assignedJob.id } }))!;
  t("a customer whose job WAS assigned is not told we found nobody",
    (await outboxTo(assignedCustomer.email)).length === 0, "the worst possible email to send somebody who is about to get a call");

  // ---------------- the whole pass
  const pass = await runLeadNotifications();
  t("one pass reports each stage", !!pass.notified && !!pass.chased && !!pass.escalated && !!pass.customers);
  t("…and a second pass sends nothing at all, so a cron firing twice is harmless",
    (() => { return true; })());
  const quiet = await runLeadNotifications();
  t("a repeat pass is silent", quiet.notified.sent === 0 && quiet.chased.sent === 0 && quiet.escalated.taken === 0 && quiet.customers.sent === 0,
    JSON.stringify(quiet));

  await cleanup();
  console.log(fail === 0 ? "\nALL LEAD NOTIFICATION TESTS PASS" : `\n${fail} FAILED`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1); });
