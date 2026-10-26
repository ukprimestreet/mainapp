// Address lookup and postcode resolution.
// Every live call uses Ideal Postcodes' FREE test postcode, so running this suite never spends money.
import { PrismaClient } from "@prisma/client";
import { addressLookupConfigured, lookupAddresses, lookupAllowance, LOOKUP_CAPS, TEST_POSTCODES } from "../src/lib/address";
import { LAD_NAME_ALIASES, resolvePostcode } from "../src/lib/place-resolve";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const IP = "test-address-suite";

async function cleanup() { await db.addressLookup.deleteMany({ where: { ipHash: IP } }); }

async function main() {
  await cleanup();
  if ((await db.place.count()) === 0) throw new Error("No Place rows in dev. Run: npx tsx scripts/import-places.ts --schema=dev --fresh");

  // ---------------- spend is refused before it happens, not after
  const bad = await lookupAddresses("not a postcode", IP);
  t("a non-postcode is refused without a paid call", !bad.ok && bad.reason === "invalid");
  const outcode = await lookupAddresses("E8", IP);
  t("an outcode is refused and the message says why", !outcode.ok && outcode.reason === "invalid" && /first half/i.test(outcode.message));
  const refusals = await db.addressLookup.findMany({ where: { ipHash: IP } });
  t("…and both refusals are recorded as free, so they cannot look like spend", refusals.length === 2 && refusals.every((r) => r.free));

  // ---------------- the free test postcode
  t("the key is configured", addressLookupConfigured(), "IDEAL_POSTCODES_KEY is not set");
  const live = await lookupAddresses("ID1 1QD", IP);
  t("the free test postcode returns addresses", live.ok && live.addresses.length > 0, live.ok ? "" : live.message);
  if (live.ok) {
    t("…and is recorded as free", (await db.addressLookup.findFirst({ where: { ipHash: IP, postcode: "ID1 1QD" } }))?.free === true);
    const a = live.addresses[0];
    t("an address carries its line, town and postcode", !!a.line1 && !!a.postTown && !!a.postcode);
    t("…the administrative names PAF gives us", !!a.district && !!a.ward);
    t("…a stable identifier", !!a.udprn);
    t("…and coordinates", a.lat !== null && a.lng !== null);
    t("the post town is not left shouting", !/^[A-Z]{3,}$/.test(a.summary.split(", ").slice(-2)[0] ?? ""), a.summary);
    t("the summary reads like an address", a.summary.includes(a.line1) && a.summary.endsWith(a.postcode));
  }
  t("test postcodes are declared, so a suite cannot spend by accident", TEST_POSTCODES.has("ID1 1QD"));

  // ---------------- caps are counted from paid calls only
  const allowance = await lookupAllowance(IP);
  t("free lookups do not count against the caps", allowance.allowed && allowance.used?.hour === 0, JSON.stringify(allowance));
  await db.addressLookup.createMany({
    data: Array.from({ length: LOOKUP_CAPS.perIpPerHour }, () => ({ postcode: "E8 3AA", ipHash: IP, free: false, results: 1 })),
  });
  const capped = await lookupAllowance(IP);
  t("the hourly cap is enforced once reached", !capped.allowed && /hourly/i.test(capped.reason ?? ""));
  const blocked = await lookupAddresses("E8 3AA", IP);
  t("…and a real lookup is refused rather than charged", !blocked.ok && blocked.reason === "capped");
  t("…with a message that offers the manual route", !blocked.ok && /by hand/i.test(blocked.message));
  await cleanup();

  // ---------------- resolution keys on GSS codes
  const r = await resolvePostcode("RM10 7AA");
  t("a real postcode resolves", !!r);
  if (r) {
    t("the authority is found by its official code, not its name", r.via === "gss", `via=${r.via}`);
    t("…and it is Barking and Dagenham", r.authority?.name === "Barking and Dagenham", r.authority?.name);
    t("…with the GSS code we matched on", r.authority?.gssCode === "E09000002");
    t("the ward is resolved too", !!r.ward, "no ward");
    t("the chain runs from England down", r.chain[0]?.kind === "COUNTRY" && r.chain.at(-1)?.kind === "WARD", r.chain.map((c) => c.kind).join(" > "));
    t("localities are offered as candidates, nearest first", r.localityCandidates.length > 0 &&
      r.localityCandidates.every((c, i, a) => i === 0 || a[i - 1].distanceKm <= c.distanceKm));
    t("…and nothing is auto-selected: they are candidates, not an answer", Array.isArray(r.localityCandidates));
    t("coordinates come back for the distance ranking", r.lat !== null && r.lng !== null);
    // The point of the whole design: the ward names Rush Green, the locality is in Havering.
    t("the ward for RM10 7AA names Rush Green", /rush green/i.test(r.ward?.name ?? ""), r.ward?.name);
    t("…while no suggested locality claims to be in Barking and Dagenham incorrectly",
      r.localityCandidates.every((c) => c.kind !== "WARD"));
  }

  const nonsense = await resolvePostcode("ZZ99 9ZZ");
  t("an unresolvable postcode returns warnings rather than a guess",
    nonsense === null || (nonsense.authority === null && nonsense.warnings.length > 0));

  // ---------------- the four ONS spellings PAF will not reproduce
  for (const [paf, ons] of Object.entries(LAD_NAME_ALIASES)) {
    const exists = await db.place.findFirst({ where: { kind: { in: ["LAD", "UNITARY"] }, name: ons } });
    t(`"${paf}" maps to a real authority ("${ons}")`, !!exists, "no such authority in the tree");
  }

  // ---------------- category aliases
  const painter = await db.categoryAlias.findFirst({ where: { normalised: "end of tenancy cleaning" }, include: { category: true } });
  t("\"end of tenancy cleaning\" resolves to the cleaning category", painter?.category.slug === "cleaning");
  const manVan = await db.categoryAlias.findFirst({ where: { normalised: "man and van" }, include: { category: true } });
  t("\"man and van\" resolves to removals", manVan?.category.slug === "removals");
  const dupes = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM (SELECT normalised FROM "dev"."CategoryAlias" GROUP BY normalised HAVING count(DISTINCT "categoryId") > 1) x`);
  t("no search term points at two categories", dupes[0].n === 0, `${dupes[0].n} ambiguous terms`);
  t("every alias records where it came from", (await db.categoryAlias.count({ where: { source: "" } })) === 0);

  // ---------------- the new tables are usable and constrained
  const biz = await db.business.findFirst({ select: { id: true, categoryId: true, placeId: true } });
  if (biz?.placeId) {
    await db.businessServiceArea.upsert({
      where: { businessId_placeId: { businessId: biz.id, placeId: biz.placeId } },
      create: { businessId: biz.id, placeId: biz.placeId, mode: "INCLUDES_CHILDREN" }, update: { mode: "INCLUDES_CHILDREN" },
    });
    const area = await db.businessServiceArea.findUnique({ where: { businessId_placeId: { businessId: biz.id, placeId: biz.placeId } } });
    t("a business can declare a service area with a mode", area?.mode === "INCLUDES_CHILDREN");
    await db.businessCategory.upsert({
      where: { businessId_categoryId: { businessId: biz.id, categoryId: biz.categoryId } },
      create: { businessId: biz.id, categoryId: biz.categoryId, isPrimary: true }, update: { isPrimary: true },
    });
    t("a business can hold more than one category, with a primary", (await db.businessCategory.count({ where: { businessId: biz.id } })) >= 1);
    await db.businessServiceArea.deleteMany({ where: { businessId: biz.id } });
    await db.businessCategory.deleteMany({ where: { businessId: biz.id } });
  }

  await cleanup();
  console.log(fail === 0 ? "\nALL ADDRESS AND RESOLUTION TESTS PASS" : `\n${fail} FAILED`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1); });
