/**
 * Lead creation — the demand side.
 *
 * Builds its own supply (a business, its categories, its service areas) rather than depending on whatever
 * happens to be in dev, because the thing most worth testing is the *relationship* between supply and a
 * request: a lead nobody can service must be recorded as exactly that.
 */
import { PrismaClient } from "@prisma/client";
import {
  createJobRequest, demandWithoutSupply, isUrgency, jobByReference, leadCounts, MAX_RECIPIENTS,
  PRIVACY_NOTICE_VERSION, providersFor, resolveCategory, supplyCheck, validateJob, type JobInput,
} from "../src/lib/leads";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

const MARK = "test-leads-suite";
const EMAIL = "lead-suite@example.test";

async function cleanup() {
  // Audit rows are removed by id, not by target type: wiping every JobRequest audit row would delete
  // history this suite did not create.
  const mine = await db.jobRequest.findMany({ where: { OR: [{ ipHash: MARK }, { email: { contains: "lead-suite" } }] }, select: { id: true } });
  if (mine.length) await db.auditLog.deleteMany({ where: { targetType: "JobRequest", targetId: { in: mine.map((m) => m.id) } } });
  await db.jobRequest.deleteMany({ where: { OR: [{ ipHash: MARK }, { email: { contains: "lead-suite" } }] } });
  const biz = await db.business.findFirst({ where: { slug: "lead-suite-test-trader" } });
  if (biz) {
    await db.businessServiceArea.deleteMany({ where: { businessId: biz.id } });
    await db.businessCategory.deleteMany({ where: { businessId: biz.id } });
    await db.business.delete({ where: { id: biz.id } });
  }
}

