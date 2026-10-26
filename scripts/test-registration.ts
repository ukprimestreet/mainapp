// Business registration (D5) and the lead-credit ledger.
// The concurrency checks matter most here: a bug in either is money.
import { PrismaClient } from "@prisma/client";
import {
  adjustCredits, creditBalance, creditPurchase, grantWelcomeCredits, reconcile, reverseCredits,
  spendCredits, WELCOME_CREDITS,
} from "../src/lib/credits";
import {
  approveRegistration, checkExisting, registrationEvidence, rejectRegistration, submitRegistration,
  validate, verifyRegistrationEmail, type RegistrationInput,
} from "../src/lib/registration";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const MARK = "regtest";

async function cleanup() {
  const subs = await db.businessSubmission.findMany({ where: { submitterEmail: { contains: MARK } }, select: { id: true, businessId: true } });
  const bizFromSubs = subs.map((s) => s.businessId).filter(Boolean) as string[];
  const biz = await db.business.findMany({ where: { OR: [{ slug: { startsWith: `${MARK}-` } }, { id: { in: bizFromSubs } }] }, select: { id: true } });
  const ids = biz.map((b) => b.id);
  if (ids.length) {
    await db.creditTransaction.deleteMany({ where: { businessId: { in: ids } } });
    await db.creditAccount.deleteMany({ where: { businessId: { in: ids } } });
    await db.businessServiceArea.deleteMany({ where: { businessId: { in: ids } } });
    await db.businessCategory.deleteMany({ where: { businessId: { in: ids } } });
    await db.businessOwner.deleteMany({ where: { businessId: { in: ids } } });
    await db.auditLog.deleteMany({ where: { targetId: { in: ids } } });
    await db.business.deleteMany({ where: { id: { in: ids } } });
  }
  if (subs.length) {
    await db.auditLog.deleteMany({ where: { targetId: { in: subs.map((s) => s.id) } } });
    await db.businessSubmission.deleteMany({ where: { id: { in: subs.map((s) => s.id) } } });
  }
  await db.owner.deleteMany({ where: { email: { contains: MARK } } });
}

