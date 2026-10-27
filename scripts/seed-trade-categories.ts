/**
 * Adds the trade categories the lead system needs.
 *
 * Why this exists: PrimeStreet's taxonomy was built for a directory of London businesses, so its 12
 * categories are **sectors** — restaurants, beauty, retail, technology. Only `cleaning` and `removals` are
 * trades a job lead can be routed to. Nothing can match a plumbing lead until `plumbing` exists.
 *
 * The names and scope come from the owner's own specification: the 50 categories in
 * `docs/UK_Local_Services_Lead_Generation_SEO_Master_Plan.docx` §3 and §SERVICE RESEARCH. These 18 are the
 * subset with no existing category. They are not my invention of what the directory should cover.
 *
 * **No intro text is written.** `src/lib/seo-engine.ts` refuses to index a category page without real
 * editorial copy, so each of these is browsable and usable for matching but **not indexable** until someone
 * writes something true about it. Generating 18 paragraphs of filler to make them indexable is precisely the
 * thin-content behaviour the brief forbids.
 *
 * Idempotent: upserts by slug. Default `dev`; production needs --schema=public.
 */
import { PrismaClient } from "@prisma/client";

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
if (arg !== "dev" && arg !== "public") throw new Error("Unknown schema: " + arg);
const db = new PrismaClient({
  datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${arg}`) } },
});

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** slug, display name, and the words customers actually use for it. */
const TRADES: [string, string, string[]][] = [
  ["plumbing", "Plumbing", ["plumber", "plumbers", "emergency plumber", "blocked drain", "leak", "leaking pipe", "burst pipe", "blocked toilet", "tap repair", "toilet repair", "radiator leak"]],
  ["electrical", "Electrical", ["electrician", "electricians", "emergency electrician", "fuse box", "consumer unit", "rewiring", "rewire", "socket", "light fitting", "fault finding", "eicr", "landlord electrical certificate"]],
  ["heating-and-boilers", "Heating and boilers", ["heating engineer", "boiler repair", "boiler service", "boiler installation", "new boiler", "gas engineer", "gas safe", "central heating", "no hot water", "radiator"]],
  ["roofing", "Roofing", ["roofer", "roofers", "roof repair", "roof leak", "leaking roof", "storm damage", "new roof", "flat roof", "guttering", "gutter repair", "chimney repair", "tile replacement"]],
  ["locksmith", "Locksmiths", ["locksmith", "locksmiths", "emergency locksmith", "locked out", "lock change", "lock repair", "uPVC door lock", "burglary repair"]],
  ["building", "Building work", ["builder", "builders", "building work", "extension", "loft conversion", "renovation", "structural work", "knock through", "building contractor"]],
  ["painting-and-decorating", "Painting and decorating", ["painter", "painters", "painter and decorator", "decorator", "decorating", "interior painting", "exterior painting", "wallpapering", "wallpaper hanging", "painting"]],
  ["plastering", "Plastering", ["plasterer", "plasterers", "plastering", "skimming", "re-skim", "plaster repair", "rendering", "render", "artexing", "ceiling repair"]],
  ["carpentry", "Carpentry and joinery", ["carpenter", "carpenters", "joiner", "joinery", "carpentry", "fitted wardrobe", "door hanging", "skirting", "stud wall", "shelving"]],
  ["tiling", "Tiling", ["tiler", "tilers", "tiling", "bathroom tiling", "kitchen tiling", "floor tiling", "re-grouting", "regrouting", "wall tiles"]],
  ["bathroom-fitting", "Bathroom fitting", ["bathroom fitter", "bathroom fitters", "bathroom installation", "new bathroom", "shower installation", "wet room", "bathroom refurbishment", "en suite"]],
  ["kitchen-fitting", "Kitchen fitting", ["kitchen fitter", "kitchen fitters", "kitchen installation", "new kitchen", "worktop", "worktops", "kitchen refurbishment", "kitchen units"]],
  ["gardening", "Gardening", ["gardener", "gardeners", "garden maintenance", "grass cutting", "lawn mowing", "hedge trimming", "hedge cutting", "weeding", "garden clearance", "pruning", "tree surgery"]],
  ["landscaping", "Landscaping", ["landscaper", "landscapers", "landscaping", "garden design", "garden redesign", "turfing", "new lawn", "planting", "raised beds", "decking"]],
  ["driveways-and-patios", "Driveways and patios", ["driveway", "driveways", "patio", "patios", "block paving", "resin driveway", "tarmac", "driveway repair", "paving", "slabbing"]],
  ["fencing", "Fencing and gates", ["fencing", "fencer", "fence", "fence panels", "fence repair", "garden fence", "gate", "gates", "gate installation", "trellis"]],
  ["handyman", "Handyman and property maintenance", ["handyman", "handyperson", "odd jobs", "flat pack assembly", "flatpack", "furniture assembly", "small repairs", "property maintenance", "picture hanging", "tv mounting"]],
  ["rubbish-removal", "Rubbish removal and clearance", ["rubbish removal", "waste removal", "house clearance", "garden waste", "bulky waste", "junk removal", "garage clearance", "flat clearance", "man and van rubbish"]],
];

async function main() {
  const before = await db.category.count();
  const existing = new Map((await db.category.findMany({ select: { id: true, slug: true, name: true } })).map((c) => [c.slug, c]));
  console.log(`${arg}: ${before} categories before — ${[...existing.keys()].join(", ")}`);

  let added = 0, present = 0, aliasesAdded = 0;
  const collisions: string[] = [];

  for (const [slug, name, aliases] of TRADES) {
    let cat = existing.get(slug);
    if (cat) {
      present++;
      if (cat.name !== name) collisions.push(`${slug} already exists as "${cat.name}"`);
    } else {
      // No intro: the SEO gate keeps it out of the index until real copy exists. That is deliberate.
      cat = await db.category.create({ data: { slug, name }, select: { id: true, slug: true, name: true } });
      added++;
    }

    for (const alias of [name, slug.replace(/-/g, " "), ...aliases]) {
      const r = await db.categoryAlias.createMany({
        data: [{ categoryId: cat.id, alias, normalised: norm(alias), source: alias === name || alias === slug.replace(/-/g, " ") ? "CANONICAL" : "MANUAL" }],
        skipDuplicates: true,
      });
      aliasesAdded += r.count;
    }
  }

  console.log(`\ncategories: ${added} added, ${present} already present`);
  console.log(`aliases:    ${aliasesAdded} added`);
  if (collisions.length) {
    console.log(`\nname differences worth a look (nothing was renamed):`);
    for (const c of collisions) console.log(`  ${c}`);
  }

  // Every alias must point at exactly one category, or matching has to ask the customer.
  const all = await db.categoryAlias.findMany({ select: { normalised: true, categoryId: true } });
  const byNorm = new Map<string, Set<string>>();
  for (const a of all) {
    if (!byNorm.has(a.normalised)) byNorm.set(a.normalised, new Set());
    byNorm.get(a.normalised)!.add(a.categoryId);
  }
  const ambiguous = [...byNorm.entries()].filter(([, v]) => v.size > 1);
  console.log(`\n${byNorm.size} distinct search terms mapped across ${await db.category.count()} categories`);
  if (ambiguous.length) {
    console.log(`${ambiguous.length} term(s) point at more than one category — matching must ask the customer, never guess:`);
    for (const [term] of ambiguous) console.log(`  ${term}`);
  } else {
    console.log("No term points at more than one category.");
  }

  const noIntro = await db.category.count({ where: { intro: null } });
  console.log(`\n${noIntro} categories have no intro, so they are usable for matching but NOT indexable.`);
  console.log("That is the SEO gate doing its job. Write real copy before expecting any of them to rank.");

  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
