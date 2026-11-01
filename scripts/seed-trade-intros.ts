/**
 * Editorial intros for the 18 trade categories.
 *
 * These exist because of decision D7: every page we build has to be worth finding, and a category page with
 * nothing on it is not. Under the rewritten gate a page earns the index with original copy **or** a
 * substantial listing — this is the copy half, and it is the blocker I named in four batch reports before
 * finally being asked to clear it.
 *
 * Rules I held myself to while writing them, because "SEO copy" is where this project would most easily
 * start lying:
 *
 *   1. **No invented numbers.** No prices, no "average cost", no "most jobs take 2 days". I do not have
 *      verified figures for London trades, and a plausible number is worse than no number: somebody budgets
 *      against it.
 *   2. **Only checkable facts.** Gas Safe, Part P, waste carrier registration, Building Regulations
 *      notification — these are real legal requirements a reader can verify, and they are the single most
 *      useful thing we can tell somebody hiring a trade.
 *   3. **Written for the customer, not the crawler.** Each one answers "what am I actually hiring, and what
 *      should I check before I pay anybody?". No keyword stuffing, no "best X in London".
 *   4. **Nothing claimed about our own supply.** Not one of these says we have businesses in any area.
 *
 * Idempotent: updates by slug, and leaves a category that already has an intro alone unless --force.
 */
