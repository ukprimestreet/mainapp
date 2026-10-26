/**
 * Seeds the words customers actually use onto our canonical categories.
 *
 * Why this exists: a lead for a "painter" must reach a painting and decorating business, not the nearest
 * business of any kind. Without this, matching either misses the trade or widens until it is useless.
 *
 * These are ordinary English synonyms for trades, written here deliberately and marked `source = MANUAL`.
 * They are not search-volume claims and they are not invented places — an alias only ever points at a
 * category that already exists in our taxonomy, and the script reports any that do not match so the list
 * cannot silently rot as the taxonomy changes.
 *
 * Idempotent. Default target `dev`; production needs --schema=public.
 */
import { PrismaClient } from "@prisma/client";

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
if (arg !== "dev" && arg !== "public") throw new Error("Unknown schema: " + arg);
const db = new PrismaClient({
  datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${arg}`) } },
});

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** category slug -> the words people use for it */
const ALIASES: Record<string, string[]> = {
  cleaning: [
    "cleaner", "cleaners", "house cleaning", "domestic cleaning", "domestic cleaner", "home cleaning",
    "deep clean", "deep cleaning", "end of tenancy", "end of tenancy cleaning", "move out cleaning",
    "office cleaning", "commercial cleaning", "after builders clean", "spring clean", "housekeeper",
    "oven cleaning", "carpet cleaning", "window cleaner", "window cleaning",
  ],
  removals: [
    "removal", "removals company", "house removals", "house move", "moving company", "movers",
    "man and van", "man with a van", "van and man", "furniture removal", "office removals",
    "house clearance", "packing service", "storage and removals",
  ],
};

/** Trades we expect to need but which have no category yet. Reported, never created silently. */
const EXPECTED_TRADES = [
  "plumbing", "electrical", "painting-and-decorating", "gardening", "roofing", "locksmith",
  "handyman", "heating-and-boilers", "building", "landscaping", "plastering", "tiling",
  "carpentry", "pest-control", "rubbish-removal", "fencing", "driveways", "flooring",
];

async function main() {
  const categories = await db.category.findMany({ select: { id: true, slug: true, name: true } });
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  console.log(`categories in ${arg}: ${categories.length} — ${categories.map((c) => c.slug).join(", ")}`);

  let added = 0, skipped = 0;
  const missing: string[] = [];

  for (const [slug, aliases] of Object.entries(ALIASES)) {
    const cat = bySlug.get(slug);
    if (!cat) { missing.push(slug); continue; }
    for (const alias of aliases) {
      const res = await db.categoryAlias.createMany({
        data: [{ categoryId: cat.id, alias, normalised: norm(alias), source: "MANUAL" }],
        skipDuplicates: true,
      });
      if (res.count) added++; else skipped++;
    }
    // The category's own name and slug should match too, so a search for the canonical term works.
    for (const own of [cat.name, cat.slug.replace(/-/g, " ")]) {
      const res = await db.categoryAlias.createMany({
        data: [{ categoryId: cat.id, alias: own, normalised: norm(own), source: "CANONICAL" }],
        skipDuplicates: true,
      });
      if (res.count) added++; else skipped++;
    }
  }

  console.log(`aliases: ${added} added, ${skipped} already present`);
  if (missing.length) console.log(`  aliases written for no existing category (NOT created): ${missing.join(", ")}`);

  const absent = EXPECTED_TRADES.filter((t) => !bySlug.has(t));
  if (absent.length) {
    console.log(`\nTrades the lead system will need, with no category yet (${absent.length}):`);
    console.log(`  ${absent.join(", ")}`);
    console.log("  Not created here: a category is an editorial decision about what the directory covers,");
    console.log("  and it affects live URLs. Add them deliberately, then re-run this.");
  }

  // One honest check: can every alias be resolved back to exactly one category?
  const all = await db.categoryAlias.findMany({ select: { normalised: true, categoryId: true } });
  const byNorm = new Map<string, Set<string>>();
  for (const a of all) {
    if (!byNorm.has(a.normalised)) byNorm.set(a.normalised, new Set());
    byNorm.get(a.normalised)!.add(a.categoryId);
  }
  const ambiguous = [...byNorm.entries()].filter(([, v]) => v.size > 1);
  console.log(`\n${byNorm.size} distinct search terms mapped; ${ambiguous.length} point at more than one category${ambiguous.length ? " — these must be resolved by asking the customer, never guessed" : ""}`);
  for (const [term] of ambiguous.slice(0, 10)) console.log(`  ambiguous: ${term}`);

  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
