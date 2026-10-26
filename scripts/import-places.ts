/**
 * Imports England geography into the Place tree.
 *
 * Reads the two verified files in docs/leadgen/geography/ and nothing else. Every row carries the source it
 * came from and the date it was fetched, so any record can be traced back or re-derived.
 *
 * Order matters and is deliberate:
 *   1. The CURRENT administrative skeleton (country -> region -> county/unitary -> local authority -> ward)
 *      from the 2026 ward lookup. Small, current, self-verifying, and it becomes the parent set.
 *   2. Settlements (towns, suburbs, localities) from the 2016 place index, after merging duplicates.
 *
 * The two merge steps that stop us creating thousands of duplicate places:
 *   - COLLAPSE: the same name in the same authority at two geography levels is ONE place.
 *   - CLUSTER:  the same name within 5km is ONE place that straddles a boundary, not two places.
 *               Accrington under both Hyndburn and Rossendale with an identical population is one town.
 *
 * Where a 2016 local authority no longer exists, the place is attached to its REGION and flagged
 * confidence=LOW with a note. It is never silently reattached to a guessed authority.
 *
 * Default target is `dev`. Production requires --schema=public, explicitly.
 * Idempotent: rows are keyed on sourceKey and skipped if present. --fresh clears imported rows first.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { readFileSync } from "fs";

const DIR = "docs/leadgen/geography";
const CLUSTER_KM = 5;

const arg = (name: string, fallback: string) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1];
const SCHEMA = arg("schema", "dev");
const FRESH = process.argv.includes("--fresh");
if (SCHEMA !== "dev" && SCHEMA !== "public") throw new Error(`Unknown schema: ${SCHEMA}`);

const db = new PrismaClient({
  datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${SCHEMA}`) } },
});

// ---------------------------------------------------------------- helpers
function readCsv(file: string): Record<string, string>[] {
  const text = readFileSync(`${DIR}/${file}`, "utf8");
  const out: Record<string, string>[] = [];
  let row: string[] = [], field = "", inQ = false, head: string[] | null = null;
  const endRow = () => {
    row.push(field); field = "";
    if (!head) head = row;
    else if (row.length === head.length) out.push(Object.fromEntries(head.map((h, i) => [h, row[i]])));
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") endRow();
    else if (c !== "\r") field += c;
  }
  if (field || row.length) endRow();
  return out;
}

/** Deterministic ids from the natural key, so dev and production hold the same Place ids. */
const idFor = (sourceKey: string) => "pl" + createHash("sha1").update(sourceKey).digest("hex").slice(0, 23);

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "place";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** GSS code prefixes tell us what an administrative area actually is. */
const kindFromGss = (code: string) =>
  code.startsWith("E92") ? "COUNTRY" : code.startsWith("E12") ? "REGION" :
  code.startsWith("E10") ? "COUNTY" : code.startsWith("E09") ? "LAD" :
  code.startsWith("E08") ? "LAD" : code.startsWith("E07") ? "LAD" :
  code.startsWith("E06") ? "UNITARY" : code.startsWith("E05") ? "WARD" : "LAD";

type Row = {
  id: string; sourceKey: string; name: string; slug: string; kind: string; parentId: string | null;
  gssCode: string | null; osId: string | null; lat: number | null; lng: number | null; population: number | null;
  disambiguation: string | null; label: string; source: string; sourceDate: string; confidence: string;
  evidenceNotes: string | null; serviceable: boolean; pageJustified: string; decisionNotes: string | null;
  legacyLocationId: string | null; mergedFrom: string | null;
};

const rows: Row[] = [];
const seen = new Set<string>();
const slugTaken = new Set<string>();

function add(r: Omit<Row, "id" | "slug" | "label"> & { slug?: string }) {
  if (seen.has(r.sourceKey)) return rows.find((x) => x.sourceKey === r.sourceKey)!;
  let slug = r.slug ?? slugify(r.name);
  // Unique within parent, because two hamlets in one authority can share a name.
  let key = `${r.parentId ?? "-"}|${slug}`;
  for (let n = 2; slugTaken.has(key); n++) { slug = `${slugify(r.name)}-${n}`; key = `${r.parentId ?? "-"}|${slug}`; }
  slugTaken.add(key);
  const row: Row = { ...r, id: idFor(r.sourceKey), slug, label: r.disambiguation ? `${r.name}, ${r.disambiguation}` : r.name };
  rows.push(row); seen.add(r.sourceKey);
  return row;
}

