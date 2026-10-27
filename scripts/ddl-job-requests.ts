/**
 * Phase C: the JobRequest table — a customer's job enquiry.
 *
 * Explicit schema-qualified DDL, additive, idempotent. Default `dev`; production needs --schema=public.
 *
 * The existing `Lead` table is untouched. That is a direct message to one Premium business from its own
 * profile page, and it is in use.
 */
import { PrismaClient } from "@prisma/client";

const statements = (s: string) => {
  const q = (t: string) => `"${s}"."${t}"`;
  return [
    `CREATE TABLE IF NOT EXISTS ${q("JobRequest")} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "reference" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "phone" TEXT NOT NULL,
      "categoryId" TEXT NOT NULL,
      "placeId" TEXT NOT NULL,
      "postcode" TEXT,
      "description" TEXT NOT NULL,
      "urgency" TEXT NOT NULL DEFAULT 'FLEXIBLE',
      "contactTime" TEXT,
      "consentVersion" TEXT NOT NULL,
      "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
      "ipHash" TEXT NOT NULL DEFAULT '',
      "idempotencyKey" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'NEW',
      "providersAtCreation" INTEGER NOT NULL DEFAULT 0,
      "closedReason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    // The two unique indexes are the load-bearing ones: the reference is quoted to customers, and the
    // idempotency key is what stops a double-click becoming two jobs.
    `CREATE UNIQUE INDEX IF NOT EXISTS "JobRequest_reference_key" ON ${q("JobRequest")}("reference")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "JobRequest_idempotencyKey_key" ON ${q("JobRequest")}("idempotencyKey")`,
    `CREATE INDEX IF NOT EXISTS "JobRequest_status_createdAt_idx" ON ${q("JobRequest")}("status", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "JobRequest_categoryId_placeId_idx" ON ${q("JobRequest")}("categoryId", "placeId")`,
    `CREATE INDEX IF NOT EXISTS "JobRequest_createdAt_idx" ON ${q("JobRequest")}("createdAt")`,
    `ALTER TABLE ${q("JobRequest")} ENABLE ROW LEVEL SECURITY`,
  ];
};

const fks = (s: string) => [
  ["JobRequest_categoryId_fkey", `ALTER TABLE "${s}"."JobRequest" ADD CONSTRAINT "JobRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "${s}"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE`],
  ["JobRequest_placeId_fkey", `ALTER TABLE "${s}"."JobRequest" ADD CONSTRAINT "JobRequest_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "${s}"."Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE`],
] as const;

async function apply(schema: string) {
  const db = new PrismaClient({
    datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${schema}`) } },
  });
  console.log(`--- ${schema} ---`);
  for (const sql of statements(schema)) await db.$executeRawUnsafe(sql);
  for (const [name, sql] of fks(schema)) {
    const e = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1 AND c.conname = $2`, schema, name);
    if (e[0].n === 0) { await db.$executeRawUnsafe(sql); console.log(`  + ${name}`); }
  }

  const tbl = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'JobRequest'`, schema);
  const idx = await db.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'JobRequest'`, schema);
  const rls = await db.$queryRawUnsafe<{ relrowsecurity: boolean }[]>(
    `SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = 'JobRequest'`, schema);
  const fkCount = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1 AND c.contype = 'f' AND c.conname = ANY($2::text[])`,
    schema, fks(schema).map(([n]) => n));

  const uniques = idx.filter((i) => /reference_key|idempotencyKey_key/.test(i.indexname)).length;
  console.log(`  table: ${tbl[0].n}/1 · indexes: ${idx.length} (${uniques}/2 unique) · RLS: ${rls[0]?.relrowsecurity} · foreign keys: ${fkCount[0].n}/2`);
  const ok = tbl[0].n === 1 && uniques === 2 && rls[0]?.relrowsecurity === true && fkCount[0].n === 2;
  await db.$disconnect();
  if (!ok) throw new Error(`${schema}: verification failed`);
}

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
const targets = arg === "all" ? ["public", "dev"] : [arg];
if (!targets.every((t) => t === "public" || t === "dev")) throw new Error("Unknown schema: " + arg);
for (const t of targets) await apply(t);
console.log(`Verified: ${targets.join(", ")}.`);
if (!targets.includes("public")) console.log("Production (public) NOT touched. Re-run with --schema=public when authorised.");
