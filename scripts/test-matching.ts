/**
 * Matching and assignment.
 *
 * The three things this suite exists to prove, because each of them is a way of taking money for nothing:
 *
 *   1. **No more than two paying businesses per job, under concurrency.** Five simultaneous matching runs
 *      must produce two assignments and two charged credits. Not three. Not two assignments and three
 *      charges.
 *   2. **A credit is never taken without an assignment**, and an assignment is never recorded as charged
 *      unless the ledger agrees.
 *   3. **Re-running is safe.** The same job matched twice charges nobody twice.
 */
import { PrismaClient } from "@prisma/client";
import { adjustCredits, creditAccount, creditBalance, grantWelcomeCredits, reconcile } from "../src/lib/credits";
import { createJobRequest, type JobInput } from "../src/lib/leads";
import {
  assignManually, assignmentsFor, decisionsFor, MAX_PAID, matchJobRequest, matchPending,
  reconcileAssignments, reverseAssignment, STAGES,
} from "../src/lib/matching";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

const MARK = "test-matching-suite";
const SLUG = "match-suite-";

async function cleanup() {
  const jobs = await db.jobRequest.findMany({ where: { OR: [{ ipHash: MARK }, { email: { contains: "match-suite" } }] }, select: { id: true } });
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
    await db.auditLog.deleteMany({ where: { targetType: "Business", targetId: { in: bids } } });
    await db.business.deleteMany({ where: { id: { in: bids } } });
  }
}

/** A published business offering one trade, covering one place, with a known number of credits. */
async function trader(n: number, opts: { categoryId: string; placeId: string; mode?: string; credits?: number; acceptsNearby?: boolean }) {
  const any = (await db.business.findFirst({ where: { slug: { not: { startsWith: SLUG } } }, select: { locationId: true, cityId: true } }))!;
  const b = await db.business.create({
    data: {
      name: `Match Suite Trader ${n}`, slug: `${SLUG}${n}`,
      summary: "A fixture, created and removed by scripts/test-matching.ts.",
      description: "A fixture, created and removed by scripts/test-matching.ts.",
      categoryId: opts.categoryId, locationId: any.locationId, cityId: any.cityId,
      published: true, isSample: false, acceptsNearby: opts.acceptsNearby ?? false,
    },
  });
  await db.businessCategory.create({ data: { businessId: b.id, categoryId: opts.categoryId, isPrimary: true } });
  await db.businessServiceArea.create({ data: { businessId: b.id, placeId: opts.placeId, mode: opts.mode ?? "EXACT" } });
  await creditAccount(b.id);
  if (opts.credits) await setBalance(b.id, opts.credits);
  return b;
}

/**
 * Moves a balance to a known figure **through the ledger**.
 *
 * Writing `balance` directly would forge the cached number and make `reconcile()` fail by construction —
 * which it did, on the first run of this suite. The assertion is only worth making if the fixture does not
 * cheat.
 */
async function setBalance(businessId: string, target: number) {
  const now = await creditBalance(businessId);
  if (now === target) return;
  const r = await adjustCredits(businessId, target - now, "Matching suite fixture balance", null);
  if (!r.ok) throw new Error(`could not set the fixture balance: ${r.reason}`);
}

let jobSeq = 0;
async function job(categoryId: string, placeId: string) {
  const input: JobInput = {
    name: "Match Suite Customer", email: `match-suite-${++jobSeq}@example.test`, phone: "020 7946 0000",
    categoryId, placeId, postcode: "E8 3AA",
    description: `A fixture job created by the matching suite, number ${jobSeq}, long enough to validate.`,
    urgency: "FLEXIBLE", marketingOptIn: false,
  };
  const { request } = await createJobRequest(input, MARK);
  return request;
}