// ================================================================ 1. administrative skeleton (2026)
const admin = readCsv("ENGLAND_ADMIN.csv");
if (admin.length === 0) throw new Error("ENGLAND_ADMIN.csv is empty — run scripts/fetch-england-places.mjs first");
const ADMIN_SRC = { source: "ONS_WD26_LOOKUP", sourceDate: admin[0].fetched };

const country = add({
  sourceKey: `GSS:${admin[0].country_code}`, name: admin[0].country_name, kind: "COUNTRY", parentId: null,
  gssCode: admin[0].country_code, osId: null, lat: null, lng: null, population: null,
  disambiguation: null, ...ADMIN_SRC, confidence: "HIGH", evidenceNotes: null,
  serviceable: true, pageJustified: "UNREVIEWED", decisionNotes: null, legacyLocationId: null, mergedFrom: null,
});

const base = { ...ADMIN_SRC, confidence: "HIGH", evidenceNotes: null, osId: null, lat: null, lng: null,
  population: null, disambiguation: null, serviceable: true, pageJustified: "UNREVIEWED",
  decisionNotes: null, legacyLocationId: null, mergedFrom: null };

const regionByCode = new Map<string, Row>();
for (const a of admin) {
  if (regionByCode.has(a.region_code)) continue;
  regionByCode.set(a.region_code, add({ sourceKey: `GSS:${a.region_code}`, name: a.region_name, kind: "REGION", parentId: country.id, gssCode: a.region_code, ...base }));
}

// A unitary authority is its own county tier: where the two codes match, do not invent a duplicate level.
const countyByCode = new Map<string, Row>();
for (const a of admin) {
  if (a.county_or_unitary_code === a.lad_code || countyByCode.has(a.county_or_unitary_code)) continue;
  countyByCode.set(a.county_or_unitary_code, add({
    sourceKey: `GSS:${a.county_or_unitary_code}`, name: a.county_or_unitary_name,
    kind: kindFromGss(a.county_or_unitary_code), parentId: regionByCode.get(a.region_code)!.id,
    gssCode: a.county_or_unitary_code, ...base,
  }));
}

const ladByCode = new Map<string, Row>();
for (const a of admin) {
  if (ladByCode.has(a.lad_code)) continue;
  const parent = countyByCode.get(a.county_or_unitary_code) ?? regionByCode.get(a.region_code)!;
  ladByCode.set(a.lad_code, add({
    sourceKey: `GSS:${a.lad_code}`, name: a.lad_name, kind: kindFromGss(a.lad_code),
    parentId: parent.id, gssCode: a.lad_code, ...base,
  }));
}

let wards = 0;
for (const a of admin) {
  const lad = ladByCode.get(a.lad_code)!;
  add({ sourceKey: `GSS:${a.ward_code}`, name: a.ward_name, kind: "WARD", parentId: lad.id, gssCode: a.ward_code, ...base });
  wards++;
}

console.log(`administrative skeleton: 1 country, ${regionByCode.size} regions, ${countyByCode.size} counties, ${ladByCode.size} local authorities, ${wards} wards`);

// ================================================================ 2. settlements (2016 place index)
const SETTLEMENT_KIND: Record<string, string> = { BUA: "TOWN", BUASD: "SUBURB", LOC: "LOCALITY" };
const RANK: Record<string, number> = { BUA: 3, BUASD: 2, LOC: 1 };

const places = readCsv("ENGLAND_PLACES.csv").filter((p) => SETTLEMENT_KIND[p.place_type]);
if (places.length === 0) throw new Error("No settlement rows found in ENGLAND_PLACES.csv");
const PLACE_SRC = { source: "ONS_IPN_GB", sourceDate: places[0].fetched };

type Src = { name: string; type: string; lad: string; ladName: string; region: string; lat: number; lng: number; pop: number; id: string; osId: string };
const raw: Src[] = places.map((p) => ({
  name: p.place_name, type: p.place_type, lad: p.lad_2015_code, ladName: p.lad_2015_name,
  region: p.region_name, lat: Number(p.lat), lng: Number(p.lng),
  pop: Number(p.population_2011 || 0), id: p.place_id, osId: p.place_code,
}));

