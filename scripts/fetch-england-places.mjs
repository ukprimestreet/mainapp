/**
 * Downloads England's complete place and administrative geography from the ONS Open Geography Portal.
 *
 * Nothing here is typed from memory. Every row comes from one of two authoritative services, and the output
 * records which one, when it was fetched and under what licence. The master plan is explicit: "Do not rely on
 * an AI's memory to build the location database."
 *
 * Two files, because they answer different questions and have different vintages:
 *
 *   ENGLAND_PLACES.csv  — every named place in England: localities (villages, hamlets), built-up areas
 *                         (towns, cities), built-up-area sub-divisions (suburbs), parishes, wards and the
 *                         administrative tiers. Source: Index of Place Names in Great Britain, July 2016
 *                         vintage (hosted 2022). Names and place types are stable; its LAD/county attribution
 *                         is 2016-era, so it is NOT the authority on current administrative parentage.
 *
 *   ENGLAND_ADMIN.csv   — the CURRENT administrative skeleton: ward → local authority → county/unitary →
 *                         region → country, with GSS codes. Source: WD26_LAD26_CTYUA26_RGN26_CTRY26_UK_LU,
 *                         2026 vintage. This IS the authority on current parentage.
 *
 * Licence: Office for National Statistics, licensed under the Open Government Licence v3.0. Contains OS data
 * (c) Crown copyright and database right. Attribution is required wherever this data is published.
 *
 * Idempotent: re-running overwrites the files and re-verifies. Writes nothing to the database.
 */
import { writeFileSync, mkdirSync } from "fs";

const HOST = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services";
const OUT = "docs/leadgen/geography";
const FETCHED = new Date().toISOString().slice(0, 10);

const PLACES = {
  service: "Index_of_Place_Names_in_Great_Britain_July_2016_2022",
  where: "ctry15nm='England'",
  page: 2000,
  order: "objectid",
  fields: [
    "placeid", "place15cd", "place15nm", "descnm", "popcnt", "splitind",
    "ctry15nm", "rgn15cd", "rgn15nm", "cty15cd", "cty15nm",
    "lad15cd", "lad15nm", "laddescnm", "wd15cd", "par15cd", "bua11cd",
    "npark15nm", "lat", "long_",
  ],
};

const ADMIN = {
  service: "WD26_LAD26_CTYUA26_RGN26_CTRY26_UK_LU",
  where: "CTRY26NM='England'",
  page: 1000,
  order: "ObjectId",
  fields: ["WD26CD", "WD26NM", "LAD26CD", "LAD26NM", "CTYUA26CD", "CTYUA26NM", "RGN26CD", "RGN26NM", "CTRY26CD", "CTRY26NM"],
};

/** The place types the index uses, spelled out so the CSV is readable without the ONS codebook to hand. */
const TYPE_LABEL = {
  LOC: "Locality (village, hamlet or named settlement)",
  BUA: "Built-up area (town or city)",
  BUASD: "Built-up area sub-division (suburb or district)",
  PAR: "Civil parish",
  WD: "Electoral ward",
  RGN: "Region",
  CTY: "County",
  CTYHIST: "Historic county",
  CTYLT: "County (lieutenancy)",
  UA: "Unitary authority",
  LONB: "London borough",
  MD: "Metropolitan district",
  NMD: "Non-metropolitan district",
  NPARK: "National park",
};

async function getJson(url, attempt = 1) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j.error) throw new Error(`ArcGIS: ${j.error.message} ${JSON.stringify(j.error.details ?? [])}`);
    return j;
  } catch (e) {
    // The portal rate-limits and occasionally drops a connection; a paginated fetch must survive that or it
    // silently returns a short file, which is worse than failing.
    if (attempt >= 5) throw new Error(`${url}\n  gave up after ${attempt} attempts: ${e}`);
    const wait = 1500 * attempt;
    process.stdout.write(` [retry ${attempt} after ${wait}ms]`);
    await new Promise((res) => setTimeout(res, wait));
    return getJson(url, attempt + 1);
  }
}

const q = (spec, params) => {
  const u = new URL(`${HOST}/${spec.service}/FeatureServer/0/query`);
  u.searchParams.set("where", spec.where);
  u.searchParams.set("f", "json");
  u.searchParams.set("returnGeometry", "false");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
};

async function fetchAll(spec, label) {
  const expected = (await getJson(q(spec, { returnCountOnly: true }))).count;
  process.stdout.write(`${label}: ${expected.toLocaleString()} rows expected\n  `);

  const rows = [];
  for (let offset = 0; offset < expected; offset += spec.page) {
    const j = await getJson(q(spec, {
      outFields: spec.fields.join(","),
      orderByFields: spec.order, // a stable order, or pagination can repeat and drop rows
      resultOffset: offset,
      resultRecordCount: spec.page,
    }));
    const batch = (j.features ?? []).map((f) => f.attributes);
    if (batch.length === 0) break;
    rows.push(...batch);
    process.stdout.write(".");
  }
  process.stdout.write(`\n  fetched ${rows.length.toLocaleString()}\n`);
  if (rows.length !== expected) throw new Error(`${label}: fetched ${rows.length} but the server reported ${expected}. Refusing to write a short file.`);
  return rows;
}

