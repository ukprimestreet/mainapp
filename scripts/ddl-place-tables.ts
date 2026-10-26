/**
 * Creates the Place / PlaceAlias / PlaceLink tables and Business.placeId.
 *
 * Explicit, schema-qualified DDL rather than `prisma db push`: pointed at schema=public, db push was
 * observed inspecting `dev` through the Supabase transaction pooler and offering to drop dev's search_fts.
 * See DATABASE_CHANGELOG.md house rule 2.
 *
 * Additive and idempotent: IF NOT EXISTS throughout, nothing dropped, nothing renamed. Safe to re-run.
 * Applied to `public` FIRST, because code that reads a column production does not have takes the site down.
 */
import { PrismaClient } from "@prisma/client";

const statements = (schema: string) => {
  const q = (t: string) => `"${schema}"."${t}"`;
  return [
    `CREATE TABLE IF NOT EXISTS ${q("Place")} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sourceKey" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "parentId" TEXT,
      "gssCode" TEXT,
      "osId" TEXT,
      "lat" DOUBLE PRECISION,
      "lng" DOUBLE PRECISION,
      "population" INTEGER,
      "disambiguation" TEXT,
      "label" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "sourceDate" TEXT NOT NULL,
      "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
      "evidenceNotes" TEXT,
      "serviceable" BOOLEAN NOT NULL DEFAULT true,
      "pageJustified" TEXT NOT NULL DEFAULT 'UNREVIEWED',
      "decisionNotes" TEXT,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "legacyLocationId" TEXT,
      "mergedFrom" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Place_sourceKey_key" ON ${q("Place")}("sourceKey")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Place_legacyLocationId_key" ON ${q("Place")}("legacyLocationId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Place_parentId_slug_key" ON ${q("Place")}("parentId", "slug")`,
    `CREATE INDEX IF NOT EXISTS "Place_kind_idx" ON ${q("Place")}("kind")`,
    `CREATE INDEX IF NOT EXISTS "Place_name_idx" ON ${q("Place")}("name")`,
    `CREATE INDEX IF NOT EXISTS "Place_gssCode_idx" ON ${q("Place")}("gssCode")`,
    `CREATE INDEX IF NOT EXISTS "Place_parentId_idx" ON ${q("Place")}("parentId")`,

    `CREATE TABLE IF NOT EXISTS ${q("PlaceAlias")} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "placeId" TEXT NOT NULL,
      "alias" TEXT NOT NULL,
      "normalised" TEXT NOT NULL,
      "kind" TEXT NOT NULL DEFAULT 'COLLOQUIAL',
      "source" TEXT NOT NULL,
      "sourceDate" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PlaceAlias_placeId_alias_key" ON ${q("PlaceAlias")}("placeId", "alias")`,
    `CREATE INDEX IF NOT EXISTS "PlaceAlias_normalised_idx" ON ${q("PlaceAlias")}("normalised")`,

    `CREATE TABLE IF NOT EXISTS ${q("PlaceLink")} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "fromId" TEXT NOT NULL,
      "toId" TEXT NOT NULL,
      "relation" TEXT NOT NULL,
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PlaceLink_fromId_toId_relation_key" ON ${q("PlaceLink")}("fromId", "toId", "relation")`,
    `CREATE INDEX IF NOT EXISTS "PlaceLink_toId_idx" ON ${q("PlaceLink")}("toId")`,

    `ALTER TABLE ${q("Business")} ADD COLUMN IF NOT EXISTS "placeId" TEXT`,
    `CREATE INDEX IF NOT EXISTS "Business_placeId_idx" ON ${q("Business")}("placeId")`,

    // Row-level security, on the same footing as every other table here. No policies means the anon key
    // sees nothing, which is correct: geography is served through the app, not read directly by clients.
    `ALTER TABLE ${q("Place")} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${q("PlaceAlias")} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${q("PlaceLink")} ENABLE ROW LEVEL SECURITY`,
  ];
};

// Foreign keys are added separately: they must not fail the whole run if a constraint already exists,
// and Postgres has no ADD CONSTRAINT IF NOT EXISTS.
const constraints = (schema: string) => {
  const q = (t: string) => `"${schema}"."${t}"`;
  return [
    [`Place_parentId_fkey`, `ALTER TABLE ${q("Place")} ADD CONSTRAINT "Place_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES ${q("Place")}("id") ON DELETE SET NULL ON UPDATE CASCADE`],
    [`PlaceAlias_placeId_fkey`, `ALTER TABLE ${q("PlaceAlias")} ADD CONSTRAINT "PlaceAlias_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES ${q("Place")}("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    [`PlaceLink_fromId_fkey`, `ALTER TABLE ${q("PlaceLink")} ADD CONSTRAINT "PlaceLink_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES ${q("Place")}("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    [`PlaceLink_toId_fkey`, `ALTER TABLE ${q("PlaceLink")} ADD CONSTRAINT "PlaceLink_toId_fkey" FOREIGN KEY ("toId") REFERENCES ${q("Place")}("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    [`Business_placeId_fkey`, `ALTER TABLE ${q("Business")} ADD CONSTRAINT "Business_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES ${q("Place")}("id") ON DELETE SET NULL ON UPDATE CASCADE`],
  ] as const;
};

async function apply(schema: string) {
  const url = (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${schema}`);
  const db = new PrismaClient({ datasources: { db: { url } } });
  console.log(`\n--- ${schema} ---`);

  for (const sql of statements(schema)) await db.$executeRawUnsafe(sql);

  for (const [name, sql] of constraints(schema)) {
    const exists = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1 AND c.conname = $2`,
      schema, name,
    );
    if (exists[0].n === 0) { await db.$executeRawUnsafe(sql); console.log(`  + ${name}`); }
  }

  // ---- verify, rather than assume it worked
  const tables = await db.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('Place','PlaceAlias','PlaceLink') ORDER BY 1`, schema);
  const col = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Business' AND column_name = 'placeId'`, schema);
  const rls = await db.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean }[]>(
    `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname IN ('Place','PlaceAlias','PlaceLink') ORDER BY 1`, schema);
  const fks = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = $1 AND c.contype = 'f' AND c.conname = ANY($2::text[])`,
    schema, constraints(schema).map(([n]) => n));

  console.log(`  tables:        ${tables.map((t) => t.table_name).join(", ")} (${tables.length}/3)`);
  console.log(`  Business.placeId: ${col[0].n === 1 ? "present" : "MISSING"}`);
  console.log(`  RLS:           ${rls.map((r) => `${r.relname}=${r.relrowsecurity}`).join(", ")}`);
  console.log(`  foreign keys:  ${fks[0].n}/5`);

  const ok = tables.length === 3 && col[0].n === 1 && rls.every((r) => r.relrowsecurity) && fks[0].n === 5;
  await db.$disconnect();
  if (!ok) throw new Error(`${schema}: verification failed`);
  return ok;
}

// Which schemas to touch. Default is dev only: DDL against production is a deliberate act, requested
// explicitly with --schema=public or --schema=all, never by running this file with no argument.
const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
const targets = arg === "all" ? ["public", "dev"] : [arg];
if (!targets.every((t) => t === "public" || t === "dev")) throw new Error("Unknown schema: " + arg);

for (const t of targets) await apply(t);
console.log("Verified: " + targets.join(", ") + ". Nothing reads these tables yet.");
if (!targets.includes("public")) console.log("Production (public) NOT touched.");
