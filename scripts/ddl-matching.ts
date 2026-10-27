/**
 * Phase D: matching and assignment.
 *
 * Explicit schema-qualified DDL, additive, idempotent. Default `dev`; production needs --schema=public.
 *
 * The load-bearing object in here is **`LeadAssignment_paid_slot_key`**, a partial unique index on
 * (jobRequestId, paidSlot) where paidSlot is not null. It is what makes "no more than two paying businesses
 * per job" true in the database rather than true in the matcher's control flow. Two concurrent runs cannot
 * both take slot 2: one of them fails the insert, which is a far better outcome than a customer being rung
 * by five trades. The CHECK constraint keeps the slot numbers honest at the same time.
 */
import { PrismaClient } from "@prisma/client";

const statements = (s: string) => {
  const q = (t: string) => `"${s}"."${t}"`;
  return [
    // --- the opt-in that stage four depends on. Additive, default false: nobody is opted in by surprise.
    `ALTER TABLE ${q("Business")} ADD COLUMN IF NOT EXISTS "acceptsNearby" BOOLEAN NOT NULL DEFAULT false`,

    `CREATE TABLE IF NOT EXISTS ${q("LeadAssignment")} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "jobRequestId" TEXT NOT NULL,
      "businessId" TEXT NOT NULL,
      "kind" TEXT NOT NULL DEFAULT 'PAID',
      "paidSlot" INTEGER,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "creditCharged" BOOLEAN NOT NULL DEFAULT false,
      "reason" TEXT NOT NULL,
      "stage" TEXT NOT NULL DEFAULT 'EXACT',
      "assignedById" TEXT,
      "deliveredAt" TIMESTAMP(3),
      "failedReason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    // One business cannot HOLD the same job twice, however many times matching re-runs — but one whose
    // assignment was reversed can be given it again, because circumstances change and a reversed row is
    // history rather than a live claim. Hence the predicate. An earlier version of this script created the
    // index without one, so it is dropped first: it is an index, not data, and nothing is lost.
    `DROP INDEX IF EXISTS "${s}"."LeadAssignment_jobRequestId_businessId_key"`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "LeadAssignment_live_business_key" ON ${q("LeadAssignment")}("jobRequestId", "businessId") WHERE "status" <> 'REVERSED'`,
    `CREATE INDEX IF NOT EXISTS "LeadAssignment_jobRequestId_businessId_idx" ON ${q("LeadAssignment")}("jobRequestId", "businessId")`,
    // THE limit. Partial, so SPONSORED rows (paidSlot null) are unaffected and uncapped by it.
    `CREATE UNIQUE INDEX IF NOT EXISTS "LeadAssignment_paid_slot_key" ON ${q("LeadAssignment")}("jobRequestId", "paidSlot") WHERE "paidSlot" IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS "LeadAssignment_businessId_createdAt_idx" ON ${q("LeadAssignment")}("businessId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "LeadAssignment_jobRequestId_idx" ON ${q("LeadAssignment")}("jobRequestId")`,
    `CREATE INDEX IF NOT EXISTS "LeadAssignment_status_idx" ON ${q("LeadAssignment")}("status")`,
    `ALTER TABLE ${q("LeadAssignment")} ENABLE ROW LEVEL SECURITY`,

    `CREATE TABLE IF NOT EXISTS ${q("MatchDecision")} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "jobRequestId" TEXT NOT NULL,
      "businessId" TEXT,
      "stage" TEXT NOT NULL,
      "outcome" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      "runId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "MatchDecision_jobRequestId_createdAt_idx" ON ${q("MatchDecision")}("jobRequestId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "MatchDecision_businessId_createdAt_idx" ON ${q("MatchDecision")}("businessId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "MatchDecision_runId_idx" ON ${q("MatchDecision")}("runId")`,
    `ALTER TABLE ${q("MatchDecision")} ENABLE ROW LEVEL SECURITY`,
  ];
};

