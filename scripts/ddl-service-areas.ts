/**
 * Creates BusinessServiceArea, BusinessCategory, CategoryAlias and AddressLookup.
 *
 * Explicit schema-qualified DDL, additive, idempotent. Default target is `dev`; production needs
 * --schema=public explicitly. See DATABASE_CHANGELOG.md house rules.
 *
 * Nothing existing is dropped: Business.areasServed and Business.categoryId both stay, because live
 * directory URLs are built from categoryId and the free-text areas are still the only thing some
 * businesses have.
 */
import { PrismaClient } from "@prisma/client";

const tables = (s: string) => {
  const q = (t: string) => `"${s}"."${t}"`;
  return [
    `CREATE TABLE IF NOT EXISTS ${q("BusinessServiceArea")} (
      "businessId" TEXT NOT NULL,
      "placeId" TEXT NOT NULL,
      "mode" TEXT NOT NULL DEFAULT 'EXACT',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BusinessServiceArea_pkey" PRIMARY KEY ("businessId", "placeId")
    )`,
    `CREATE INDEX IF NOT EXISTS "BusinessServiceArea_placeId_idx" ON ${q("BusinessServiceArea")}("placeId")`,

    `CREATE TABLE IF NOT EXISTS ${q("BusinessCategory")} (
      "businessId" TEXT NOT NULL,
      "categoryId" TEXT NOT NULL,
      "isPrimary" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BusinessCategory_pkey" PRIMARY KEY ("businessId", "categoryId")
    )`,
    `CREATE INDEX IF NOT EXISTS "BusinessCategory_categoryId_idx" ON ${q("BusinessCategory")}("categoryId")`,

    `CREATE TABLE IF NOT EXISTS ${q("CategoryAlias")} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "categoryId" TEXT NOT NULL,
      "alias" TEXT NOT NULL,
      "normalised" TEXT NOT NULL,
      "source" TEXT NOT NULL DEFAULT 'MANUAL',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "CategoryAlias_categoryId_alias_key" ON ${q("CategoryAlias")}("categoryId", "alias")`,
    `CREATE INDEX IF NOT EXISTS "CategoryAlias_normalised_idx" ON ${q("CategoryAlias")}("normalised")`,

    `CREATE TABLE IF NOT EXISTS ${q("AddressLookup")} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "postcode" TEXT NOT NULL,
      "results" INTEGER NOT NULL DEFAULT 0,
      "provider" TEXT NOT NULL DEFAULT 'IDEAL_POSTCODES',
      "free" BOOLEAN NOT NULL DEFAULT false,
      "ipHash" TEXT NOT NULL DEFAULT '',
      "ok" BOOLEAN NOT NULL DEFAULT true,
      "error" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "AddressLookup_createdAt_idx" ON ${q("AddressLookup")}("createdAt")`,
    `CREATE INDEX IF NOT EXISTS "AddressLookup_ipHash_createdAt_idx" ON ${q("AddressLookup")}("ipHash", "createdAt")`,

    `ALTER TABLE ${q("BusinessServiceArea")} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${q("BusinessCategory")} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${q("CategoryAlias")} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${q("AddressLookup")} ENABLE ROW LEVEL SECURITY`,
  ];
};

const fks = (s: string) => {
  const q = (t: string) => `"${s}"."${t}"`;
  return [
    ["BusinessServiceArea_businessId_fkey", `ALTER TABLE ${q("BusinessServiceArea")} ADD CONSTRAINT "BusinessServiceArea_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES ${q("Business")}("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    ["BusinessServiceArea_placeId_fkey", `ALTER TABLE ${q("BusinessServiceArea")} ADD CONSTRAINT "BusinessServiceArea_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES ${q("Place")}("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    ["BusinessCategory_businessId_fkey", `ALTER TABLE ${q("BusinessCategory")} ADD CONSTRAINT "BusinessCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES ${q("Business")}("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    ["BusinessCategory_categoryId_fkey", `ALTER TABLE ${q("BusinessCategory")} ADD CONSTRAINT "BusinessCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES ${q("Category")}("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    ["CategoryAlias_categoryId_fkey", `ALTER TABLE ${q("CategoryAlias")} ADD CONSTRAINT "CategoryAlias_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES ${q("Category")}("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ] as const;
};

const NAMES = ["BusinessServiceArea", "BusinessCategory", "CategoryAlias", "AddressLookup"];

async function apply(schema: string) {
  const db = new PrismaClient({
    datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${schema}`) } },
  });
  console.log(`--- ${schema} ---`);
  for (const sql of tables(schema)) await db.$executeRawUnsafe(sql);
  for (const [name, sql] of fks(schema)) {
    const e = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1 AND c.conname = $2`, schema, name);
    if (e[0].n === 0) { await db.$executeRawUnsafe(sql); console.log(`  + ${name}`); }
  }
  const t = await db.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2::text[]) ORDER BY 1`, schema, NAMES);
  const rls = await db.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean }[]>(
    `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = ANY($2::text[])`, schema, NAMES);
  const fkCount = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1 AND c.contype = 'f' AND c.conname = ANY($2::text[])`,
    schema, fks(schema).map(([n]) => n));
  console.log(`  tables: ${t.length}/4 · RLS: ${rls.filter((r) => r.relrowsecurity).length}/4 · foreign keys: ${fkCount[0].n}/5`);
  const ok = t.length === 4 && rls.length === 4 && rls.every((r) => r.relrowsecurity) && fkCount[0].n === 5;
  await db.$disconnect();
  if (!ok) throw new Error(`${schema}: verification failed`);
}

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
const targets = arg === "all" ? ["public", "dev"] : [arg];
if (!targets.every((t) => t === "public" || t === "dev")) throw new Error("Unknown schema: " + arg);
for (const t of targets) await apply(t);
console.log(`Verified: ${targets.join(", ")}.`);
if (!targets.includes("public")) console.log("Production (public) NOT touched. Re-run with --schema=public when authorised.");