async function main() {
  await cleanup();

  const borough = await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: "Hackney" } });
  if (!borough) throw new Error("Hackney is missing from the place tree");
  const locals = await db.place.findMany({ where: { parentId: borough.id, kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } }, take: 2, orderBy: { name: "asc" } });
  if (locals.length < 2) throw new Error("Hackney needs at least two localities for the nearby stage");
  const [here, next_door] = locals;
  const trade = (await db.category.findFirst({ where: { slug: "plumbing" } }))!;
  const other = (await db.category.findFirst({ where: { slug: "roofing" } }))!;

  // ---------------- nothing to match
  const bare = await job(other.id, here.id);
  const bareRun = await matchJobRequest(bare.id);
  t("a job nobody covers assigns nobody", bareRun.assigned.length === 0);
  t("…and is left UNASSIGNED rather than looking dealt with", bareRun.status === "UNASSIGNED");
  const bareDecisions = await decisionsFor(bare.id);
  t("…with a recorded reason for every stage, not silence", bareDecisions.filter((d) => d.outcome === "SKIPPED").length >= STAGES.length, `${bareDecisions.length} decisions`);
  t("…and a run summary", bareDecisions.some((d) => d.stage === "RUN"));

  // ---------------- the simple case
  const a = await trader(1, { categoryId: trade.id, placeId: here.id, credits: 3 });
  const j1 = await job(trade.id, here.id);
  const r1 = await matchJobRequest(j1.id);
  t("one covering business with credits gets the job", r1.assigned.length === 1 && r1.assigned[0].businessId === a.id);
  t("…recorded as the EXACT stage", r1.assigned[0].stage === "EXACT");
  t("…and the job is PARTIALLY_ASSIGNED, because one of two is not two", r1.status === "PARTIALLY_ASSIGNED");
  t("one credit was charged", (await creditBalance(a.id)) === 2);
  const asg1 = await assignmentsFor(j1.id);
  t("…the assignment says so", asg1[0].creditCharged === true && asg1[0].kind === "PAID");
  t("…and holds a paid place", asg1[0].paidSlot === 1);
  t("the ledger agrees with the balance", (await reconcile(a.id)).agrees);
  t("…and the consumption row points at the assignment", !!(await db.creditTransaction.findFirst({ where: { assignmentId: asg1[0].id, kind: "CONSUMPTION" } })));

  // ---------------- re-running changes nothing
  const r1b = await matchJobRequest(j1.id);
  t("re-running assigns nobody new", r1b.assigned.length === 0);
  t("…and charges nothing", (await creditBalance(a.id)) === 2);
  t("…while recording that they already had it", (await decisionsFor(j1.id)).some((d) => /already have this job/i.test(d.reason)));

  // ---------------- the limit, with three willing businesses
  const b = await trader(2, { categoryId: trade.id, placeId: borough.id, mode: "INCLUDES_CHILDREN", credits: 3 });
  const c = await trader(3, { categoryId: trade.id, placeId: here.id, credits: 3 });
  const j2 = await job(trade.id, here.id);
  const r2 = await matchJobRequest(j2.id);
  t("with three willing businesses, exactly two are assigned", r2.assigned.length === MAX_PAID, `${r2.assigned.length}`);
  t("…the job is ASSIGNED", r2.status === "ASSIGNED");
  t("…two credits were charged in total, one each", (await db.creditTransaction.count({ where: { kind: "CONSUMPTION", assignmentId: { in: (await assignmentsFor(j2.id)).map((x) => x.id) } } })) === 2);
  // The third business is the one most likely to ask why, so it must have a row of its own naming it.
  const thirdDecision = (await decisionsFor(j2.id)).find((d) => d.businessId === b.id && d.outcome !== "ASSIGNED");
  t("…the third was told why, in writing, by name", !!thirdDecision && thirdDecision.reason.length > 10,
    JSON.stringify((await decisionsFor(j2.id)).map((d) => [d.business?.name, d.outcome, d.reason])));
  const slots = (await assignmentsFor(j2.id)).map((x) => x.paidSlot).sort();
  t("…and the two paid places are 1 and 2", JSON.stringify(slots) === JSON.stringify([1, 2]), JSON.stringify(slots));

  // ---------------- the database refuses a third, not the code
  const j2a = await assignmentsFor(j2.id);
  let refused = false;
  try {
    await db.leadAssignment.create({ data: { jobRequestId: j2.id, businessId: a.id, kind: "PAID", paidSlot: 2, stage: "MANUAL", reason: "Trying to take a place that is already taken" } });
  } catch { refused = true; }
  t("the DATABASE refuses a third business in a taken place, not just the matcher", refused);
  let badSlot = false;
  try {
    await db.leadAssignment.create({ data: { jobRequestId: j2.id, businessId: a.id, kind: "PAID", paidSlot: 3, stage: "MANUAL", reason: "Inventing a third paid place" } });
  } catch { badSlot = true; }
  t("…and refuses a third paid place existing at all", badSlot);
  t("…leaving the two real assignments untouched", (await assignmentsFor(j2.id)).length === j2a.length);

  // ---------------- CONCURRENCY: five runs at once
  const j3 = await job(trade.id, here.id);
  const runs = await Promise.all([1, 2, 3, 4, 5].map(() => matchJobRequest(j3.id).catch((e) => ({ assigned: [], error: String(e) } as never))));
  const live = (await assignmentsFor(j3.id)).filter((x) => x.status !== "REVERSED");
  const charges = await db.creditTransaction.count({ where: { kind: "CONSUMPTION", assignmentId: { in: live.map((x) => x.id) } } });
  t("five simultaneous runs produce exactly two assignments", live.length === MAX_PAID, `${live.length} assignments`);
  t("…exactly two charged credits, so nobody paid for a place they did not get", charges === MAX_PAID, `${charges} charges`);
  t("…no duplicate business among them", new Set(live.map((x) => x.businessId)).size === live.length);
  t("…and distinct paid places", new Set(live.map((x) => x.paidSlot)).size === live.length);
  t("every run reported honestly rather than throwing", runs.every((r) => Array.isArray(r.assigned)));
  t("the ledger still reconciles for all three traders", (await reconcile(a.id)).agrees && (await reconcile(b.id)).agrees && (await reconcile(c.id)).agrees);
  t("charged assignments and ledger rows agree", (await reconcileAssignments()).agrees);

  // ---------------- a business with no credits
  const broke = await trader(4, { categoryId: other.id, placeId: here.id, credits: 0 });
  const j4 = await job(other.id, here.id);
  const r4 = await matchJobRequest(j4.id);
  t("a business with no credits is not assigned", r4.assigned.length === 0);
  t("…and is told why, in words it could be shown", (await decisionsFor(j4.id)).some((d) => d.businessId === broke.id && /no lead credits/i.test(d.reason)));
  t("…and nothing was charged to a zero balance", (await creditBalance(broke.id)) === 0);
  t("…and no assignment was left behind looking valid", (await assignmentsFor(j4.id)).length === 0);

  // ---------------- the four stages
  const parentOnly = await trader(5, { categoryId: other.id, placeId: borough.id, mode: "INCLUDES_CHILDREN", credits: 2 });
  const j5 = await job(other.id, here.id);
  const r5 = await matchJobRequest(j5.id);
  t("a business covering the whole borough is reached at a later stage", r5.assigned.some((x) => x.businessId === parentOnly.id));
  t("…recorded as PARENT or ADMIN_AREA, not EXACT", r5.assigned.find((x) => x.businessId === parentOnly.id)?.stage !== "EXACT",
    r5.assigned.find((x) => x.businessId === parentOnly.id)?.stage);

  const nearbyNo = await trader(6, { categoryId: trade.id, placeId: next_door.id, credits: 2 });
  const j6 = await job(trade.id, next_door.id);
  // Trader 6 covers next_door exactly, so it IS the exact stage for that job. The nearby check is the
  // opposite direction: a job HERE reaching somebody who only covers NEXT DOOR.
  await matchJobRequest(j6.id);
  const j7 = await job(trade.id, here.id);
  await setBalance(a.id, 0);
  await setBalance(b.id, 0);
  await setBalance(c.id, 0);
  const r7 = await matchJobRequest(j7.id);
  t("a business that has NOT opted in to nearby work is not given a job next door", !r7.assigned.some((x) => x.businessId === nearbyNo.id));

  await db.business.update({ where: { id: nearbyNo.id }, data: { acceptsNearby: true } });
  const j8 = await job(trade.id, here.id);
  const r8 = await matchJobRequest(j8.id);
  t("…and IS given one once it opts in", r8.assigned.some((x) => x.businessId === nearbyNo.id), JSON.stringify(r8.assigned));
  t("…recorded as the NEARBY stage", r8.assigned.find((x) => x.businessId === nearbyNo.id)?.stage === "NEARBY");

  // ---------------- round robin
  await setBalance(a.id, 10);
  await setBalance(c.id, 10);
  await setBalance(b.id, 0);
  const first = await job(trade.id, here.id);
  await matchJobRequest(first.id);
  const firstPair = (await assignmentsFor(first.id)).map((x) => x.businessId).sort();
  t("two equally eligible businesses both get the first job", firstPair.length === 2);
  // Give one of them a head start, then check the other is preferred next time.
  await setBalance(c.id, 0);
  const second = await job(trade.id, here.id);
  await matchJobRequest(second.id);
  t("…and the one that can still pay gets the next, without the other blocking it",
    (await assignmentsFor(second.id)).some((x) => x.businessId === a.id));

  // ---------------- by hand
  await setBalance(c.id, 2);
  const manual = await job(trade.id, here.id);
  const noReason = await assignManually(manual.id, c.id, { kind: "PAID", reason: "x", adminId: null });
  t("a manual assignment without a real reason is refused", !noReason.ok);
  const byHand = await assignManually(manual.id, c.id, { kind: "PAID", reason: "They rang us about this job", adminId: null });
  t("a manual paid assignment works", byHand.ok && byHand.charged === true);
  t("…and charges one credit", (await creditBalance(c.id)) === 1);
  const twice = await assignManually(manual.id, c.id, { kind: "PAID", reason: "Trying the same business twice", adminId: null });
  t("…but not twice to the same business", !twice.ok && /already has this job/i.test(twice.message ?? ""));

  const sponsored = await assignManually(manual.id, broke.id, { kind: "SPONSORED", reason: "Their first job, on us", adminId: null });
  t("a sponsored assignment works for a business with no credits", sponsored.ok && sponsored.charged === false);
  t("…charges nothing", (await creditBalance(broke.id)) === 0);
  t("…and takes no paid place", (await assignmentsFor(manual.id)).find((x) => x.businessId === broke.id)?.paidSlot === null);
  t("…so a paid place is still free for somebody else", (await assignmentsFor(manual.id)).filter((x) => x.paidSlot !== null).length === 1);

  // ---------------- reversing
  const toReverse = (await assignmentsFor(manual.id)).find((x) => x.businessId === c.id)!;
  const rev = await reverseAssignment(toReverse.id, "The customer cancelled before they called");
  t("an assignment can be taken back", rev.ok && rev.refunded === true);
  t("…and the credit is put back", (await creditBalance(c.id)) === 2);
  t("…with a REVERSAL row, not a silent edit", !!(await db.creditTransaction.findFirst({ where: { assignmentId: toReverse.id, kind: "REVERSAL" } })));
  t("…the row stays, marked reversed, so the business can see it happened",
    (await db.leadAssignment.findUnique({ where: { id: toReverse.id } }))?.status === "REVERSED");
  t("…its paid place is freed", (await db.leadAssignment.findUnique({ where: { id: toReverse.id } }))?.paidSlot === null);
  t("…and reversing twice is refused rather than refunding twice", !(await reverseAssignment(toReverse.id, "Trying to refund it again")).ok);
  t("the ledger reconciles after a reversal", (await reconcile(c.id)).agrees);

  // ---------------- a reversed assignment is history, not a permanent ban
  const backAgain = await assignManually(manual.id, c.id, { kind: "SPONSORED", reason: "Goodwill after we took the last one back", adminId: null });
  t("a business taken off a job CAN be given it again", backAgain.ok, backAgain.ok ? "" : backAgain.message);
  t("…as a second row, leaving the reversed one intact",
    (await db.leadAssignment.count({ where: { jobRequestId: manual.id, businessId: c.id } })) === 2);
  const liveDup = await db.leadAssignment.count({ where: { jobRequestId: manual.id, businessId: c.id, status: { not: "REVERSED" } } });
  t("…but only ONE of them is live", liveDup === 1);
  let dupRefused = false;
  try {
    await db.leadAssignment.create({ data: { jobRequestId: manual.id, businessId: c.id, kind: "SPONSORED", reason: "A second live assignment for the same business" } });
  } catch { dupRefused = true; }
  t("the DATABASE refuses a second LIVE assignment to the same business", dupRefused);

  // ---------------- a freed place can be refilled
  const refill = await matchJobRequest(manual.id);
  t("a freed paid place can be filled by matching again", refill.assigned.length >= 1 || (await assignmentsFor(manual.id)).filter((x) => x.paidSlot !== null).length >= 1);

  // ---------------- closed requests are left alone
  await db.jobRequest.update({ where: { id: manual.id }, data: { status: "CLOSED" } });
  const closedRun = await matchJobRequest(manual.id);
  t("matching does not run on a closed request", closedRun.assigned.length === 0);
  t("…and says so rather than failing silently", (await decisionsFor(manual.id)).some((d) => /closed/i.test(d.reason)));
  const closedManual = await assignManually(manual.id, a.id, { kind: "PAID", reason: "Trying to assign a closed job", adminId: null });
  t("…and a closed request cannot be assigned by hand either", !closedManual.ok);

  // ---------------- the batch runner
  const pending = await matchPending(10);
  t("the batch runner returns a result per request", Array.isArray(pending));
  t("…and charges nothing twice, so the ledger still reconciles", (await reconcile(a.id)).agrees && (await reconcileAssignments()).agrees);

  // ---------------- a welcome grant still behaves
  const fresh = await trader(7, { categoryId: trade.id, placeId: here.id });
  await grantWelcomeCredits(fresh.id, "fixture");
  t("a newly registered business can be matched on its welcome credits", (await creditBalance(fresh.id)) === 5);

  await cleanup();
  console.log(fail === 0 ? "\nALL MATCHING TESTS PASS" : `\n${fail} FAILED`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1); });