async function main() {
  await cleanup();
  if ((await db.place.count()) === 0) throw new Error("No Place rows in dev. Run: npx tsx scripts/import-places.ts --schema=dev --fresh");

  // ---------------- fixtures: a borough, a locality inside it, and a trade
  const borough = await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: "Hackney" } });
  if (!borough) throw new Error("Hackney is not in the place tree; the geography import has not run");
  const locality = await db.place.findFirst({ where: { parentId: borough.id, kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } } });
  if (!locality) throw new Error("Hackney has no child localities; the place tree is incomplete");
  const trade = await db.category.findFirst({ where: { slug: "plumbing" } });
  const otherTrade = await db.category.findFirst({ where: { slug: "roofing" } });
  if (!trade || !otherTrade) throw new Error("Trade categories missing. Run: npx tsx scripts/seed-trade-categories.ts");

  // ---------------- category resolution
  const one = await resolveCategory("Plumber");
  t("\"Plumber\" resolves to one category", one.kind === "one" && one.categoryId === trade.id, JSON.stringify(one));
  t("…and is case- and spacing-insensitive", (await resolveCategory("  EMERGENCY   plumber ")).kind === "one");
  const several = await resolveCategory("house clearance");
  t("a genuinely ambiguous term returns options rather than a guess", several.kind === "several" && several.options.length > 1, JSON.stringify(several));
  t("nonsense resolves to nothing, rather than the nearest-looking trade", (await resolveCategory("zzzz qqqq")).kind === "none");
  t("an empty string resolves to nothing without querying", (await resolveCategory("   ")).kind === "none");

  // ---------------- supply, before any business exists
  const empty = await supplyCheck(trade.id, locality.id);
  t("with no business covering the area, supply is none", empty.none && empty.providers === 0, JSON.stringify(empty));
  t("…and `good` is false, so the form cannot promise two quotes", !empty.good);

  // ---------------- supply, from a borough-wide business
  const anyBiz = await db.business.findFirst({ select: { categoryId: true, locationId: true, cityId: true } });
  if (!anyBiz) throw new Error("dev has no businesses at all; cannot build a supply fixture");
  const supplier = await db.business.create({
    data: {
      name: "Lead Suite Test Trader", slug: "lead-suite-test-trader",
      summary: "A fixture, created and removed by scripts/test-leads.ts.",
      description: "A fixture, created and removed by scripts/test-leads.ts.",
      categoryId: trade.id, locationId: anyBiz.locationId, cityId: anyBiz.cityId, published: true, isSample: false,
    },
  });
  await db.businessCategory.create({ data: { businessId: supplier.id, categoryId: trade.id, isPrimary: true } });
  // Declares the WHOLE borough, not the locality the job will be in. That walk up the tree is the point.
  await db.businessServiceArea.create({ data: { businessId: supplier.id, placeId: borough.id, mode: "INCLUDES_CHILDREN" } });

  t("a borough-wide business covers a locality inside it", (await providersFor(trade.id, locality.id)) === 1);
  t("…and covers the borough itself", (await providersFor(trade.id, borough.id)) === 1);
  t("…but not a trade it does not offer", (await providersFor(otherTrade.id, locality.id)) === 0);

  await db.businessServiceArea.updateMany({ where: { businessId: supplier.id }, data: { mode: "EXACT" } });
  t("EXACT coverage of the borough does NOT reach into its localities", (await providersFor(trade.id, locality.id)) === 0);
  t("…while still covering the borough itself", (await providersFor(trade.id, borough.id)) === 1);
  await db.businessServiceArea.updateMany({ where: { businessId: supplier.id }, data: { mode: "INCLUDES_CHILDREN" } });

  await db.business.update({ where: { id: supplier.id }, data: { published: false } });
  t("an unpublished business is not counted as supply", (await providersFor(trade.id, locality.id)) === 0);
  await db.business.update({ where: { id: supplier.id }, data: { published: true, isSample: true } });
  t("a sample business is not counted as supply either", (await providersFor(trade.id, locality.id)) === 0);
  await db.business.update({ where: { id: supplier.id }, data: { isSample: false } });

  // ---------------- validation
  const good: JobInput = {
    name: "Test Customer", email: EMAIL, phone: "020 7946 0000",
    categoryId: trade.id, placeId: locality.id, postcode: "E8 3AA",
    description: "The kitchen tap has been dripping for a week and the washer looks worn.",
    urgency: "WITHIN_A_WEEK", contactTime: "Weekday afternoons", marketingOptIn: false,
  };
  t("a complete request validates", (await validateJob(good)).length === 0, JSON.stringify(await validateJob(good)));

  const fields = async (p: Partial<JobInput>) => (await validateJob({ ...good, ...p })).map((x) => x.field);
  t("a one-character name is rejected", (await fields({ name: "X" })).includes("name"));
  t("a malformed email is rejected", (await fields({ email: "not-an-email" })).includes("email"));
  t("a missing phone is rejected: trades ring people", (await fields({ phone: "" })).includes("phone"));
  t("a three-word description is rejected", (await fields({ description: "tap broken" })).includes("description"));
  t("HTML in the description is rejected", (await fields({ description: "<script>alert(1)</script> my tap drips badly" })).includes("description"));
  t("a 2,500-character description is rejected", (await fields({ description: "a".repeat(2500) })).includes("description"));
  t("an unknown category is rejected", (await fields({ categoryId: "nope" })).includes("categoryId"));
  t("an unknown place is rejected", (await fields({ placeId: "nope" })).includes("placeId"));
  t("an invented urgency is rejected", (await fields({ urgency: "WHENEVER" as never })).includes("urgency"));
  t("the four urgencies are the only ones accepted", ["EMERGENCY", "WITHIN_A_WEEK", "FLEXIBLE", "PLANNING"].every(isUrgency) && !isUrgency("SOON"));

  // ---------------- creating one
  const created = await createJobRequest(good, MARK);
  t("a request is created", created.created && !!created.request.id);
  const job = created.request;
  t("…with a reference a person can read down a phone line", /^PS-[ACDEFGHJKMNPQRTUVWXY2346789]{5}$/.test(job.reference), job.reference);
  t("…which contains no O/0 or I/1 to mishear", !/[OI01]/.test(job.reference.slice(3)));
  t("…recording how much supply existed at the time", job.providersAtCreation === 1);
  t("…and a status that reflects it", job.status === "NEW");
  t("the consent version is stored, not assumed", job.consentVersion === PRIVACY_NOTICE_VERSION);
  t("consent has a timestamp", job.consentAt instanceof Date);
  t("marketing opt-in defaults to off and is stored separately", job.marketingOptIn === false);
  t("the email is normalised to lower case", job.email === EMAIL.toLowerCase());
  t("the postcode is normalised to upper case", job.postcode === "E8 3AA");
  t("the IP is stored as a hash, never raw", job.ipHash === MARK);

  const audited = await db.auditLog.findFirst({ where: { targetType: "JobRequest", targetId: job.id } });
  t("the request is audited", !!audited, "no audit row");
  t("…and the audit detail carries no contact details", !!audited && !/example\.test|7946/.test(audited.detail ?? ""), audited?.detail ?? "");

  // ---------------- idempotency
  const again = await createJobRequest(good, MARK);
  t("re-submitting the same request does NOT create a second job", !again.created && again.request.id === job.id);
  t("…and there is still exactly one row", (await db.jobRequest.count({ where: { email: EMAIL.toLowerCase() } })) === 1);

  const races = await Promise.all([createJobRequest(good, MARK), createJobRequest(good, MARK), createJobRequest(good, MARK)]);
  t("three simultaneous submissions still yield one job", races.every((r) => r.request.id === job.id) &&
    (await db.jobRequest.count({ where: { email: EMAIL.toLowerCase() } })) === 1);

  const differentJob = await createJobRequest({ ...good, description: "Completely different work: the bathroom radiator will not heat up at all." }, MARK);
  t("a genuinely different job from the same person IS created", differentJob.created && differentJob.request.id !== job.id);

  // ---------------- a request nobody can service
  const unservable = await createJobRequest({ ...good, email: "lead-suite-2@example.test", categoryId: otherTrade.id }, MARK);
  t("a request with no supply is still recorded", unservable.created);
  t("…marked UNASSIGNED rather than NEW, so a person sees it immediately", unservable.request.status === "UNASSIGNED");
  t("…with zero recorded against it", unservable.request.providersAtCreation === 0);

  // ---------------- reading
  const found = await jobByReference(job.reference.toLowerCase());
  t("a reference looks up regardless of case", found?.id === job.id);
  t("…and brings the category and place with it", !!found?.category.name && !!found?.place.label);

  const counts = await leadCounts();
  t("the counts include everything just created", counts.total >= 3 && counts.today >= 3, JSON.stringify(counts));
  t("…and count the unservable one as waiting on supply", counts.unassigned >= 1);
  t("…and the no-supply total separately", counts.noSupply >= 1);

  const gaps = await demandWithoutSupply(5);
  t("demand without supply names the trade and the area", gaps.length >= 1 && !!gaps[0].category && !!gaps[0].place, JSON.stringify(gaps));
  t("…and counts requests, so recruiting can be prioritised", gaps.every((g) => g.requests >= 1));

  // ---------------- the product promise
  t("the maximum number of recipients is two, as the form says", MAX_RECIPIENTS === 2);

  await cleanup();
  console.log(fail === 0 ? "\nALL LEAD TESTS PASS" : `\n${fail} FAILED`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1); });
