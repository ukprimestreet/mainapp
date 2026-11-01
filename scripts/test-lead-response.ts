/**
 * What the business says it is doing, and what escalation does with it.
 *
 * The bug this closes: escalation read `deliveredAt` — "somebody opened the dashboard" — as evidence that a
 * business was dealing with a job, and at 24 hours took the job off anybody who had not. A trade who reads
 * the email on a phone and rings the customer immediately never opens a dashboard. The proxy punished the
 * best behaviour there is.
 *
 * So the assertions here are mostly about **who is left alone**: somebody who told us they rang the
 * customer, whether or not they ever looked at a dashboard.
 */
import { PrismaClient } from "@prisma/client";
import { creditBalance } from "../src/lib/credits";
import { createJobRequest, type JobInput } from "../src/lib/leads";
import {
  ESCALATE_AFTER_HOURS, REMIND_AFTER_HOURS, chaseUnopened, escalateUnopened, notifyAssignment,
} from "../src/lib/lead-notify";
import {
  isResponseKind, recordResponse, responseLink, responseToken, responseTokenValid,
} from "../src/lib/lead-response";
import { assignmentsFor, markDelivered, matchJobRequest } from "../src/lib/matching";
import { mailConfigured } from "../src/lib/mail";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

const MARK = "test-response-suite";
const SLUG = "response-suite-";
const OWNER = "owner@response-suite.example";
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);

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
  await db.emailOutbox.deleteMany({ where: { to: { contains: "response-suite" } } });
  const o = await db.owner.findUnique({ where: { email: OWNER }, select: { id: true } });
  if (o) { await db.ownerLoginToken.deleteMany({ where: { ownerId: o.id } }); await db.owner.delete({ where: { id: o.id } }); }
}

let seq = 0;