const esc = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (head, rows) => [head.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n") + "\n";

// ---------------------------------------------------------------- run
mkdirSync(OUT, { recursive: true });

const places = await fetchAll(PLACES, "ENGLAND_PLACES (Index of Place Names, July 2016)");
const admin = await fetchAll(ADMIN, "ENGLAND_ADMIN (ward lookup, 2026)");

// ---- places file
const placeHead = [
  "place_id", "place_code", "place_name", "place_type", "place_type_label", "population_2011",
  "split_indicator", "country", "region_code", "region_name", "county_code", "county_name",
  "lad_2015_code", "lad_2015_name", "lad_2015_type", "ward_2015_code", "parish_2015_code",
  "built_up_area_code", "national_park", "lat", "lng", "source", "source_vintage", "fetched",
];
const placeRows = places.map((p) => [
  p.placeid, p.place15cd, p.place15nm, p.descnm, TYPE_LABEL[p.descnm] ?? "",
  p.popcnt, p.splitind, p.ctry15nm,
  p.rgn15cd, p.rgn15nm, p.cty15cd, p.cty15nm,
  p.lad15cd, p.lad15nm, p.laddescnm, p.wd15cd, p.par15cd, p.bua11cd, p.npark15nm,
  p.lat, p.long_,
  "ONS_IPN_GB", "July 2016 (hosted 2022)", FETCHED,
]);
writeFileSync(`${OUT}/ENGLAND_PLACES.csv`, csv(placeHead, placeRows), "utf8");

// ---- current administrative skeleton
const adminHead = [
  "ward_code", "ward_name", "lad_code", "lad_name", "county_or_unitary_code", "county_or_unitary_name",
  "region_code", "region_name", "country_code", "country_name", "source", "source_vintage", "fetched",
];
const adminRows = admin.map((a) => [
  a.WD26CD, a.WD26NM, a.LAD26CD, a.LAD26NM, a.CTYUA26CD, a.CTYUA26NM,
  a.RGN26CD, a.RGN26NM, a.CTRY26CD, a.CTRY26NM,
  "ONS_WD26_LOOKUP", "2026", FETCHED,
]);
writeFileSync(`${OUT}/ENGLAND_ADMIN.csv`, csv(adminHead, adminRows), "utf8");

// ---------------------------------------------------------------- verification
const byType = {};
for (const p of places) byType[p.descnm] = (byType[p.descnm] ?? 0) + 1;

const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const summary = {
  fetched: FETCHED,
  places_total: places.length,
  places_by_type: Object.fromEntries(Object.entries(byType).sort((a, b) => b[1] - a[1])),
  distinct_place_ids: uniq(places.map((p) => p.placeid)).length,
  distinct_place_names: uniq(places.map((p) => p.place15nm)).length,
  admin_wards: admin.length,
  admin_lads: uniq(admin.map((a) => a.LAD26CD)).length,
  admin_counties_or_unitaries: uniq(admin.map((a) => a.CTYUA26CD)).length,
  admin_regions: uniq(admin.map((a) => a.RGN26NM)).length,
  missing_coordinates: places.filter((p) => p.lat == null || p.long_ == null).length,
};
writeFileSync(`${OUT}/FETCH_SUMMARY.json`, JSON.stringify(summary, null, 2) + "\n", "utf8");

console.log("\n--- verification ---");
console.log(`places: ${summary.places_total.toLocaleString()} rows, ${summary.distinct_place_names.toLocaleString()} distinct names`);
console.log(`admin:  ${summary.admin_wards.toLocaleString()} wards, ${summary.admin_lads} local authorities, ${summary.admin_counties_or_unitaries} counties/unitaries, ${summary.admin_regions} regions`);
console.log(`rows missing coordinates: ${summary.missing_coordinates}`);
console.log("by type:", summary.places_by_type);

// Spot-check the places named in the brief and the master plan. If these are absent, the dataset is wrong
// for our purpose and no amount of row count makes up for it.
const want = ["Donnington", "Wash Common", "Speen", "Thatcham", "Newbury", "Becontree", "Chadwell Heath",
  "Rush Green", "Becontree Heath", "Marks Gate", "Dagenham Dock", "Castle Green", "Beam Park", "Dagenham"];
console.log("\n--- spot checks (places named in the brief) ---");
for (const name of want) {
  const hits = places.filter((p) => p.place15nm === name);
  const detail = hits.slice(0, 3).map((h) => `${h.descnm} in ${h.lad15nm}`).join("; ");
  console.log(`  ${hits.length ? "FOUND" : "ABSENT"}  ${name.padEnd(16)} ${hits.length ? `x${hits.length} — ${detail}` : ""}`);
}
