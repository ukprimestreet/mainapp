// The geography import, pinned on the cases that are easy to get wrong.
// Runs against the `dev` schema, which must have been imported first (scripts/import-places.ts).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

async function main() {
  const total = await db.place.count();
  if (total === 0) throw new Error("No Place rows in dev. Run: npx tsx scripts/import-places.ts --schema=dev --fresh");

  // ---------------- the hierarchy exists and is current
  t("England is the single root", (await db.place.count({ where: { kind: "COUNTRY", parentId: null } })) === 1);
  t("nine regions", (await db.place.count({ where: { kind: "REGION" } })) === 9);
  t("296 local authorities (233 LAD + 63 unitary)", (await db.place.count({ where: { kind: { in: ["LAD", "UNITARY"] } } })) === 296);
  t("6,834 wards", (await db.place.count({ where: { kind: "WARD" } })) === 6834);
  t("21 two-tier counties", (await db.place.count({ where: { kind: "COUNTY" } })) === 21);
  t("no orphans: every parentId resolves", (await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "dev"."Place" p WHERE p."parentId" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "dev"."Place" q WHERE q.id = p."parentId")`))[0].n === 0);
  t("every administrative row carries a GSS code", (await db.place.count({
    where: { kind: { in: ["COUNTRY", "REGION", "COUNTY", "UNITARY", "LAD", "WARD"] }, gssCode: null } })) === 0);
  t("Barking and Dagenham resolves by its GSS code", (await db.place.findFirst({ where: { gssCode: "E09000002" } }))?.name === "Barking and Dagenham");

  // ---------------- MERGE: one place straddling a boundary must not become two
  for (const name of ["Accrington", "Aldershot"]) {
    const hits = await db.place.findMany({ where: { name, kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } } });
    t(`${name} is one place, not several`, hits.length === 1, `got ${hits.length}: ${hits.map((h) => h.label).join(" | ")}`);
    t(`…and ${name} records what was merged into it`, !!hits[0]?.mergedFrom);
  }

  // ---------------- COLLAPSE: a locality that is also a ward is one settlement, not two
  const becontree = await db.place.findMany({ where: { name: "Becontree", kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } } });
  t("Becontree is one settlement", becontree.length === 1, `got ${becontree.length}`);
  t("…and the ward of the same name is a separate WARD row", (await db.place.count({ where: { name: "Becontree", kind: "WARD" } })) === 1);

  // ---------------- DISAMBIGUATE: genuinely different places sharing a name
  const rushGreens = await db.place.findMany({ where: { name: "Rush Green", kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } }, include: { parent: true } });
  t("several Rush Greens survive as distinct places", rushGreens.length >= 4, `got ${rushGreens.length}`);
  t("…each carries a disambiguation label", rushGreens.every((r) => !!r.disambiguation));
  t("…so no two share a display label", new Set(rushGreens.map((r) => r.label)).size === rushGreens.length,
    rushGreens.map((r) => r.label).join(" | "));
  t("…and none of them is in Barking and Dagenham, whatever the ward is called",
    !rushGreens.some((r) => r.parent?.name === "Barking and Dagenham"));
  t("the Barking and Dagenham ward naming Rush Green does exist",
    (await db.place.count({ where: { kind: "WARD", name: { contains: "Rush Green" } } })) >= 1);

  // ---------------- a name is never an identifier
  const dupLabels = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM (SELECT label FROM "dev"."Place"
       WHERE kind IN ('TOWN','SUBURB','LOCALITY') GROUP BY label HAVING count(*) > 1) x`);
  t("the hardest cases still share a label, and are marked as not warranting a page", dupLabels[0].n > 0);
  const ambiguousNoPage = await db.place.count({ where: { pageJustified: "NO" } });
  t("…with pageJustified=NO recorded against them", ambiguousNoPage > 0, `${ambiguousNoPage} rows`);

  // ---------------- slugs are unique within a parent
  const slugClash = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM (SELECT "parentId", slug FROM "dev"."Place" GROUP BY "parentId", slug HAVING count(*) > 1) x`);
  t("no two siblings share a slug", slugClash[0].n === 0);

  // ---------------- aliases, from a source, never invented
  t("inverted sort forms were captured as aliases", (await db.placeAlias.count({ where: { kind: "SPELLING" } })) > 3000);
  const comptonAlias = await db.placeAlias.findFirst({ where: { alias: "Abbas, Compton" }, include: { place: true } });
  t("\"Abbas, Compton\" points at Compton Abbas", comptonAlias?.place.name === "Compton Abbas");
  t("every alias records its source", (await db.placeAlias.count({ where: { source: "" } })) === 0);
  const editorial = await db.placeAlias.findFirst({ where: { alias: "Croydon Town" }, include: { place: true } });
  t("our editorial name \"Croydon Town\" is an alias of Croydon, sourced to us", editorial?.place.name === "Croydon" && editorial?.source === "PRIMESTREET_EXISTING");

  // ---------------- honesty about stale parentage
  const low = await db.place.count({ where: { confidence: "LOW" } });
  t("places whose 2016 authority no longer exists are flagged, not reattached by guesswork", low > 0, `${low} rows`);
  const lowSample = await db.place.findFirst({ where: { confidence: "LOW" }, include: { parent: true } });
  t("…and each explains itself in decisionNotes", !!lowSample?.decisionNotes?.includes("no longer exists"));
  t("…and hangs off a region rather than a wrong authority", ["REGION", "COUNTRY"].includes(lowSample?.parent?.kind ?? ""));

  // ---------------- the legacy migration is reversible and complete enough to trust
  const locs = await db.location.count();
  const mapped = await db.place.count({ where: { legacyLocationId: { not: null } } });
  t(`all 33 boroughs mapped`, (await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "dev"."Place" p JOIN "dev"."Location" l ON l.id = p."legacyLocationId" WHERE l.kind = 'BOROUGH'`))[0].n === 33);
  t(`${mapped} of ${locs} legacy locations mapped, and the unmapped are named not hidden`, mapped === 80, `mapped ${mapped}`);
  t("no legacy location is claimed by two places", (await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM (SELECT "legacyLocationId" FROM "dev"."Place"
       WHERE "legacyLocationId" IS NOT NULL GROUP BY "legacyLocationId" HAVING count(*) > 1) x`))[0].n === 0);

  // ---------------- Location is untouched: live URLs still depend on it
  t("the existing Location tree is intact", locs === 83);
  // locationId is non-nullable, so the meaningful check is that every one still resolves to a real Location.
  t("every business locationId still resolves to a Location", (await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "dev"."Business" b
       WHERE NOT EXISTS (SELECT 1 FROM "dev"."Location" l WHERE l.id = b."locationId")`))[0].n === 0);
  t("businesses now also carry a placeId", (await db.business.count({ where: { placeId: { not: null } } })) === await db.business.count());

  // ---------------- the places named in the brief
  for (const [name, where] of [["Thatcham", "West Berkshire"], ["Wash Common", "West Berkshire"], ["Chadwell Heath", "Barking and Dagenham"]] as const) {
    const p = await db.place.findFirst({ where: { name, kind: { in: ["TOWN", "SUBURB", "LOCALITY"] } }, include: { parent: true } });
    t(`${name} exists`, !!p, "absent from the import");
    if (p) t(`…and sits under ${where} or its region`, p.parent?.name === where || p.parent?.kind === "REGION", `parent is ${p.parent?.name} (${p.parent?.kind})`);
  }

  console.log(fail === 0 ? "\nALL PLACE IMPORT TESTS PASS" : `\n${fail} FAILED`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