async function main() {
  delete process.env.RESEND_API_KEY;
  if (mailConfigured()) throw new Error("mail is still configured to send; refusing to run");
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET (32+ chars) must be set: the response links are signed with it");
  }
  await cleanup();

  const borough = (await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: "Hackney" } }))!;
  const here = (await db.place.findFirst({ where: { parentId: borough.id, kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } }, orderBy: { name: "asc" } }))!;
  const trade = (await db.category.findFirst({ where: { slug: "plumbing" } }))!;
  const any = (await db.business.findFirst({ where: { slug: { not: { startsWith: SLUG } } }, select: { locationId: true, cityId: true } }))!;
  const owner = await db.owner.create({ data: { email: OWNER, name: "Rory Response" } });

  async function trader(n: number, credits = 5) {
    const b = await db.business.create({
      data: {
        name: `Response Suite Trader ${n}`, slug: `${SLUG}${n}`,
        summary: "A fixture, created and removed by scripts/test-lead-response.ts.",
        description: "A fixture, created and removed by scripts/test-lead-response.ts.",
        categoryId: trade.id, locationId: any.locationId, cityId: any.cityId, published: true, isSample: false,
      },
    });
    await db.businessCategory.create({ data: { businessId: b.id, categoryId: trade.id, isPrimary: true } });
    await db.businessServiceArea.create({ data: { businessId: b.id, placeId: borough.id, mode: "INCLUDES_CHILDREN" } });
    await db.creditAccount.create({ data: { businessId: b.id, balance: credits } });
    await db.businessOwner.create({ data: { ownerId: owner.id, businessId: b.id } });
    return b;
  }

  async function job() {
    const input: JobInput = {
      name: "Response Suite Customer", email: `response-customer-${++seq}@example.test`, phone: "020 7946 0155",
      categoryId: trade.id, placeId: here.id,
      description: `A fixture job from the response suite, number ${seq}, long enough to pass validation.`,
      urgency: "WITHIN_A_WEEK", marketingOptIn: false,
    };
    return (await createJobRequest(input, MARK)).request;
  }

  // ---------------- the token
  const a1 = await trader(1);
  const j1 = await job();
  await matchJobRequest(j1.id);
  const asg = (await assignmentsFor(j1.id))[0];

  t("a response link is signed, not guessable", responseToken(asg.id).length >= 40);
  t("…and validates for its own assignment", responseTokenValid(asg.id, responseToken(asg.id)));
  t("…but not for another one", !responseTokenValid(asg.id, responseToken("some-other-assignment")));
  t("…nor with the signature truncated", !responseTokenValid(asg.id, responseToken(asg.id).slice(0, -4)));
  t("…nor empty", !responseTokenValid(asg.id, ""));
  t("the link points at the page that asks the question", responseLink(asg.id) === `/lead/${asg.id}/${responseToken(asg.id)}`);
  t("only the two answers are accepted", isResponseKind("CALLED") && isResponseKind("DECLINED") && !isResponseKind("MAYBE"));

  // ---------------- the email asks
  await notifyAssignment(asg.id);
  const mail = await db.emailOutbox.findFirst({ where: { to: OWNER }, orderBy: { createdAt: "desc" } });
  t("the lead email carries the one-click link", (mail?.body ?? "").includes(responseLink(asg.id)), mail?.body?.slice(0, 200));
  t("…and says what declining does, so it is not a scary button", /credit straight back/i.test(mail?.body ?? ""));

  // ---------------- "I have called them"
  const called = await recordResponse(asg.id, "CALLED");
  t("a business can say it contacted the customer", called.ok && called.kind === "CALLED");
  t("…which does NOT release the job", called.ok && called.released === false);
  const after = await db.leadAssignment.findUnique({ where: { id: asg.id } });
  t("…is recorded with what they said", after?.responseKind === "CALLED" && !!after?.respondedAt);
  t("…counts as having seen it, even though they never opened a dashboard", !!after?.deliveredAt);
  t("…and is audited", !!(await db.auditLog.findFirst({ where: { targetType: "JobRequest", targetId: j1.id, action: { contains: "contacted the customer" } } })));
  t("answering twice is refused rather than overwritten", !(await recordResponse(asg.id, "DECLINED")).ok);

  // ---------------- THE BUG: this is the business that used to lose the job
  await db.leadAssignment.update({
    where: { id: asg.id },
    // Sent two days ago, never opened the dashboard — exactly the trade who read the email and rang.
    data: { createdAt: hoursAgo(ESCALATE_AFTER_HOURS + 24), notifiedAt: hoursAgo(ESCALATE_AFTER_HOURS + 24), deliveredAt: null },
  });
  const balanceBefore = await creditBalance(a1.id);
  const escalated = await escalateUnopened();
  t("a business that told us it rang the customer KEEPS the job", escalated.taken === 0, JSON.stringify(escalated));
  t("…and keeps its credit", (await creditBalance(a1.id)) === balanceBefore);
  t("…and the assignment is untouched", (await db.leadAssignment.findUnique({ where: { id: asg.id } }))?.status === "PENDING");
  t("…and it is never chased either", (await chaseUnopened()).sent === 0);

  // ---------------- silence still loses the job
  const b1 = await trader(2);
  const j2 = await job();
  await matchJobRequest(j2.id);
  const quiet = (await assignmentsFor(j2.id)).find((x) => x.businessId === b1.id) ?? (await assignmentsFor(j2.id))[0];
  await notifyAssignment(quiet.id);
  await db.leadAssignment.update({
    where: { id: quiet.id },
    data: { createdAt: hoursAgo(ESCALATE_AFTER_HOURS + 1), notifiedAt: hoursAgo(ESCALATE_AFTER_HOURS + 1) },
  });
  const quietBalance = await creditBalance(quiet.businessId);
  const taken = await escalateUnopened();
  t("a business that said nothing at all still loses the job", taken.taken >= 1, JSON.stringify(taken));
  t("…and is refunded", (await creditBalance(quiet.businessId)) === quietBalance + 1);
  t("…with an honest reason: silence, not an unopened page",
    /no word from the business/i.test((await db.leadAssignment.findUnique({ where: { id: quiet.id } }))?.failedReason ?? ""));

  // ---------------- "I cannot take this job"
  const c1 = await trader(3);
  const j3 = await job();
  await matchJobRequest(j3.id);
  const declining = (await assignmentsFor(j3.id)).find((x) => x.businessId === c1.id) ?? (await assignmentsFor(j3.id))[0];
  const beforeDecline = await creditBalance(declining.businessId);
  const declined = await recordResponse(declining.id, "DECLINED");
  t("a business can decline a job", declined.ok && declined.kind === "DECLINED");
  t("…it is released immediately, not on the next hourly pass", declined.ok && declined.released);
  t("…the credit comes back", declined.ok && declined.refunded && (await creditBalance(declining.businessId)) === beforeDecline + 1);
  t("…the assignment is marked reversed, not deleted", (await db.leadAssignment.findUnique({ where: { id: declining.id } }))?.status === "REVERSED");
  t("…and it is audited as a decline", !!(await db.auditLog.findFirst({ where: { targetType: "JobRequest", targetId: j3.id, action: { contains: "declined" } } })));
  t("declining again says it is no longer theirs", !(await recordResponse(declining.id, "CALLED")).ok);

  // ---------------- a job that is no longer theirs
  const gone = await recordResponse(declining.id, "CALLED");
  t("answering a reversed assignment is refused with a reason a person can read",
    !gone.ok && gone.reason === "reversed" && /no longer yours/i.test(gone.message));
  const nonsense = await recordResponse("not-an-assignment", "CALLED");
  t("an unknown assignment is refused rather than throwing", !nonsense.ok && nonsense.reason === "unknown");

  // ---------------- opening the dashboard is still recorded, just not relied upon
  const d1 = await trader(4);
  const j4 = await job();
  await matchJobRequest(j4.id);
  const opened = (await assignmentsFor(j4.id)).find((x) => x.businessId === d1.id) ?? (await assignmentsFor(j4.id))[0];
  await notifyAssignment(opened.id);
  await markDelivered(opened.id);
  t("opening the dashboard is still recorded", !!(await db.leadAssignment.findUnique({ where: { id: opened.id } }))?.deliveredAt);
  await db.leadAssignment.update({
    where: { id: opened.id },
    data: { createdAt: hoursAgo(REMIND_AFTER_HOURS + 1), notifiedAt: hoursAgo(REMIND_AFTER_HOURS + 1) },
  });
  const chasedOpened = await chaseUnopened();
  t("…but somebody who only LOOKED is still chased, because looking is not answering",
    chasedOpened.sent >= 1, JSON.stringify(chasedOpened));
  const chaseMail = await db.emailOutbox.findFirst({ where: { to: OWNER, subject: { contains: "Still waiting" } }, orderBy: { createdAt: "desc" } });
  t("…and the chase gives them the one-click link", (chaseMail?.body ?? "").includes(responseLink(opened.id)));
  t("…and says what silence will cost them", new RegExp(`${ESCALATE_AFTER_HOURS} hours`).test(chaseMail?.body ?? ""));

  await cleanup();
  console.log(fail === 0 ? "\nALL LEAD RESPONSE TESTS PASS" : `\n${fail} FAILED`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1); });
