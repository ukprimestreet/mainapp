/**
 * Decomposes the "one in five place names is ambiguous" figure.
 *
 * That headline number counts any name occurring in more than one row, which lumps together four very
 * different situations. Only one of them is true ambiguity; the others are artefacts of how the index is
 * built, and they need collapsing rather than disambiguating. Read-only.
 */
import { readFileSync } from "fs";

const SRC = "docs/leadgen/geography/ENGLAND_PLACES.csv";

// Minimal CSV reader: the file is our own output, but it does contain quoted commas.
function parse(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const all = parse(readFileSync(SRC, "utf8"));

// The types that would ever become a place a customer or business selects. Counties, regions, historic
// counties and national parks are containers, not settlements, and are handled as hierarchy levels.
const SETTLEMENT = new Set(["LOC", "BUA", "BUASD"]);
const settlements = all.filter((r) => SETTLEMENT.has(r.place_type));

const group = (rows, keyFn) => {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};

console.log(`rows in file: ${all.length.toLocaleString()}`);
console.log(`settlement rows (LOC/BUA/BUASD): ${settlements.length.toLocaleString()}\n`);

// ---------------------------------------------------------------- 1. the headline, recomputed
const byNameAll = group(all, (r) => r.place_name);
const dupNamesAll = [...byNameAll.values()].filter((v) => v.length > 1);
console.log(`[headline] distinct names across ALL types: ${byNameAll.size.toLocaleString()}`);
console.log(`           names on more than one row:      ${dupNamesAll.length.toLocaleString()}\n`);

// ---------------------------------------------------------------- 2. decompose
const byName = group(settlements, (r) => r.place_name);
let uniqueName = 0, sameLadSameType = 0, sameLadDiffType = 0, trulyDistinct = 0;
const distinctExamples = [];
const sameLadExamples = [];

for (const [name, rows] of byName) {
  if (rows.length === 1) { uniqueName++; continue; }
  const lads = new Set(rows.map((r) => r.lad_2015_code));
  const keys = new Set(rows.map((r) => `${r.lad_2015_code}|${r.place_type}`));
  if (lads.size === 1 && keys.size === 1) {
    // Same name, same authority, same type: a split place or a duplicate row, not two places.
    sameLadSameType++;
    if (sameLadExamples.length < 4) sameLadExamples.push([name, rows]);
  } else if (lads.size === 1) {
    // Same authority, different type: one place recorded at two levels (a locality that is also a ward).
    sameLadDiffType++;
  } else {
    // Different authorities: genuinely different places that share a name. THIS is the real problem.
    trulyDistinct++;
    if (distinctExamples.length < 6) distinctExamples.push([name, rows]);
  }
}

console.log("[decomposed, settlements only]");
console.log(`  names used once:                                  ${uniqueName.toLocaleString()}`);
console.log(`  same authority, same type (split/duplicate rows): ${sameLadSameType.toLocaleString()}  -> merge`);
console.log(`  same authority, different type (one place, two levels): ${sameLadDiffType.toLocaleString()}  -> collapse`);
console.log(`  DIFFERENT authorities (real ambiguity):           ${trulyDistinct.toLocaleString()}  -> disambiguate`);
const pct = ((trulyDistinct / byName.size) * 100).toFixed(1);
console.log(`\n  real ambiguity rate among settlement names: ${trulyDistinct.toLocaleString()} of ${byName.size.toLocaleString()} = ${pct}%\n`);

// ---------------------------------------------------------------- 3. can a parent label separate them?
let separableByLad = 0, separableByRegion = 0, needMore = 0;
const hardCases = [];
for (const [name, rows] of byName) {
  const lads = new Set(rows.map((r) => r.lad_2015_code));
  if (rows.length === 1 || lads.size === 1) continue;
  const ladNames = new Set(rows.map((r) => r.lad_2015_name));
  const regions = new Set(rows.map((r) => r.region_name));
  if (ladNames.size === rows.length) separableByLad++;
  else if (regions.size === rows.length) separableByRegion++;
  else { needMore++; if (hardCases.length < 6) hardCases.push([name, rows]); }
}
console.log("[can a parent name alone disambiguate?]");
console.log(`  "Name, Local Authority" is unique:  ${separableByLad.toLocaleString()}`);
console.log(`  "Name, Region" is unique instead:   ${separableByRegion.toLocaleString()}`);
console.log(`  needs more than one parent level:   ${needMore.toLocaleString()}`);

// ---------------------------------------------------------------- 4. does population pick a winner?
let popDecides = 0, popTied = 0, popMissing = 0;
for (const [, rows] of byName) {
  const lads = new Set(rows.map((r) => r.lad_2015_code));
  if (rows.length === 1 || lads.size === 1) continue;
  const pops = rows.map((r) => Number(r.population_2011 || 0));
  const max = Math.max(...pops);
  if (max === 0) popMissing++;
  else if (pops.filter((p) => p === max).length === 1 && max >= 5 * Math.max(...pops.filter((p) => p !== max), 1)) popDecides++;
  else popTied++;
}
console.log("\n[would population resolve a bare name?]");
console.log(`  one place is 5x larger than the rest: ${popDecides.toLocaleString()}  -> a defensible default`);
console.log(`  no clear winner:                      ${popTied.toLocaleString()}  -> must ask the user`);
console.log(`  no population recorded at all:        ${popMissing.toLocaleString()}  -> must ask the user`);

// ---------------------------------------------------------------- 5. examples
console.log("\n[real ambiguity, examples]");
for (const [name, rows] of distinctExamples) {
  console.log(`  ${name}: ${rows.map((r) => `${r.place_type} in ${r.lad_2015_name} (${r.region_name}, pop ${r.population_2011 || "?"})`).join(" | ")}`);
}
console.log("\n[same authority + same type, examples — these are one place, not several]");
for (const [name, rows] of sameLadExamples) {
  console.log(`  ${name}: ${rows.length} rows in ${rows[0].lad_2015_name}, split_indicator=${rows.map((r) => r.split_indicator).join("/")}`);
}
console.log("\n[hardest cases — two places sharing a name AND an authority or region]");
for (const [name, rows] of hardCases) {
  console.log(`  ${name}: ${rows.map((r) => `${r.lad_2015_name}/${r.region_name}`).join(" | ")}`);
}
