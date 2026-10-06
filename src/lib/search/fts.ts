import { db } from "../db";

/**
 * PostgreSQL full-text implementation of the text index (tsvector + GIN). Everything engine-specific lives here.
 * buildMatch() (text.ts) still produces a quoted boolean expression; toTsQuery() converts it, so user input never reaches SQL or
 * tsquery syntax unquoted. Ranking: ts_rank_cd with weights title 1.0, tags 0.4, body 0.1; English stemming (cleaner/cleaning/cleaned match);
 * the final token is a prefix match.
 *
 * Every statement names its schema explicitly. Through a transaction pooler (pgbouncer) a connection is not guaranteed to keep
 * the search_path set from the connection string, so relying on it silently creates and queries a second copy of this table in
 * another schema and search starts losing rows.
 */
const SCHEMA = (() => {
  const raw = (() => { try { return new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema"); } catch { return null; } })() ?? "public";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) throw new Error(`Refusing to use an unsafe schema name from DATABASE_URL: ${raw}`);
  return raw;
})();
const T = `"${SCHEMA}".search_fts`;
const DOCS = `"${SCHEMA}"."SearchDoc"`;

let ready: Promise<void> | null = null;
export function ensureFts() {
  ready ??= (async () => {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${T} (
      rid integer PRIMARY KEY, title text NOT NULL, tags text NOT NULL, body text NOT NULL,
      tsv tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', tags), 'B') || setweight(to_tsvector('english', body), 'D')) STORED)`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS search_fts_tsv_idx ON ${T} USING GIN (tsv)`);
    await db.$executeRawUnsafe(`ALTER TABLE ${T} ENABLE ROW LEVEL SECURITY`); // no policies: Supabase's public API (anon key) sees nothing
  })().catch((e) => { ready = null; throw e; });
  return ready;
}
export async function ftsUpsert(rid: number, title: string, tags: string, body: string) {
  await ensureFts();
  await db.$executeRawUnsafe(
    `INSERT INTO ${T}(rid, title, tags, body) VALUES ($1, $2, $3, $4) ON CONFLICT (rid) DO UPDATE SET title = EXCLUDED.title, tags = EXCLUDED.tags, body = EXCLUDED.body`,
    rid, title, tags, body,
  );
}
export async function ftsDelete(rid: number) { await ensureFts(); await db.$executeRawUnsafe(`DELETE FROM ${T} WHERE rid = $1`, rid); }
export async function ftsClear() { await ensureFts(); await db.$executeRawUnsafe(`DELETE FROM ${T}`); }
export async function ftsCount(): Promise<number> {
  await ensureFts();
  const r = await db.$queryRawUnsafe<{ n: number | bigint }[]>(`SELECT count(*) AS n FROM ${T}`);
  return Number(r[0].n);
}
/** Drops index rows whose document has gone (e.g. rows deleted straight from the database). Returns how many went. */
export async function ftsPrune(): Promise<number> {
  await ensureFts();
  return Number(await db.$executeRawUnsafe(`DELETE FROM ${T} f WHERE NOT EXISTS (SELECT 1 FROM ${DOCS} d WHERE d.rid = f.rid)`));
}

/** Convert buildMatch() output (`"word"*`, AND, OR, parentheses) into a tsquery string. Words are re-validated, never trusted. */
export function toTsQuery(match: string): string | null {
  const out = match
    .replace(/"([^"]*)"(\*?)/g, (_m, w: string, star: string) => {
      const word = w.toLowerCase().replace(/[^a-z0-9]/g, "");
      return word ? `'${word}'${star ? ":*" : ""}` : "";
    })
    .replace(/\bAND\b/g, "&").replace(/\bOR\b/g, "|");
  return /'[a-z0-9]+'/.test(out) && /^[\s'a-z0-9:*&|()]+$/.test(out) ? out : null;
}

/** Returns rid + relevance (higher = better). */
export async function ftsQuery(match: string, limit: number): Promise<{ rid: number; score: number }[]> {
  await ensureFts();
  const q = toTsQuery(match);
  if (!q) return [];
  const rows = await db.$queryRawUnsafe<{ rid: number; s: number }[]>(
    `SELECT rid, ts_rank_cd('{0.1,0.2,0.4,1.0}', tsv, to_tsquery('english', $1)) AS s FROM ${T} WHERE tsv @@ to_tsquery('english', $1) ORDER BY s DESC, rid LIMIT $2`,
    q, limit,
  );
  return rows.map((r) => ({ rid: Number(r.rid), score: Number(r.s) }));
}
export async function ftsTexts(): Promise<{ title: string; tags: string }[]> {
  await ensureFts();
  return db.$queryRawUnsafe<{ title: string; tags: string }[]>(`SELECT title, tags FROM ${T}`);
}