async function main() {
  await cleanup();

  const cat = await db.category.findFirst({ where: { slug: "cleaning" } });
  const cat2 = await db.category.findFirst({ where: { slug: "removals" } });
  const borough = await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: "Barking and Dagenham" } });
  const locality = await db.place.findFirst({ where: { parentId: borough!.id, kind: { in: ["LOCALITY", "SUBURB", "TOWN"] }, legacyLocationId: { not: null } } })
    ?? await db.place.findFirst({ where: { legacyLocationId: { not: null }, kind: { in: ["LOCALITY", "SUBURB", "TOWN"] } } });
  if (!cat || !cat2 || !borough || !locality) throw new Error("Reference data missing. Run the geography import first.");

  const base: RegistrationInput = {
    businessName: "Regtest Cleaning Co",
    description: "We clean homes and offices across east London, with the same team each visit and no contract. ".repeat(2),
    phone: "020 7946 0100",
    website: "https://regtest-cleaning.example",
    postcode: "RM10 7AA",
    address: "1 Test Street",
    udprn: "12345678",
    placeId: locality.id,
    categoryIds: [cat.id],
    serviceAreaIds: [borough.id],
    serviceAreaMode: "INCLUDES_CHILDREN",
    contactName: "Reg Tester",
    contactEmail: `owner@${MARK}.example`,
    contactRole: "Director",
  };

  // ---------------- validation happens on the server
  t("a good registration validates", (await validate(base)).length === 0, JSON.stringify(await validate(base)));
  t("a thin description is refused", (await validate({ ...base, description: "We clean." })).some((p) => p.field === "description"));
  t("HTML in the description is refused", (await validate({ ...base, description: "<b>" + "x".repeat(80) })).some((p) => p.field === "description"));
  t("a bad email is refused", (await validate({ ...base, contactEmail: "nope" })).some((p) => p.field === "contactEmail"));
  t("no category is refused", (await validate({ ...base, categoryIds: [] })).some((p) => p.field === "categoryIds"));
  t("an invented category id is refused", (await validate({ ...base, categoryIds: ["made-up"] })).some((p) => p.field === "categoryIds"));
  t("no service area is refused", (await validate({ ...base, serviceAreaIds: [] })).some((p) => p.field === "serviceAreaIds"));
  t("an invented place id is refused", (await validate({ ...base, placeId: "made-up" })).some((p) => p.field === "placeId"));
  t("an http website is refused", (await validate({ ...base, website: "javascript:alert(1)" })).some((p) => p.field === "website"));
  t("no role is refused", (await validate({ ...base, contactRole: "" })).some((p) => p.field === "contactRole"));

  // ---------------- an existing listing becomes a claim, not a duplicate
  const existing = await db.business.findFirst({ where: { published: true }, include: { location: true, place: true } });
  const dupeProbe = await checkExisting({
    businessName: existing!.name,
    website: existing!.website ?? undefined,
    placeId: existing!.placeId ?? locality.id,
  });
  t("a business we already list is detected", dupeProbe?.business.id === existing!.id, `got ${dupeProbe?.business.name ?? "nothing"}`);
  t("…with a reason we could show the person", !!dupeProbe?.reason, dupeProbe?.reason ?? "");
  t("an unrelated name is not flagged as a duplicate", (await checkExisting({ businessName: "Zzyzx Quantum Hedge Trimming", placeId: locality.id })) === null);

  // ---------------- submit, verify, approve
  const { submission, token } = await submitRegistration(base);
  t("a registration is recorded", !!submission.id && submission.kind === "REGISTRATION");
  t("…with status PENDING", submission.status === "PENDING");
  t("…and the email token stored only as a hash", submission.emailTokenHash !== token);
  t("…and no business created yet", submission.businessId === null);
  t("…and no credit account yet", (await db.creditAccount.count({ where: { business: { name: base.businessName } } })) === 0);
  t("it lands in the SAME queue as a public submission", (await db.businessSubmission.count({ where: { status: "PENDING", id: submission.id } })) === 1);

  const early = await approveRegistration(submission.id, { verified: false, reviewedBy: "test" });
  t("it cannot be approved before the email is verified", "error" in early && /not been verified/i.test(early.error ?? ""));

  t("a wrong verification token is invalid", (await verifyRegistrationEmail("wrong")).state === "invalid");
  t("the real token verifies", (await verifyRegistrationEmail(token)).state === "ok");
  t("…and a second use says so rather than failing", (await verifyRegistrationEmail(token)).state === "already");

  const ev = registrationEvidence((await db.businessSubmission.findUnique({ where: { id: submission.id } }))!);
  t("after verification it may be approved", ev.canApprove);
  t("…but not marked verified without domain or phone evidence", !ev.canVerify);
  const overreach = await approveRegistration(submission.id, { verified: true, reviewedBy: "test" });
  t("…and asking for verified anyway is refused", "error" in overreach && /not enough evidence/i.test(overreach.error ?? ""));

  const approved = await approveRegistration(submission.id, { verified: false, reviewedBy: "test" });
  t("approval creates the listing", !("error" in approved) && !!approved.business.id, "error" in approved ? approved.error : "");
  if ("error" in approved) throw new Error("cannot continue: " + approved.error);

  const biz = approved.business;
  t("…published and marked claimed", biz.published && biz.claimStatus === "CLAIMED");
  t("…pointing at the new geography", biz.placeId === locality.id);
  t("…with the category recorded in the join table", (await db.businessCategory.count({ where: { businessId: biz.id, isPrimary: true } })) === 1);
  t("…and the service area with its mode", (await db.businessServiceArea.findFirst({ where: { businessId: biz.id } }))?.mode === "INCLUDES_CHILDREN");
  t("ownership went through grantOwnership", (await db.businessOwner.count({ where: { businessId: biz.id } })) === 1);
  t("…creating the owner account", (await db.owner.findUnique({ where: { email: base.contactEmail } })) !== null);
  t("the welcome credits were granted", (await creditBalance(biz.id)) === WELCOME_CREDITS);
  t("…recorded as a FREE_GRANT in the ledger", (await db.creditTransaction.count({ where: { businessId: biz.id, kind: "FREE_GRANT" } })) === 1);
  t("…and the ledger agrees with the balance", (await reconcile(biz.id)).agrees);
  t("approving twice is refused", "error" in (await approveRegistration(submission.id, { verified: false, reviewedBy: "test" })));

  // ---------------- the welcome grant is once only, three ways
  const again = await grantWelcomeCredits(biz.id, "trying it on");
  t("a second welcome grant is refused", again.granted === false);
  t("…and the balance did not move", (await creditBalance(biz.id)) === WELCOME_CREDITS);
  const concurrent = await Promise.all([grantWelcomeCredits(biz.id, "race a"), grantWelcomeCredits(biz.id, "race b"), grantWelcomeCredits(biz.id, "race c")]);
  t("three simultaneous grants all refuse", concurrent.every((r) => r.granted === false));
  t("…so the balance is still exactly the welcome amount", (await creditBalance(biz.id)) === WELCOME_CREDITS);
  t("…and there is still exactly one FREE_GRANT row", (await db.creditTransaction.count({ where: { businessId: biz.id, kind: "FREE_GRANT" } })) === 1);

  // ---------------- spending cannot go below zero, even concurrently
  const spends = await Promise.all(Array.from({ length: WELCOME_CREDITS + 3 }, (_, i) => spendCredits(biz.id, 1, `lead ${i}`)));
  t("exactly the available credits were spent, no more", spends.filter((s) => s.ok).length === WELCOME_CREDITS, `${spends.filter((s) => s.ok).length} succeeded`);
  t("…the rest were refused for insufficient credits", spends.filter((s) => !s.ok).length === 3);
  t("…the balance is zero, never negative", (await creditBalance(biz.id)) === 0);
  t("…and the ledger still reconciles", (await reconcile(biz.id)).agrees);

  // ---------------- reversal, adjustment, purchase
  await reverseCredits(biz.id, 1, "assignment failed before delivery");
  t("a reversal puts a credit back", (await creditBalance(biz.id)) === 1);
  t("…as its own ledger row", (await db.creditTransaction.count({ where: { businessId: biz.id, kind: "REVERSAL" } })) === 1);

  t("an adjustment needs a reason", await (async () => { try { await adjustCredits(biz.id, 5, "x", null); return false; } catch { return true; } })());
  t("an adjustment of zero is refused", await (async () => { try { await adjustCredits(biz.id, 0, "a good reason here", null); return false; } catch { return true; } })());
  const adj = await adjustCredits(biz.id, 4, "goodwill after a bad lead", null);
  t("an adjustment moves the balance", "ok" in adj && adj.ok && (await creditBalance(biz.id)) === 5);
  const tooFar = await adjustCredits(biz.id, -99, "trying to go negative on purpose", null);
  t("an adjustment cannot take the balance below zero", "ok" in tooFar && tooFar.ok === false);

  const order = `order-${MARK}-1`;
  t("a purchase credits the account", (await creditPurchase(biz.id, 50, order, "50 credits")).ok === true);
  t("…and a duplicate webhook for the same order does not credit twice", (await creditPurchase(biz.id, 50, order, "50 credits")).ok === false);
  t("…so the balance reflects one purchase", (await creditBalance(biz.id)) === 55, `${await creditBalance(biz.id)}`);
  t("the ledger reconciles after everything", (await reconcile(biz.id)).agrees);

  // ---------------- rejection
  const { submission: s2 } = await submitRegistration({ ...base, businessName: "Regtest Rejected Ltd", contactEmail: `reject@${MARK}.example` });
  t("a rejection needs a reason", "error" in (await rejectRegistration(s2.id, "no", "test")));
  t("a rejection with a reason works", "ok" in (await rejectRegistration(s2.id, "Not a real business we can verify.", "test")));
  t("…and cannot be repeated", "error" in (await rejectRegistration(s2.id, "Not a real business we can verify.", "test")));
  t("…and created no listing", (await db.businessSubmission.findUnique({ where: { id: s2.id } }))?.businessId === null);

  await cleanup();
  console.log(fail === 0 ? "\nALL REGISTRATION AND CREDIT TESTS PASS" : `\n${fail} FAILED`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1); });
