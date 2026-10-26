/**
 * Batch B4: registration columns on BusinessSubmission, plus the credit ledger.
 *
 * Explicit schema-qualified DDL, additive, idempotent. Default target `dev`; production needs
 * --schema=public explicitly. See DATABASE_CHANGELOG.md house rules.
 *
 * Nothing existing changes. The public submission route keeps working exactly as it did: its rows simply
 * have kind = 'SUBMISSION' and leave the new columns null.
 */
import { PrismaClient } from "@prisma/client";

const COLUMNS: [string, string][] = [
  ["kind", "TEXT NOT NULL DEFAULT 'SUBMISSION'"],
  ["placeId", "TEXT"],
  ["udprn", "TEXT"],
  ["categoryIds", "TEXT"],
  ["serviceAreaIds", "TEXT"],
  ["serviceAreaMode", "TEXT NOT NULL DEFAULT 'EXACT'"],
  ["ownerRole", "TEXT"],
  ["emailTokenHash", "TEXT"],
  ["emailVerifiedAt", "TIMESTAMP(3)"],
  ["duplicateOfId", "TEXT"],
  ["reviewedBy", "TEXT"],
  ["reviewNote", "TEXT"],
];

const statements = (s: string) => {
  const q = (t: string) => `"${s}"."${t}"`;
  return [
    ...COLUMNS.map(([name, type]) => `ALTER TABLE ${q("BusinessSubmission")} ADD COLUMN IF NOT EXISTS "${name}" ${type}`),
    `CREATE UNIQUE INDEX IF NOT EXISTS "BusinessSubmission_emailTokenHash_key" ON ${q("BusinessSubmission")}("emailTokenHash")`,
    `CREATE INDEX IF NOT EXISTS "BusinessSubmission_kind_status_idx" ON ${q("BusinessSubmission")}("kind", "status")`,

    `CREATE TABLE IF NOT EXISTS ${q("CreditAccount")} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "businessId" TEXT NOT NULL,
      "balance" INTEGER NOT NULL DEFAULT 0,
      "freeGrantAt" TIMESTAMP(3),
      "lowWarnedAt" TIMESTAMP(3),
      "zeroWarnedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    // One account per business, enforced by the database. This is half of what makes the welcome grant
    // once-only: there is nowhere for a second account to live.
    `CREATE UNIQUE INDEX IF NOT EXISTS "CreditAccount_businessId_key" ON ${q("CreditAccount")}("businessId")`,

    `CREATE TABLE IF NOT EXISTS ${q("CreditTransaction")} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "accountId" TEXT NOT NULL,
      "businessId" TEXT NOT NULL,
      "delta" INTEGER NOT NULL,
      "balanceAfter" INTEGER NOT NULL,
      "kind" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      "assignmentId" TEXT,
      "orderId" TEXT,
      "adminId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "CreditTransaction_businessId_createdAt_idx" ON ${q("CreditTransaction")}("businessId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "CreditTransaction_kind_idx" ON ${q("CreditTransaction")}("kind")`,
    // Belt and braces on the free grant: at most one FREE_GRANT row per business, enforced in the database
    // rather than only in the code that writes it.
    `CREATE UNIQUE INDEX IF NOT EXISTS "CreditTransaction_one_free_grant" ON ${q("CreditTransaction")}("businessId") WHERE "kind" = 'FREE_GRANT'`,

    `ALTER TABLE ${q("CreditAccount")} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${q("CreditTransaction")} ENABLE ROW LEVEL SECURITY`,
  ];
};

const fks = (s: string) => [
  ["BusinessSubmission_placeId_fkey", `ALTER TABLE "${s}"."BusinessSubmission" ADD CONSTRAINT "BusinessSubmission_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "${s}"."Place"("id") ON DELETE SET NULL ON UPDATE CASCADE`],
  ["CreditAccount_businessId_fkey", `ALTER TABLE "${s}"."CreditAccount" ADD CONSTRAINT "CreditAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "${s}"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ["CreditTransaction_accountId_fkey", `ALTER TABLE "${s}"."CreditTransaction" ADD CONSTRAINT "CreditTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "${s}"."CreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
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

  const cols = await db.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'BusinessSubmission' AND column_name = ANY($2::text[])`,
    schema, COLUMNS.map(([n]) => n));
  const tables = await db.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('CreditAccount','CreditTransaction') ORDER BY 1`, schema);
  const rls = await db.$queryRawUnsafe<{ relrowsecurity: boolean }[]>(
    `SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname IN ('CreditAccount','CreditTransaction')`, schema);
  const guard = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = $1 AND indexname = 'CreditTransaction_one_free_grant'`, schema);

  console.log(`  submission columns: ${cols.length}/${COLUMNS.length} · tables: ${tables.length}/2 · RLS: ${rls.filter((r) => r.relrowsecurity).length}/2 · one-free-grant index: ${guard[0].n === 1}`);
  const ok = cols.length === COLUMNS.length && tables.length === 2 && rls.length === 2 && rls.every((r) => r.relrowsecurity) && guard[0].n === 1;
  await db.$disconnect();
  if (!ok) throw new Error(`${schema}: verification failed`);
}

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
const targets = arg === "all" ? ["public", "dev"] : [arg];
if (!targets.every((t) => t === "public" || t === "dev")) throw new Error("Unknown schema: " + arg);
for (const t of targets) await apply(t);
console.log(`Verified: ${targets.join(", ")}.`);
if (!targets.includes("public")) console.log("Production (public) NOT touched. Re-run with --schema=public when authorised.");