/** Constraints that cannot use IF NOT EXISTS, so each is checked by name first. */
const named = (s: string) => [
  ["LeadAssignment_paidSlot_check",
    `ALTER TABLE "${s}"."LeadAssignment" ADD CONSTRAINT "LeadAssignment_paidSlot_check" CHECK ("paidSlot" IS NULL OR "paidSlot" IN (1, 2))`],
  ["LeadAssignment_jobRequestId_fkey",
    `ALTER TABLE "${s}"."LeadAssignment" ADD CONSTRAINT "LeadAssignment_jobRequestId_fkey" FOREIGN KEY ("jobRequestId") REFERENCES "${s}"."JobRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ["LeadAssignment_businessId_fkey",
    `ALTER TABLE "${s}"."LeadAssignment" ADD CONSTRAINT "LeadAssignment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "${s}"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ["MatchDecision_jobRequestId_fkey",
    `ALTER TABLE "${s}"."MatchDecision" ADD CONSTRAINT "MatchDecision_jobRequestId_fkey" FOREIGN KEY ("jobRequestId") REFERENCES "${s}"."JobRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ["MatchDecision_businessId_fkey",
    `ALTER TABLE "${s}"."MatchDecision" ADD CONSTRAINT "MatchDecision_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "${s}"."Business"("id") ON DELETE SET NULL ON UPDATE CASCADE`],
] as const;

async function apply(schema: string) {
  const db = new PrismaClient({
    datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${schema}`) } },
  });
  console.log(`--- ${schema} ---`);
  for (const sql of statements(schema)) await db.$executeRawUnsafe(sql);
  for (const [name, sql] of named(schema)) {
    const e = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1 AND c.conname = $2`, schema, name);
    if (e[0].n === 0) { await db.$executeRawUnsafe(sql); console.log(`  + ${name}`); }
  }

  const tables = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('LeadAssignment','MatchDecision')`, schema);
  const column = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Business' AND column_name = 'acceptsNearby'`, schema);
  const rls = await db.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean }[]>(
    `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname IN ('LeadAssignment','MatchDecision')`, schema);
  const constraints = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1 AND c.conname = ANY($2::text[])`,
    schema, named(schema).map(([n]) => n));

  // The limit is only real if the partial index is actually there, so it is verified by name and predicate.
  const slot = await db.$queryRawUnsafe<{ indexdef: string }[]>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = 'LeadAssignment_paid_slot_key'`, schema);
  const partial = /UNIQUE/.test(slot[0]?.indexdef ?? "") && /WHERE \("?paidSlot"? IS NOT NULL\)/i.test(slot[0]?.indexdef ?? "");

  // The other partial unique: one live assignment per business per job, reversals excepted.
  const liveIdx = await db.$queryRawUnsafe<{ indexdef: string }[]>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = 'LeadAssignment_live_business_key'`, schema);
  const livePartial = /UNIQUE/.test(liveIdx[0]?.indexdef ?? "") && /REVERSED/.test(liveIdx[0]?.indexdef ?? "");
  const staleFullUnique = (await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = $1 AND indexname = 'LeadAssignment_jobRequestId_businessId_key'`, schema))[0].n > 0;

  const rlsOn = rls.length === 2 && rls.every((r) => r.relrowsecurity);
  console.log(`  tables: ${tables[0].n}/2 · Business.acceptsNearby: ${column[0].n}/1 · RLS: ${rlsOn} · constraints: ${constraints[0].n}/5`);
  console.log(`  two-business limit enforced by a partial unique index: ${partial}`);
  console.log(`  one live assignment per business per job: ${livePartial}${staleFullUnique ? " (stale full unique index STILL PRESENT)" : ""}`);
  await db.$disconnect();
  if (!(tables[0].n === 2 && column[0].n === 1 && rlsOn && constraints[0].n === 5 && partial && livePartial && !staleFullUnique)) {
    throw new Error(`${schema}: verification failed`);
  }
}

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
const targets = arg === "all" ? ["public", "dev"] : [arg];
if (!targets.every((t) => t === "public" || t === "dev")) throw new Error("Unknown schema: " + arg);
for (const t of targets) await apply(t);
console.log(`Verified: ${targets.join(", ")}.`);
if (!targets.includes("public")) console.log("Production (public) NOT touched. Re-run with --schema=public when authorised.");
