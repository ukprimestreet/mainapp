/**
 * Is the lead system actually safe to switch on?
 *
 * Read-only. It writes nothing, to either schema, and prints no secret values — only whether each one is
 * usable. Run it against production before and after any release step:
 *
 *   npm run release:check                 (dev)
 *   npm run release:check -- --schema=public
 *
 * This exists because "it works in dev" and "it is safe in production" are different claims, and the gap
 * between them is where this project has already had one outage. Every line below is something that, if
 * wrong, means a customer fills in a form and nothing happens — which is worse than the form not being there.
 *
 * Exit code is non-zero if anything a release depends on is missing, so it can gate a deploy.
 */
import { PrismaClient } from "@prisma/client";
import { addressLookupConfigured } from "../src/lib/address";
import { billingConfigured } from "../src/lib/billing";
import { mailConfigured } from "../src/lib/mail";
import { encryptionReady, encryptionStatus } from "../src/lib/secretbox";

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
if (arg !== "dev" && arg !== "public") throw new Error("Unknown schema: " + arg);
const db = new PrismaClient({
  datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${arg}`) } },
});

type Level = "BLOCKER" | "NEEDED" | "NOTE";
const rows: { level: Level; ok: boolean; what: string; detail: string }[] = [];
const check = (level: Level, ok: boolean, what: string, detail: string) => rows.push({ level, ok, what, detail });

/** Does a table exist in this schema? Asking before querying keeps a missing table a finding, not a crash. */
async function tableExists(name: string) {
  const r = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, arg, name);
  return r[0].n === 1;
}

async function main() {
  console.log(`\nRelease check — schema: ${arg}\n${"=".repeat(60)}`);
  // Said out loud because it is the one way this output can mislead: the schema and data checks read the
  // database `--schema` names, while the configuration checks can only see the environment THIS process
  // has. Pointing it at production from a laptop tells you nothing about Vercel's environment variables.
  console.log(`Schema and data: read from ${arg}. Configuration: read from this shell, NOT the deployment.`);
  if (arg === "public") {
    console.log(`For the deployment's own configuration, call GET /api/cron with the bearer token and read its "config" field.`);
  }

  // ---------------------------------------------------------------- schema
  const needed = ["JobRequest", "LeadAssignment", "MatchDecision", "CreditAccount", "CreditTransaction", "Place", "BusinessServiceArea", "BusinessCategory", "AdminUser"];
  const present: string[] = [];
  for (const t of needed) if (await tableExists(t)) present.push(t);
  check("BLOCKER", present.length === needed.length, "Every table the lead system reads exists",
    present.length === needed.length ? `${present.length}/${needed.length}` : `missing: ${needed.filter((t) => !present.includes(t)).join(", ")}`);

  const cols = await db.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = $1 AND (table_name, column_name) IN
     (('LeadAssignment','notifiedAt'),('LeadAssignment','remindedAt'),('JobRequest','customerNotifiedAt'),('Business','acceptsNearby'))`, arg);
  check("BLOCKER", cols.length === 4, "The notification and nearby-opt-in columns exist", `${cols.length}/4`);

  if (present.includes("LeadAssignment")) {
    // The two-business limit is only real if the partial unique index is there. Checked by predicate.
    const idx = await db.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = 'LeadAssignment'`, arg);
    const slot = idx.find((i) => i.indexname === "LeadAssignment_paid_slot_key");
    check("BLOCKER", !!slot && /UNIQUE/.test(slot.indexdef) && /paidSlot" IS NOT NULL/.test(slot.indexdef),
      "The two-paying-business limit is enforced by the database", slot ? "partial unique index present" : "MISSING — the limit would be code-only");
    const live = idx.find((i) => i.indexname === "LeadAssignment_live_business_key");
    check("BLOCKER", !!live && /REVERSED/.test(live.indexdef), "One live assignment per business per job", live ? "present" : "MISSING");
    const stale = idx.find((i) => i.indexname === "LeadAssignment_jobRequestId_businessId_key");
    check("NEEDED", !stale, "No stale full unique index on (job, business)", stale ? "PRESENT — a reversal would be a permanent ban" : "clean");
    const chk = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1 AND c.conname = 'LeadAssignment_paidSlot_check'`, arg);
    check("BLOCKER", chk[0].n === 1, "A paid place can only ever be 1 or 2", chk[0].n ? "CHECK constraint present" : "missing");
  }

  const noRls = await db.$queryRawUnsafe<{ relname: string }[]>(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relrowsecurity = false`, arg);
  check("BLOCKER", noRls.length === 0, "Row-level security is on every table",
    noRls.length ? `off on: ${noRls.map((r) => r.relname).join(", ")}` : "all tables");

  // ---------------------------------------------------------------- the data the forms need
  const places = present.includes("Place") ? await db.place.count() : 0;
  check("BLOCKER", places > 1000, "The place tree is imported", `${places.toLocaleString()} rows`);

  const boroughs = places
    ? await db.place.count({ where: { kind: { in: ["LAD", "UNITARY"] }, name: { in: ["Tower Hamlets", "Hackney", "Newham", "Waltham Forest", "Redbridge", "Barking and Dagenham", "Havering"] } } })
    : 0;
  check("BLOCKER", boroughs === 7, "All seven covered boroughs are present", `${boroughs}/7`);

  const localities = boroughs
    ? await db.place.count({ where: { parent: { kind: { in: ["LAD", "UNITARY"] }, name: { in: ["Hackney", "Newham"] } }, active: true } })
    : 0;
  check("NEEDED", localities > 0, "Boroughs have localities beneath them", `${localities} under Hackney and Newham`);

  const categories = await db.category.count({ where: { parentId: null } });
  const trades = await db.category.count({ where: { slug: { in: ["plumbing", "electrical", "roofing", "heating-and-boilers", "locksmith"] } } });
  check("BLOCKER", trades >= 5, "The trade categories exist", `${trades}/5 sampled, ${categories} top-level in all`);

  const aliases = await db.categoryAlias.count();
  check("NEEDED", aliases > 100, "Search terms map to trades", `${aliases} aliases`);

  const noIntro = await db.category.count({ where: { parentId: null, intro: null } });
  check("NOTE", noIntro === 0, "Every category has real intro copy",
    noIntro ? `${noIntro} have none, so they are usable but NOT indexable — deliberate, not a bug` : "all written");

  // ---------------------------------------------------------------- supply, which no code can create
  const providers = await db.business.count({
    where: { published: true, isSample: false, serviceAreas: { some: {} }, categories: { some: {} } },
  });
  const withCredits = await db.business.count({ where: { published: true, isSample: false, creditAccount: { balance: { gt: 0 } } } });
  check("BLOCKER", providers > 0, "At least one business can receive a job", `${providers} with areas and trades`);
  check("BLOCKER", withCredits > 0, "At least one of those has credits to pay with", `${withCredits} with a positive balance`);
  check("NOTE", providers >= 14, "Enough supply for the two-business promise to mean something",
    providers >= 14 ? `${providers}` : `${providers} — two per trade across seven boroughs is the realistic floor`);

  // ---------------------------------------------------------------- who can operate it
  const admins = present.includes("AdminUser") ? await db.adminUser.count({ where: { active: true, passwordHash: { not: null } } }) : 0;
  check("BLOCKER", admins > 0, "Somebody can sign in to work the leads", `${admins} active administrator(s)`);

  // ---------------------------------------------------------------- configuration
  //
  // Each of these asks the library that uses the setting, rather than testing an environment variable name
  // of its own. The first version of this file guessed those names and reported field encryption as missing
  // when it was present under a different name — a check that is wrong about configuration is worse than no
  // check, because it gets believed.
  const set = (k: string, min = 1) => (process.env[k] ?? "").trim().length >= min;
  check("BLOCKER", set("DATABASE_URL", 20), "DATABASE_URL is set", set("DATABASE_URL", 20) ? "set" : "missing");
  check("BLOCKER", mailConfigured(), "Email can actually be sent",
    mailConfigured() ? "configured" : "not configured — every email would be recorded and never sent");
  check("BLOCKER", set("CRON_SECRET", 16), "CRON_SECRET is set, so the hourly job can run",
    set("CRON_SECRET", 16) ? "set" : "missing — /api/cron answers 404, so nothing is ever notified or escalated");
  check("BLOCKER", encryptionReady(), "Field encryption is available", encryptionStatus());
  check("NEEDED", addressLookupConfigured(), "Address lookup is configured",
    addressLookupConfigured() ? "set" : "registration falls back to choosing an area by hand");
  check("NEEDED", billingConfigured(), "Businesses can buy more credits",
    billingConfigured() ? "configured" : "not configured — nobody can top up past the free five");

  // ---------------------------------------------------------------- anything already broken
  if (present.includes("LeadAssignment")) {
    const unnotified = await db.leadAssignment.count({ where: { notifiedAt: null, status: { not: "REVERSED" } } });
    check("NEEDED", unnotified === 0, "No assigned job is sitting unnotified", unnotified ? `${unnotified} business(es) have not been told` : "none");
    const chargedNoLedger = await db.leadAssignment.count({ where: { kind: "PAID", creditCharged: true } });
    const consumption = await db.creditTransaction.count({ where: { kind: "CONSUMPTION" } });
    check("NEEDED", chargedNoLedger <= consumption, "Charged assignments are backed by ledger rows", `${chargedNoLedger} charged, ${consumption} consumption rows`);
  }
  if (present.includes("JobRequest")) {
    const stranded = await db.jobRequest.count({ where: { status: { in: ["NEW", "UNASSIGNED"] }, customerNotifiedAt: null, createdAt: { lte: new Date(Date.now() - 24 * 3600_000) } } });
    check("NEEDED", stranded === 0, "No customer has been left waiting over a day without a word", stranded ? `${stranded} waiting` : "none");
  }

  // ---------------------------------------------------------------- report
  const order: Level[] = ["BLOCKER", "NEEDED", "NOTE"];
  for (const level of order) {
    const group = rows.filter((r) => r.level === level);
    if (!group.length) continue;
    console.log(`\n${level}${level === "BLOCKER" ? " — do not launch without these" : level === "NEEDED" ? " — the system works, but not properly" : " — worth knowing"}`);
    for (const r of group) console.log(`  ${r.ok ? "ok  " : "FAIL"}  ${r.what} — ${r.detail}`);
  }

  const blockers = rows.filter((r) => r.level === "BLOCKER" && !r.ok);
  const shortfalls = rows.filter((r) => r.level === "NEEDED" && !r.ok);
  console.log(`\n${"=".repeat(60)}`);
  console.log(blockers.length === 0
    ? `No blockers on ${arg}.${shortfalls.length ? ` ${shortfalls.length} thing(s) would work badly rather than not at all.` : " Everything checked is in place."}`
    : `${blockers.length} BLOCKER(S) on ${arg}. A customer could fill in the form and nothing would happen.`);

  await db.$disconnect();
  process.exit(blockers.length === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