import { PrismaClient } from "@prisma/client";

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
if (arg !== "dev" && arg !== "public") throw new Error("Unknown schema: " + arg);
const force = process.argv.includes("--force");
const db = new PrismaClient({
  datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${arg}`) } },
});

/** slug → intro. Plain prose; the page renders it as a paragraph. */
const INTROS: Record<string, string> = {
  plumbing:
    "Plumbing covers everything that carries water around a building: taps, toilets, showers, pipework, " +
    "blocked drains and leaks. Some of it is an emergency — a burst pipe or a leak coming through a ceiling " +
    "needs somebody the same day — and some of it can wait for a proper quote. Any work on gas appliances, " +
    "including a boiler, must be done by an engineer on the Gas Safe Register; that is a legal requirement " +
    "and you can check a registration number on the Gas Safe website before anyone starts. For anything " +
    "beyond a small repair, get the price in writing, ask whether it includes parts, and ask what happens " +
    "if the problem turns out to be bigger once the floor is up — that is the question that decides most " +
    "disputes.",
  electrical:
    "Electricians install and repair the wiring, sockets, lighting and fuse boards in a building. In " +
    "England, most fixed electrical work in a home is notifiable under Part P of the Building Regulations, " +
    "which means it either has to be signed off by a registered competent person or notified to the local " +
    "authority. Registration schemes include NICEIC, NAPIT and ELECSA, and a registered electrician can " +
    "self-certify their own work and issue the certificate. Landlords in England must have an Electrical " +
    "Installation Condition Report carried out at least every five years and give a copy to tenants. Ask " +
    "which scheme an electrician belongs to, and make sure the certificate is part of the price rather than " +
    "an extra at the end.",
  "heating-and-boilers":
    "Heating engineers fit, service and repair boilers, radiators and central heating systems. Gas work is " +
    "the clearest rule in any trade: by law it must be carried out by an engineer registered with the Gas " +
    "Safe Register, who carries an ID card with a licence number you can check online, and the card lists " +
    "which types of work they are qualified for. A new boiler normally has to be notified to Building " +
    "Control, which a registered installer does for you, and the manufacturer's warranty usually depends on " +
    "both the registration and an annual service. If a boiler has stopped in winter, ask about a temporary " +
    "fix as well as a replacement — the two answers often come from different engineers.",
  roofing:
    "Roofers repair and replace roofs, flat roofs, guttering and chimneys. Most of the work people need is " +
    "unplanned: a leak, a slipped tile or storm damage, usually noticed from inside. Before agreeing to " +
    "anything, ask for photographs of the actual problem — a reputable roofer will have taken them — because " +
    "a roof is the one part of a house a customer cannot inspect. Scaffolding is often a separate cost and " +
    "should be in the quote rather than added later, and work on a shared or party wall may need the " +
    "neighbour's agreement. Be wary of anybody who knocks on the door offering to fix a roof they say they " +
    "spotted from the street.",
  locksmith:
    "Locksmiths change, repair and open locks, including getting people back into a home they are locked " +
    "out of and making a door secure again after a break-in. Locksmithing is not a licensed trade in the " +
    "UK, which makes checking more important rather than less: ask whether they are inspected by the Master " +
    "Locksmiths Association, and agree a price on the phone before anyone travels. Insurance policies " +
    "often require locks that meet BS3621 on final exit doors, so if a lock is being replaced after a " +
    "burglary it is worth saying so and asking for one that meets the standard. Keep the receipt; insurers " +
    "ask for it.",
  building:
    "Builders take on the work that changes the structure of a building: extensions, loft conversions, " +
    "knocking rooms together, structural repairs and full renovations. Almost all of it is subject to " +
    "Building Regulations, and much of it needs either planning permission or confirmation that it falls " +
    "under permitted development — a builder should be able to say which applies, but the responsibility " +
    "sits with the owner. Work affecting a shared wall usually needs a party wall agreement with the " +
    "neighbour, arranged before work starts. For anything of this size, get a written specification, agree " +
    "a payment schedule tied to stages rather than dates, and never pay the whole amount up front.",
  "painting-and-decorating":
    "Painters and decorators prepare and finish walls, ceilings, woodwork and exteriors, and hang wallpaper. " +
    "Most of the quality is in the preparation — filling, sanding, priming — which is also the part that is " +
    "easiest to skip and hardest to see until the paint fails, so a quote worth having says what " +
    "preparation is included. Check whether paint is in the price and how many coats are quoted. Work on " +
    "the outside of a building depends on weather and may need scaffolding or a tower, and homes built " +
    "before 1980 can contain lead paint, which has its own rules about sanding and removal.",
  plastering:
    "Plasterers skim and repair walls and ceilings, patch damage, fit plasterboard and render outside " +
    "walls. New plaster needs to dry before it can be painted — days rather than hours, longer in winter " +
    "and longer still on a thick patch — so it is worth agreeing when the decorator follows, and a " +
    "plasterer who tells you to wait is giving you good advice rather than being slow. Ask whether the " +
    "price includes moving furniture, protecting floors and taking the waste away, because old plaster is " +
    "heavy and a skip may be needed. Damp coming through a wall will ruin new plaster, so the cause has to " +
    "be fixed first.",
  carpentry:
    "Carpenters and joiners work with wood: doors, skirting, architrave, stud walls, floors, staircases, " +
    "fitted wardrobes and shelving. The trade splits roughly into first fix — the structural work done " +
    "before plastering — and second fix, the visible finishing afterwards, and knowing which you need makes " +
    "a quote far easier to compare. Made-to-measure work is usually quoted separately from fitting, and the " +
    "price depends heavily on the material, so ask what timber or board is being used. For anything that " +
    "affects fire doors or a staircase, Building Regulations set requirements that a competent carpenter " +
    "will raise before you do.",
  tiling:
    "Tilers prepare surfaces and lay tiles on walls and floors, most often in bathrooms and kitchens. The " +
    "work that lasts is mostly underneath: a floor that does not flex, a wall that is flat, and the right " +
    "waterproofing behind a shower. Ask what preparation and tanking is included, because a tiler who has " +
    "to fix somebody else's substrate will either charge more later or tile over a problem. Tiles are " +
    "usually bought by the customer and almost always need more than the exact area to allow for cuts and " +
    "breakages. Grout and silicone are consumables that need replacing long before the tiles do.",
  "bathroom-fitting":
    "Bathroom fitters install baths, showers, basins, toilets and the plumbing and tiling around them, " +
    "either as a single trade or by managing a plumber, tiler and electrician between them. Ask which it " +
    "is, because a bathroom involves work that legally has to be certified: electrical work is notifiable " +
    "under Part P in England, and anything touching a gas boiler needs a Gas Safe engineer. Wet rooms and " +
    "level-access showers depend entirely on the waterproofing underneath, which is the part nobody sees " +
    "and the part that fails. Agree who buys the suite, and expect the price to change if pipework has to " +
    "move.",
  "kitchen-fitting":
    "Kitchen fitters install units, worktops and appliances, and coordinate the plumbing, electrics and " +
    "sometimes gas that a kitchen needs. Most kitchens are bought from a supplier and fitted by somebody " +
    "else, so be clear about who is responsible if a unit is missing or damaged — that is where kitchen " +
    "projects go wrong. Electrical work is notifiable under Part P in England, and a gas hob must be " +
    "connected by a Gas Safe registered engineer. Worktops in stone or quartz are usually templated after " +
    "the units are in, which adds a gap of several days where there is no work surface at all; a fitter who " +
    "warns you about that is one who has done it before.",
  gardening:
    "Gardeners maintain gardens: mowing, hedges, weeding, pruning, clearing and general tidying, as one-off " +
    "jobs or on a regular visit. Green waste has to be disposed of legally, and anyone taking it away must " +
    "be a registered waste carrier — you can check a licence on the Environment Agency's public register, " +
    "and you are responsible for where your waste ends up. Hedge cutting between March and August risks " +
    "disturbing nesting birds, which are protected by law, so good gardeners will raise timing before you " +
    "do. Trees may be protected by a Tree Preservation Order or by being in a conservation area, which the " +
    "council can confirm.",
  landscaping:
    "Landscapers change the shape of a garden rather than maintaining it: design, turfing, planting, " +
    "decking, raised beds, steps and drainage. The work most likely to be skipped is the groundwork — " +
    "levels, drainage and foundations — and it is the reason a patio sinks or a lawn drowns, so a quote " +
    "that details what happens below ground is worth more than one listing plants. Paving a front garden " +
    "with something that does not drain can need planning permission, and structures over certain heights " +
    "have their own rules. Ask what happens to the spoil: a garden project generates a surprising amount of " +
    "material that has to be carried out and disposed of legally.",
  "driveways-and-patios":
    "This covers laying and repairing driveways, paths and patios in block paving, slabs, resin, concrete " +
    "or tarmac. Drainage decides both how long it lasts and whether it is legal: in England, paving over a " +
    "front garden with an impermeable surface of more than five square metres needs planning permission " +
    "unless the water drains to a border or a soakaway, which is why permeable surfaces are so common. " +
    "Dropping a kerb to drive across a pavement needs the council's consent and is a separate job. Ask what " +
    "depth of sub-base is quoted — it is the part under everything, and the part a cheap quote leaves out.",
  fencing:
    "Fencers install and repair fences, gates, posts and trellis. The first question is whose fence it is: " +
    "the boundary and the responsibility for it are set out in the deeds, and replacing a neighbour's fence " +
    "without asking is a common and avoidable argument. Height matters too — a fence over two metres, or " +
    "over one metre next to a road, usually needs planning permission. Posts are what fail first, so ask " +
    "whether they are concrete or timber and how they are set. If an old fence is being taken away, check " +
    "the quote includes removing it: treated timber cannot go in a household bin.",
  handyman:
    "A handyperson does the jobs that are too small for a specialist trade: flat-pack furniture, shelves, " +
    "curtain poles, door adjustments, filling and patching, mounting a television, small repairs. Usually " +
    "charged by the hour or the half-day, so the useful thing to do is list everything you need in one " +
    "visit rather than booking separately. The limits are worth knowing: gas work needs a Gas Safe " +
    "registered engineer, and fixed electrical work in England is notifiable under Part P — a good " +
    "handyperson will tell you when a job has crossed into a trade that needs a certificate, rather than " +
    "doing it anyway.",
  "rubbish-removal":
    "Rubbish removal and clearance covers house and garden clearances, single bulky items, builders' waste " +
    "and the contents of garages, flats and lofts. The rule that matters is the one most people do not know: " +
    "under the household waste duty of care you are responsible for making sure your waste is handed to " +
    "somebody authorised to take it, and if it is fly-tipped it can be traced back to you. Anyone collecting " +
    "waste must be a registered waste carrier, you can check the licence free on the Environment Agency's " +
    "public register, and you are entitled to ask where the waste is going. Fridges, mattresses, tyres and " +
    "paint have their own disposal rules and are often priced separately.",
};

async function main() {
  const slugs = Object.keys(INTROS);
  const existing = await db.category.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true, name: true, intro: true } });
  const bySlug = new Map(existing.map((c) => [c.slug, c]));

  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length) console.log(`${arg}: not present, skipped — ${missing.join(", ")}`);

  let written = 0, kept = 0;
  for (const slug of slugs) {
    const cat = bySlug.get(slug);
    if (!cat) continue;
    if (cat.intro && cat.intro.trim().length >= 100 && !force) { kept++; continue; }
    await db.category.update({ where: { id: cat.id }, data: { intro: INTROS[slug] } });
    written++;
  }

  const lengths = Object.entries(INTROS).map(([slug, text]) => ({ slug, chars: text.length, words: text.split(/\s+/).length }));
  const shortest = lengths.reduce((a, b) => (a.chars <= b.chars ? a : b));
  console.log(`\n${arg}: ${written} intro(s) written, ${kept} left alone (already had one).`);
  console.log(`shortest is ${shortest.slug} at ${shortest.chars} characters / ${shortest.words} words; the gate needs 100.`);

  const stillBlank = await db.category.count({ where: { parentId: null, OR: [{ intro: null }, { intro: "" }] } });
  console.log(`${stillBlank} top-level categories still have no intro.`);
  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