/**
 * The index holds a place under two name forms: the natural one and an inverted sort form sharing the same
 * place_id — "Compton Abbas" and "Abbas, Compton". One place, two rows. Grouping by name would make them two
 * places; grouping by place_id makes them one, and the inverted form becomes an alias instead of being
 * thrown away. That alias is worth having: people search both ways round.
 */
const aliasesFor = new Map<string, Set<string>>(); // place_id -> alternative names
const byId = new Map<string, Src[]>();
for (const s of raw) {
  if (!byId.has(s.id)) byId.set(s.id, []);
  byId.get(s.id)!.push(s);
}
const parsed: Src[] = [];
let inverted = 0;
for (const [id, group] of byId) {
  const names = [...new Set(group.map((g) => g.name))];
  // The natural form is the one without a comma; fall back to the shortest if that is ambiguous.
  const canonical = names.find((n) => !n.includes(",")) ?? [...names].sort((a, b) => a.length - b.length)[0];
  const others = names.filter((n) => n !== canonical);
  if (others.length) { aliasesFor.set(id, new Set(others)); inverted++; }
  // Keep every row for this place (it may span authorities) but under the one canonical name.
  for (const g of group) parsed.push({ ...g, name: canonical });
}
console.log(`places with an inverted sort-form name captured as an alias: ${inverted}`);

// -- COLLAPSE: same place_id, or same name in the same authority, is one place whatever levels it was
//    recorded at. Keying on place_id first is what stops the two name forms becoming two places.
const collapsed = new Map<string, Src[]>();
for (const s of parsed) {
  const k = `${s.id}|${s.lad}`;
  if (!collapsed.has(k)) collapsed.set(k, []);
  collapsed.get(k)!.push(s);
}
const pickPrimary = (g: Src[]) => [...g].sort((a, b) => b.pop - a.pop || RANK[b.type] - RANK[a.type] || a.id.localeCompare(b.id))[0];

// -- CLUSTER: same name within 5km = one place straddling a boundary.
const byName = new Map<string, { primary: Src; members: Src[] }[]>();
for (const [, g] of collapsed) {
  const primary = pickPrimary(g);
  const list = byName.get(primary.name) ?? [];
  list.push({ primary, members: g });
  byName.set(primary.name, list);
}

let merged = 0, flaggedStaleLad = 0, ambiguous = 0, settlements = 0;
const staleExamples: string[] = [];

for (const [name, groups] of byName) {
  // single-link clustering over the per-authority groups
  const clusters: { primary: Src; members: Src[] }[][] = [];
  const used = new Set<number>();
  for (let i = 0; i < groups.length; i++) {
    if (used.has(i)) continue;
    const stack = [i], cl: typeof groups = [];
    used.add(i);
    while (stack.length) {
      const k = stack.pop()!;
      cl.push(groups[k]);
      for (let j = 0; j < groups.length; j++) {
        if (!used.has(j) && km(groups[k].primary, groups[j].primary) <= CLUSTER_KM) { used.add(j); stack.push(j); }
      }
    }
    clusters.push(cl);
  }
  if (groups.length > 1 && clusters.length < groups.length) merged++;
  const needsDisambiguation = clusters.length > 1;
  if (needsDisambiguation) ambiguous++;

  for (const cl of clusters) {
    const all = cl.flatMap((c) => c.members);
    const primary = pickPrimary(all);
    const lad = ladByCode.get(primary.lad);
    let parentId: string, confidence = "MEDIUM", note: string | null = null;

    if (lad) parentId = lad.id;
    else {
      // The 2016 authority no longer exists. Attach to the region and say so; do not guess a replacement.
      const region = [...regionByCode.values()].find((r) => r.name === primary.region);
      parentId = (region ?? country).id;
      confidence = "LOW";
      note = `2015 local authority "${primary.ladName}" (${primary.lad}) no longer exists in the 2026 geography. Attached to ${region?.name ?? "England"} pending review rather than guessing a successor.`;
      flaggedStaleLad++;
      if (staleExamples.length < 5) staleExamples.push(`${primary.name} (was ${primary.ladName})`);
    }

    const disambiguation = needsDisambiguation ? (lad?.name ?? primary.region) : null;
    // A hamlet whose name is ambiguous and which has no recorded population is not worth a page.
    const pageJustified = needsDisambiguation && primary.pop === 0 ? "NO" : "UNREVIEWED";

    add({
      sourceKey: `IPN:${primary.id}`, name: primary.name, kind: SETTLEMENT_KIND[primary.type],
      parentId, gssCode: null, osId: primary.osId,
      lat: primary.lat, lng: primary.lng, population: primary.pop || null,
      disambiguation, ...PLACE_SRC, confidence,
      evidenceNotes: `Index of Place Names type ${primary.type}; recorded under ${primary.ladName}`,
      serviceable: true, pageJustified,
      decisionNotes: [note, all.length > 1 ? `Merged ${all.length} source rows (boundary split or multiple geography levels).` : null,
        pageJustified === "NO" ? "Ambiguous name with no recorded population: no landing page." : null]
        .filter(Boolean).join(" ") || null,
      legacyLocationId: null,
      mergedFrom: all.length > 1 ? JSON.stringify(all.filter((s) => s.id !== primary.id).map((s) => `IPN:${s.id}`)) : null,
    });
    settlements++;
  }
}

