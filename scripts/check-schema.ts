/**
 * Compares the Prisma schema against a live database and reports what is missing.
 *
 * This exists because of a real outage: code that read `AdminUser` was deployed to production while that
 * table existed only in `dev`, and `/admin/login` returned 500 to everybody. The house rule — schema before
 * code — was already written down, and writing it down was not enough. This makes it checkable.
 *
 *   npm run schema:check                  # dev
 *   npm run schema:check -- --schema=public
 *   npm run schema:check -- --all
 *
 * Exits non-zero when anything is missing, so it can gate a deploy.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

type Model = { name: string; fields: { name: string; optional: boolean; isRelation: boolean }[] };

/** Parses models out of schema.prisma. Deliberately simple: it only needs names and scalar fields. */
function parseSchema(path = "prisma/schema.prisma"): Model[] {
  const text = readFileSync(path, "utf8");
  const models: Model[] = [];
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [, name, body] = m;
    const fields: Model["fields"] = [];
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("///") || line.startsWith("@@")) continue;
      const fm = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
      if (!fm) continue;
      const [, field, type, isList, optional] = fm;
      // A relation field is one whose type is another model, or a list. Those are not columns.
      const isRelation = !!isList || /^[A-Z]/.test(type) && !["String", "Int", "Boolean", "DateTime", "Float", "Json", "Decimal", "BigInt", "Bytes"].includes(type);
      fields.push({ name: field, optional: !!optional, isRelation });
    }
    models.push({ name, fields });
  }
  return models;
}

async function check(schema: string) {
  const db = new PrismaClient({
    datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${schema}`) } },
  });

  const models = parseSchema();
  const liveTables = new Set(
    (await db.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`, schema)).map((r) => r.table_name));
  const liveColumns = new Map<string, Set<string>>();
  for (const r of await db.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1`, schema)) {
    if (!liveColumns.has(r.table_name)) liveColumns.set(r.table_name, new Set());
    liveColumns.get(r.table_name)!.add(r.column_name);
  }

  const missingTables: string[] = [];
  const missingColumns: { table: string; column: string }[] = [];

  for (const model of models) {
    if (!liveTables.has(model.name)) { missingTables.push(model.name); continue; }
    const cols = liveColumns.get(model.name) ?? new Set();
    for (const f of model.fields) {
      if (f.isRelation) continue;
      if (!cols.has(f.name)) missingColumns.push({ table: model.name, column: f.name });
    }
  }

  // Row-level security is part of this platform's contract, so a table without it is also a finding.
  const noRls = (await db.$queryRawUnsafe<{ relname: string }[]>(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relkind = 'r' AND NOT c.relrowsecurity AND c.relname <> 'search_fts'
     ORDER BY 1`, schema)).map((r) => r.relname);

  console.log(`\n=== ${schema} ===`);
  console.log(`models in schema.prisma: ${models.length} · tables present: ${models.filter((m) => liveTables.has(m.name)).length}`);

  if (missingTables.length) {
    console.log(`\n  MISSING TABLES (${missingTables.length}):`);
    for (const t of missingTables) console.log(`    ${t}`);
  }
  if (missingColumns.length) {
    console.log(`\n  MISSING COLUMNS (${missingColumns.length}):`);
    for (const c of missingColumns) console.log(`    ${c.table}.${c.column}`);
  }
  if (noRls.length) {
    console.log(`\n  TABLES WITHOUT ROW-LEVEL SECURITY (${noRls.length}):`);
    for (const t of noRls) console.log(`    ${t}`);
  }
  if (!missingTables.length && !missingColumns.length && !noRls.length) {
    console.log("  Everything the code expects is present, and RLS is on throughout.");
  }

  await db.$disconnect();
  return { schema, missingTables, missingColumns, noRls };
}

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
const targets = process.argv.includes("--all") ? ["public", "dev"] : [arg];
const results = [];
for (const t of targets) results.push(await check(t));

const broken = results.filter((r) => r.missingTables.length || r.missingColumns.length);
if (broken.length) {
  console.log(`\nFAIL: ${broken.map((b) => b.schema).join(", ")} is missing objects the deployed code expects.`);
  console.log("Deployed code that reads a missing table returns 500. Run the ddl-* scripts for that schema.");
  process.exit(1);
}
console.log("\nOK.");
