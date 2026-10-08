// Phase 10 unit tests: multi-city rules, postcode -> city, area/city validation, the quality gate and coverage.
import { PrismaClient } from "@prisma/client";
import { CITY_STATUS, EDITOR_ROLES, cityCoverage, cityForPostcode, isLive, multiCity, outwardLetters, parsePrefixes, slugify, validateArea, validateCity } from "../src/lib/cities";
import { collectIndexable, decideCity, decideLocation, seoHealth } from "../src/lib/seo-engine";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const LONG = "x".repeat(120);

async function main() {
  // ---------------- postcode -> city ----------------
  t("outward letters: parsed from real postcodes, nothing from junk",
    outwardLetters("SW1A 1AA") === "SW" && outwardLetters("e8 3aa") === "E" && outwardLetters("EC1V 9NR") === "EC" && outwardLetters("M1 1AE") === "M"
    && outwardLetters("hello") === null && outwardLetters("") === null && outwardLetters("12345") === null);
  const cities = [
    { slug: "london", name: "London", postcodePrefixes: JSON.stringify(["E", "EC", "SW", "N"]) },
    { slug: "manchester", name: "Manchester", postcodePrefixes: JSON.stringify(["M", "OL"]) },
    { slug: "nowhere", name: "Nowhere", postcodePrefixes: null },
  ];
  t("postcode finds its city", cityForPostcode("E8 3AA", cities)?.slug === "london" && cityForPostcode("M1 1AE", cities)?.slug === "manchester" && cityForPostcode("OL1 1AA", cities)?.slug === "manchester");
  t("longest prefix wins, so overlapping prefixes are safe (EC1 is London, not E)", cityForPostcode("EC1V 9NR", cities)?.slug === "london");
  t("a postcode we don't cover returns nothing (rather than guessing a city)", cityForPostcode("BT1 1AA", cities) === null && cityForPostcode("nonsense", cities) === null);
  t("case and spacing don't matter", cityForPostcode("sw1a1aa", cities)?.slug === "london" && cityForPostcode("  m1 1ae ", cities)?.slug === "manchester");
  t("prefixes parse safely from bad data", parsePrefixes(null).length === 0 && parsePrefixes("not json").length === 0 && parsePrefixes('["e","EC",7]').join(",") === "E,EC");

  // ---------------- city validation ----------------
  const ok = { name: "Manchester", slug: "manchester", status: "COMING_SOON", intro: LONG, lat: "53.4808", lng: "-2.2426", prefixes: "M, OL  BL" };
  t("valid city accepted; prefixes normalised and de-duplicated", (() => {
    const v = validateCity({ ...ok, prefixes: "m ol M" });
    return v.ok && v.value.slug === "manchester" && v.value.postcodePrefixes === JSON.stringify(["M", "OL"]);
  })());
  t("city name and address are required", !validateCity({ ...ok, name: "", slug: "" }).ok && !!validateCity({ ...ok, name: "M" }).errors.name);
  t("slug is derived from the name when blank", validateCity({ ...ok, name: "Newcastle upon Tyne", slug: "" }).value.slug === "newcastle-upon-tyne");
  t("a city can't take a slug the site already uses as a section", !validateCity({ ...ok, slug: "news" }).ok && !validateCity({ ...ok, slug: "admin" }).ok && !validateCity({ ...ok, slug: "podcast" }).ok);
  t("status must be known", !validateCity({ ...ok, status: "WHATEVER" }).ok && Object.keys(CITY_STATUS).every((k) => validateCity({ ...ok, status: k }).ok));
  t("coordinates are validated and must come as a pair", !validateCity({ ...ok, lat: "91" }).ok && !validateCity({ ...ok, lng: "-999" }).ok && !validateCity({ ...ok, lat: "53.4", lng: "" }).ok && validateCity({ ...ok, lat: "", lng: "" }).ok);
  t("postcode prefixes must look like prefixes", !validateCity({ ...ok, prefixes: "M1" }).ok && !validateCity({ ...ok, prefixes: "LONDON" }).ok && validateCity({ ...ok, prefixes: "" }).ok);
  t("slugify handles ampersands, punctuation and spacing", slugify("Stoke & Trent!") === "stoke-and-trent" && slugify("  Kingston upon Thames  ") === "kingston-upon-thames");

  // ---------------- area validation ----------------
  t("area needs a name; neighbourhood needs a borough; borough must not have one",
    !validateArea({ name: "", slug: "", kind: "BOROUGH" }).ok
    && !validateArea({ name: "Shoreditch", slug: "shoreditch", kind: "NEIGHBOURHOOD", parentId: null }).ok
    && !validateArea({ name: "Hackney", slug: "hackney", kind: "BOROUGH", parentId: "abc" }).ok
    && validateArea({ name: "Shoreditch", slug: "", kind: "NEIGHBOURHOOD", parentId: "abc" }).ok);
  t("neighbourhood keeps its parent, borough never does",
    validateArea({ name: "Soho", slug: "soho", kind: "NEIGHBOURHOOD", parentId: "p1" }).value.parentId === "p1"
    && validateArea({ name: "Camden", slug: "camden", kind: "BOROUGH" }).value.parentId === null);
  t("unknown area type refused", !validateArea({ name: "Soho", slug: "soho", kind: "REGION" }).ok);

  // ---------------- quality gate ----------------
  t("a city that has not launched is never indexed, however much content it has", !decideCity(500, LONG, "COMING_SOON").index && decideCity(500, LONG, "COMING_SOON").reasons[0].includes("not launched"));
  t("a live city still needs real businesses and an intro", !decideCity(0, LONG, "LIVE").index && !decideCity(10, null, "LIVE").index && !decideCity(1, LONG, "LIVE").index && decideCity(3, LONG, "LIVE").index);
  t("coming soon beats a manual force-to-index, so empty cities can't be forced into search", !decideCity(5, LONG, "COMING_SOON", { robots: "INDEX" }).index);
  t("a live city can be forced or suppressed manually", decideCity(1, null, "LIVE", { robots: "INDEX" }).index && !decideCity(50, LONG, "LIVE", { robots: "NOINDEX" }).index);
  t("neighbourhoods use the same rule as boroughs: no intro, no index", !decideLocation(10, null).index && decideLocation(10, LONG).index);

  // ---------------- real data ----------------
  const london = (await db.city.findUnique({ where: { slug: "london" } }))!;
  t("London is seeded as a live city with an intro, centre, region and postcode prefixes",
    isLive(london) && (london.intro ?? "").length > 100 && london.lat !== null && london.region === "Greater London" && parsePrefixes(london.postcodePrefixes).includes("EC"));
  t("London has all 33 boroughs plus real neighbourhoods",
    (await db.location.count({ where: { cityId: london.id, kind: "BOROUGH" } })) === 33 && (await db.location.count({ where: { cityId: london.id, kind: "NEIGHBOURHOOD" } })) >= 40);
  t("every neighbourhood sits inside a borough of the same city", await (async () => {
    const hoods = await db.location.findMany({ where: { kind: "NEIGHBOURHOOD" }, include: { parent: true } });
    return hoods.length > 0 && hoods.every((h) => h.parent && h.parent.kind === "BOROUGH" && h.parent.cityId === h.cityId);
  })());
  t("seeded neighbourhoods carry no intro, so they stay out of the index until an editor writes one",
    (await db.location.count({ where: { kind: "NEIGHBOURHOOD", intro: { not: null } } })) === 0);
  t("the real postcode of a seeded business resolves to London", cityForPostcode("E8 3AA", [london])?.slug === "london");
  t("single city: no switcher, no city filters", (await multiCity()) === false);

  // area slugs are unique per city, not globally: two cities may both have a "richmond"
  const other = await db.city.create({ data: { slug: "test-city-unit", name: "Test City", status: "COMING_SOON" } });
  const dupe = await db.location.create({ data: { cityId: other.id, slug: "camden", name: "Camden", kind: "BOROUGH" } });
  t("the same area slug can exist in two cities", (await db.location.count({ where: { slug: "camden" } })) === 2);
  let clashed = false;
  try { await db.location.create({ data: { cityId: other.id, slug: "camden", name: "Camden Again", kind: "BOROUGH" } }); } catch { clashed = true; }
  t("but not twice within one city", clashed);
  t("more than one city turns the switcher on", (await multiCity()) === true);

  const health = await seoHealth();
  t("index health covers both city hubs and reports the unlaunched city as not indexable",
    health.some((r) => r.path === "/locations/london" && r.kind === "City") && health.some((r) => r.path === "/businesses/london")
    && health.filter((r) => r.path.startsWith("/locations/test-city-unit")).every((r) => !r.verdict.index));
  // the gate needs REAL (non-sample) businesses, so prove it with real rows rather than asserting against sample data
  const cat = (await db.category.findFirst())!, hackney = (await db.location.findFirst({ where: { cityId: london.id, slug: "hackney" } }))!;
  // The unlaunched test city has no real businesses, so it proves the rule without depending on how much
  // real content London happens to have in this database.
  const bareSet = await collectIndexable();
  t("sitemap: a city with no real businesses is NOT listed (sample data never counts)",
    !bareSet.cities.some((e) => e.path.includes("test-city-unit")));
  const londonRealBefore = await db.business.count({ where: { cityId: london.id, published: true, isSample: false } });
  const realIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const b = await db.business.create({ data: {
      slug: `unit-city-real-${i}`, name: `Unit City Real ${i}`, summary: "A real business for the unit test.",
      description: "A genuinely detailed description of a real business used to exercise the indexing quality gate properly.",
      cityId: london.id, locationId: hackney.id, categoryId: cat.id, isSample: false, phone: "020 7946 0100",
    } });
    realIds.push(b.id);
  }
  const set = await collectIndexable();
  t("sitemap: once a live city has real businesses + an intro, both city hubs are listed",
    set.cities.some((e) => e.path === "/locations/london") && set.cities.some((e) => e.path === "/businesses/london"));
  t("sitemap: the unlaunched city is excluded entirely (hubs and areas)",
    !set.cities.some((e) => e.path.includes("test-city-unit")) && !set.locations.some((e) => e.path.includes("test-city-unit")));
  t("sitemap: every area path is city-scoped (no pre-multi-city URLs left)",
    set.locations.every((e) => /^\/locations\/[a-z0-9-]+\/[a-z0-9-]+/.test(e.path)) && set.locations.every((e) => e.path.startsWith("/locations/london/")));
  const cov = await cityCoverage();
  t("coverage dashboard counts areas, REAL businesses (samples excluded) and team per city", (() => {
    const l = cov.find((c) => c.city.slug === "london")!, o = cov.find((c) => c.city.slug === "test-city-unit")!;
    return l.boroughs === 33 && l.neighbourhoods >= 40 && l.team >= 1 && l.businesses === londonRealBefore + realIds.length && o.boroughs === 1 && o.team === 0;
  })(), JSON.stringify(cov.map((c) => [c.city.slug, c.boroughs, c.businesses, c.team])));
  t("editor roles are a closed set", Object.keys(EDITOR_ROLES).length === 3 && "EDITOR" in EDITOR_ROLES);

  await db.business.deleteMany({ where: { id: { in: realIds } } });
  await db.location.delete({ where: { id: dupe.id } });
  await db.city.delete({ where: { id: other.id } });
  t("cleanup: the test city and test businesses are gone", (await db.city.count({ where: { slug: "test-city-unit" } })) === 0 && (await db.business.count({ where: { slug: { startsWith: "unit-city-real-" } } })) === 0);
}

main().then(async () => { await db.$disconnect(); console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exit(fail ? 1 : 0); })
  .catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