const settlementRows = rows.filter((r) => ["TOWN", "SUBURB", "LOCALITY"].includes(r.kind)).length;
console.log(`settlements: ${settlementRows} places from ${raw.length} source rows (${settlements - settlementRows} clusters shared a place_id with another and were merged into it)`);
console.log(`  names whose rows merged into fewer places: ${merged}`);
console.log(`  names needing a disambiguation label:      ${ambiguous}`);
console.log(`  flagged: 2016 authority no longer exists:  ${flaggedStaleLad}${staleExamples.length ? ` e.g. ${staleExamples.join(", ")}` : ""}`);

// ================================================================ 3. write
if (FRESH) {
  await db.$executeRawUnsafe(`UPDATE "${SCHEMA}"."Business" SET "placeId" = NULL`);
  const n = await db.place.deleteMany({});
  console.log(`\n--fresh: removed ${n.count} existing Place rows`);
}

console.log(`\nwriting ${rows.length} rows to ${SCHEMA}...`);
// Parents before children: the tree is built level by level, so insertion order must follow it.
const order = ["COUNTRY", "REGION", "COUNTY", "UNITARY", "LAD", "WARD", "TOWN", "SUBURB", "LOCALITY"];
rows.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
let written = 0;
for (let i = 0; i < rows.length; i += 1000) {
  const chunk = rows.slice(i, i + 1000);
  const r = await db.place.createMany({ data: chunk, skipDuplicates: true });
  written += r.count;
  if (i % 10000 === 0) process.stdout.write(".");
}
console.log(`\ninserted ${written} (${rows.length - written} already present)`);

// A short write is the failure mode that hides: the run looks fine and thousands of places are missing.
const inDb = await db.place.count();
if (!FRESH && written !== rows.length) console.log(`  note: ${rows.length - written} rows were already present (re-run)`);
if (inDb < rows.length) throw new Error(`Only ${inDb} Place rows in ${SCHEMA} but ${rows.length} were prepared. Refusing to report success.`);

// ---- aliases: the inverted sort forms, from the same authoritative source
const aliasRows: { id: string; placeId: string; alias: string; normalised: string; kind: string; source: string; sourceDate: string }[] = [];
for (const r of rows) {
  if (!r.sourceKey.startsWith("IPN:")) continue;
  const srcId = r.sourceKey.slice(4);
  for (const alias of aliasesFor.get(srcId) ?? []) {
    aliasRows.push({
      id: idFor(`${r.sourceKey}|alias|${alias}`), placeId: r.id, alias,
      normalised: norm(alias), kind: "SPELLING", source: PLACE_SRC.source, sourceDate: PLACE_SRC.sourceDate,
    });
  }
}
let aliasWritten = 0;
for (let i = 0; i < aliasRows.length; i += 1000) {
  const res = await db.placeAlias.createMany({ data: aliasRows.slice(i, i + 1000), skipDuplicates: true });
  aliasWritten += res.count;
}
console.log(`aliases written: ${aliasWritten} of ${aliasRows.length} prepared (inverted name forms, e.g. "Abbas, Compton" -> Compton Abbas)`);

// ================================================================ 4. map the existing 83 locations
/**
 * PrimeStreet's own editorial names that do not match the index, each checked by hand against the imported
 * data before being listed here. "Croydon Town" is our label for the town centre, to distinguish it from the
 * borough; the index calls it "Croydon". Every one of these resolves to a single place inside the right
 * borough, so the mapping is verified rather than guessed.
 *
 * Deliberately absent: "Angel" (not in the index anywhere), "Greenwich Town" and "Ealing Broadway" (the base
 * names exist only in other boroughs — Greenwich in Amber Valley and Bexley, Ealing in Brent). Those three
 * are reported as unmapped rather than attached to a plausible-looking neighbour.
 */
const LEGACY_NAME_FIX: Record<string, string> = {
  "Richmond Town": "Richmond",
  "Croydon Town": "Croydon",
  "Bromley Town": "Bromley",
  "Barnet Town": "Barnet",
};

const legacy = await db.location.findMany({ include: { city: true, parent: true } });
let mappedBorough = 0, mappedNeighbourhood = 0, viaFix = 0;
const unmapped: string[] = [];
const legacyAliases: { id: string; placeId: string; alias: string; normalised: string; kind: string; source: string; sourceDate: string }[] = [];

for (const loc of legacy) {
  const target = loc.kind === "BOROUGH"
    // A borough is a local authority: match on name among LADs.
    ? await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: loc.name } })
    // A neighbourhood is a settlement inside its parent borough.
    : await (async () => {
        const parentPlace = loc.parentId ? await db.place.findFirst({ where: { legacyLocationId: loc.parentId } }) : null;
        if (!parentPlace) return null;
        const names = [loc.name, LEGACY_NAME_FIX[loc.name]].filter(Boolean) as string[];
        const within = await db.place.findFirst({
          where: { name: { in: names }, parentId: parentPlace.id, kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } },
        });
        if (within && within.name !== loc.name) {
          viaFix++;
          // Our editorial name becomes a searchable alias, sourced to us rather than passed off as ONS data.
          legacyAliases.push({
            id: idFor(`LEGACY:${loc.id}|alias`), placeId: within.id, alias: loc.name,
            normalised: norm(loc.name), kind: "LOCAL_NAME",
            source: "PRIMESTREET_EXISTING", sourceDate: new Date().toISOString().slice(0, 10),
          });
        }
        return within ?? null;
      })();

  if (!target) { unmapped.push(`${loc.kind} ${loc.name}`); continue; }
  await db.place.update({ where: { id: target.id }, data: { legacyLocationId: loc.id } }).catch(() => unmapped.push(`${loc.name} (already claimed)`));
  if (loc.kind === "BOROUGH") mappedBorough++; else mappedNeighbourhood++;
}

if (legacyAliases.length) {
  const r = await db.placeAlias.createMany({ data: legacyAliases, skipDuplicates: true });
  console.log(`\nPrimeStreet editorial names kept as aliases: ${r.count}`);
}

const boroughs = legacy.filter((l) => l.kind === "BOROUGH").length;
const hoods = legacy.length - boroughs;
console.log(`legacy mapping: ${mappedBorough}/${boroughs} boroughs, ${mappedNeighbourhood}/${hoods} neighbourhoods (${viaFix} via a verified name correction)`);
if (unmapped.length) {
  console.log(`  UNMAPPED (${unmapped.length}) — left for review rather than attached to a plausible neighbour:`);
  for (const u of unmapped) console.log(`    ${u}`);
}

// ================================================================ 5. point businesses at a place (write-only)
const businesses = await db.business.findMany({ select: { id: true, locationId: true } });
let pointed = 0;
for (const b of businesses) {
  const p = await db.place.findFirst({ where: { legacyLocationId: b.locationId }, select: { id: true } });
  if (p) { await db.business.update({ where: { id: b.id }, data: { placeId: p.id } }); pointed++; }
}
console.log(`businesses given a placeId: ${pointed}/${businesses.length} (nothing reads this column yet)`);

await db.$disconnect();
console.log(`\nDone: ${SCHEMA}.`);
