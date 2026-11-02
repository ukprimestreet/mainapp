/**
 * Editorial intros for the 33 London boroughs.
 *
 * Decision D7 took supply out of the indexing gate: a page no longer waits on us having businesses in an
 * area. What it still needs is **substance**, and this is the substance for area pages. Before this script
 * every single Location row in the database had an empty intro, which meant that after D7 not one area page
 * was indexable — the gate had been opened and there was nothing to walk through it with.
 *
 * Rules, the same four the trade intros were written to:
 *
 *   1. **No invented numbers.** No populations, no house prices, no "most homes here are X per cent".
 *      Nothing a reader could budget or argue against that I cannot stand behind.
 *   2. **Only checkable facts.** What the building stock is, and what that means legally: conservation
 *      areas and listed buildings, leasehold consent, party wall agreements, skip licences, controlled
 *      parking, tree preservation orders, Building Regulations. A reader can verify every one of these
 *      with their own council.
 *   3. **Written for somebody about to hire a trade here**, not for a crawler. Each one answers "what is
 *      different about getting work done in this borough?" — a real question with a real answer, and the
 *      only honest reason for an area page to exist at all.
 *   4. **Nothing claimed about our own supply.** Not one of these says we have businesses in the borough,
 *      or that we cover it.
 *
 * Deliberately NOT here: the 50 neighbourhood rows. See decision D8 — a neighbourhood page has to say a
 * neighbourhood-sized amount of true things, and until somebody writes that, the borough page is the
 * honest home for the area. Generating 50 variations on "X is an area of Y" is the thin content the brief
 * forbids, and doing it would undo the point of D7 rather than serve it.
 *
 * Idempotent: matches by city slug + location slug, and leaves a location that already has a usable intro
 * alone unless --force.
 */
import { PrismaClient } from "@prisma/client";

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
if (arg !== "dev" && arg !== "public") throw new Error("Unknown schema: " + arg);
const force = process.argv.includes("--force");
const db = new PrismaClient({
  datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${arg}`) } },
});

const CITY = "london";

/** borough slug -> intro. Plain prose; the page renders it as a paragraph under "About <name>". */
const INTROS: Record<string, string> = {
  "barking-and-dagenham":
    "Much of Barking and Dagenham is the Becontree estate, built by the London County Council between the " +
    "wars: street after street of near-identical two and three bedroom houses, most of them sold into " +
    "private hands since. For a trade that is unusually good news, because the layouts, the roof pitches " +
    "and the original wiring runs repeat, and somebody who has worked on one has effectively worked on " +
    "yours. The newer flats along the river at Barking Riverside are the opposite case: leasehold, so " +
    "anything structural or anything touching a communal service needs the freeholder's written consent " +
    "before a quote is worth having. A skip on the public road needs a licence from the council either way.",
  barnet:
    "Barnet is one of the largest London boroughs and most of it is suburban: interwar semi-detached houses " +
    "with side access and gardens, which keeps the cost of extensions, re-roofing and garden work lower " +
    "than in the inner boroughs simply because materials and waste can be carried round the side instead " +
    "of through the house. The exception is worth knowing before you commission anything. Hampstead Garden " +
    "Suburb is a conservation area with its own long-standing controls over windows, doors, roofing " +
    "materials, hedges and fences, and work that would be permitted development elsewhere needs consent " +
    "there. Check whether your address is inside it before a quote assumes otherwise.",
  bexley:
    "Bexley is suburban south-east London: interwar and post-war semis and bungalows on generous plots, " +
    "with driveways and side access almost everywhere. That shapes the trades people call most — " +
    "driveways, fencing, garden work, loft and rear extensions — and it usually means a van can park on " +
    "the property rather than hunting for a bay, which takes a real cost out of a day rate. Closer to the " +
    "Thames at Erith and Thamesmead the ground is low-lying, so anything involving drainage, a basement or " +
    "a new ground-floor level is worth checking against the Environment Agency flood map before you design " +
    "it rather than after.",
  brent:
    "Brent splits neatly in two for anyone hiring a trade. Kilburn, Willesden and Queen's Park are " +
    "Victorian and Edwardian terraces, many of them long since converted into flats, where the work is " +
    "sash windows, damp, re-roofing and the sort of plumbing that runs through somebody else's ceiling — " +
    "and where a leaseholder needs the freeholder's consent and often the neighbour's goodwill. Kingsbury, " +
    "Wembley and Preston Road are interwar semis with side access and the simpler job of the two. Around " +
    "the stadium the new residential towers are a third case again, with building management rules about " +
    "working hours, lifts and deliveries that a quote should account for.",
  bromley:
    "Bromley is the largest London borough by area and one of the greenest, which has a practical " +
    "consequence most people meet the hard way: many of its mature trees are protected by tree " +
    "preservation orders or sit in conservation areas, and cutting, pruning or felling one without consent " +
    "is an offence rather than a paperwork slip. Get that checked before you book a tree surgeon or design " +
    "an extension that needs a root zone disturbed. Otherwise the stock is forgiving — Victorian villas " +
    "and interwar semis on real plots, with room to park, store materials and get waste out without " +
    "carrying it through a hallway.",
  camden:
    "Camden is one of the hardest boroughs in the country to do building work in, and it is better to know " +
    "that before the first quote than after. Georgian and Victorian terraces, an unusually high proportion " +
    "of the borough inside conservation areas, and a great many listed buildings mean that replacing " +
    "windows, altering a roofline, adding rooflights or changing a front door can need consent that a " +
    "quote from outside the borough will not have allowed for. Basement work in particular is tightly " +
    "controlled here. Streets are narrow and almost entirely controlled parking, so skip licences, bay " +
    "suspensions and trade parking are genuine line items rather than afterthoughts.",
  "city-of-london":
    "The City is almost entirely commercial, and the handful of residential addresses — the Barbican and " +
    "the streets around it — behave like commercial ones for anybody doing work. Access is the whole job: " +
    "buildings are managed, vehicles need booking in, materials go up in a goods lift on somebody else's " +
    "timetable, and noisy work is usually restricted to agreed hours. The Barbican estate has its own " +
    "listed status and its own rules about what can be changed and what cannot. Expect a trade quoting " +
    "here to ask about building management and out-of-hours access before they ask about the work itself; " +
    "that is a good sign, not an evasion.",
  croydon:
    "Croydon covers two different kinds of job. The town centre is flats and towers, where work means " +
    "leasehold consent, lift bookings and restricted hours, and where a plumbing or electrical fault is " +
    "often not confined to one flat. South of it the borough is suburban — interwar semis, bungalows, " +
    "gardens and driveways — where a trade can park on the property and the usual run of extensions, " +
    "re-roofing, driveways and fencing applies. Parts of Croydon sit on clay, so if a quote for an " +
    "extension or for underpinning is silent about foundation depth and nearby trees, ask about both " +
    "before you accept it.",
  ealing:
    "Ealing is largely Victorian and Edwardian: bay-fronted terraces and villas with side returns, which " +
    "is why the ground-floor rear extension is the borough's defining job. Those houses also bring the " +
    "period work that goes with them — sash windows, lath and plaster, chimney stacks, original drainage. " +
    "Several parts of the borough are conservation areas, where front windows, doors, roofing materials " +
    "and front boundary walls are controlled, so the first question to ask any trade is whether their " +
    "price assumes permitted development. Paving over a front garden is its own rule: anything larger than " +
    "five square metres needs permeable surfacing or drainage, or planning permission.",
  enfield:
    "Enfield runs from dense Victorian terraces in Edmonton out to large interwar and post-war houses on " +
    "wide plots in the north, and the practical difference between the two is whether a van and a skip can " +
    "get onto the property. Where they can, extensions, driveways, re-roofing and garden work are " +
    "straightforward and the quote should reflect it; where they cannot, a road skip needs a licence from " +
    "the council and parking has to be budgeted for. The north of the borough reaches green belt land, " +
    "where what you may build is restricted well beyond the usual permitted development rules — worth " +
    "establishing before an architect is paid, never mind a builder.",
  greenwich:
    "Greenwich carries a World Heritage Site and one of the densest collections of listed buildings outside " +
    "central London, and the controls that come with that reach further than most people expect: not just " +
    "the famous buildings but whole streets of ordinary houses around them, where windows, roofs, railings " +
    "and front doors need consent. Away from the historic core the borough is Victorian terraces and " +
    "post-war estates, with substantial new-build flats on the Peninsula and at Woolwich where the " +
    "building manager's rules govern access, hours and deliveries. Establish which of those three your " +
    "address is before you treat a quote as comparable to anyone else's.",
  hackney:
    "Hackney is Victorian terraces and former council estates in close company, and a very large share of " +
    "the borough sits inside a conservation area — which catches a lot of people out, because the house " +
    "looks ordinary and the rules are not. Replacing windows, altering a roof, adding rooflights to a " +
    "front slope or changing a front boundary can all need permission here. Many of the terraces have been " +
    "split into flats, so a leaseholder needs the freeholder's written consent for structural work and for " +
    "anything touching shared pipework. Streets are narrow and controlled; a skip needs a council licence " +
    "and often a suspended bay to stand in.",
  "hammersmith-and-fulham":
    "Hammersmith and Fulham is dense Victorian terraced housing, a great deal of it converted into flats, " +
    "which makes consent the first question on almost any job rather than the last. Structural work, " +
    "anything cutting into a party wall, and anything touching shared drainage or a communal boiler needs " +
    "the freeholder's agreement, and work on a shared wall needs a party wall agreement with the " +
    "neighbour — a legal step with its own notice periods, not a courtesy. Parking is controlled nearly " +
    "everywhere, so a trade's day includes a permit or a meter. Near the river, check flood risk before " +
    "committing to anything below ground.",
  haringey:
    "Haringey is Victorian and Edwardian terraces almost throughout — the Harringay ladder streets, Crouch " +
    "End, Muswell Hill — with the familiar period jobs of sash windows, damp, slate roofs and chimney " +
    "stacks, and the familiar modern one of the rear and side-return extension. Several of those areas are " +
    "conservation areas, where front elevations, windows, roofing materials and front gardens are " +
    "controlled. The north of the borough is hilly and the terraces are tight, so access and parking are " +
    "real costs and a skip on the road needs a licence. Around Tottenham there is a lot of new building, " +
    "with the managed-block rules that go with it.",
  harrow:
    "Harrow is Metroland: interwar semi-detached houses with bay windows, side access, front and rear " +
    "gardens, built in large consistent runs. That consistency is useful — a roofer or an extension " +
    "builder who has done one street has effectively surveyed yours — and the side access keeps the cost " +
    "of getting materials in and waste out down. Harrow on the Hill is the exception, with listed " +
    "buildings and conservation controls that reach ordinary alterations like windows and roofs. Paving a " +
    "front garden for off-street parking is common here and has its own rule: over five square metres it " +
    "needs permeable surfacing or drainage, or planning permission.",
  havering:
    "Havering is outer east London and in places more or less Essex: interwar and post-war semis and " +
    "bungalows, wide plots, long gardens, driveways and garages. Practically that means the two things " +
    "that drive a London trade's price — parking and waste — are far cheaper here, because a van can stand " +
    "on the property and a skip can go on the drive without a council licence. It also means the work " +
    "skews towards driveways, fencing, landscaping, garage conversions and loft and rear extensions rather " +
    "than flat conversions. Much of the north and east of the borough is green belt, where what can be " +
    "built is restricted well beyond the ordinary rules.",
  hillingdon:
    "Hillingdon is outer west London: interwar suburban semis across most of it, older centres at Uxbridge " +
    "and Ruislip, and generous plots with driveways and side access. The jobs follow the stock — " +
    "extensions, loft conversions, driveways, fencing and garden work — and a van that can park on the " +
    "property takes a real cost out of a day rate. Parts of the borough are conservation areas with " +
    "controls over windows, doors and roofing materials, and the borough includes a good deal of green " +
    "belt where building is tightly restricted. If a quote for an extension assumes permitted development, " +
    "ask them to confirm it against your actual address first.",
  hounslow:
    "Hounslow holds two quite different kinds of property. Chiswick is Victorian and Edwardian terraces " +
    "with substantial conservation area coverage, where windows, front doors, roofing materials and front " +
    "boundary walls are controlled and the side-return extension is the characteristic job. West of there " +
    "the borough is mostly interwar semis with driveways and side access, where the same work is simpler " +
    "and cheaper to get materials to. A trade pricing in Chiswick and a trade pricing in Feltham are " +
    "solving different problems, so compare quotes from people who have worked on the kind of house you " +
    "actually own.",
  islington:
    "Islington is the hardest kind of London property to work on and the most rewarding to get right: " +
    "Georgian and Victorian terraces, a very high share of the borough in conservation areas, a great many " +
    "listed buildings, and streets so tight that parking and waste removal are planned before the work is. " +
    "Window replacement, roofline alterations, front doors and railings commonly need consent. Most houses " +
    "have been divided into flats, so leasehold consent and party wall agreements come before the first " +
    "fixing. Basement and lower-ground work is common here and heavily scrutinised — never take a basement " +
    "quote that has not mentioned the council.",
  "kensington-and-chelsea":
    "Kensington and Chelsea has one of the highest concentrations of listed buildings and conservation " +
    "areas in the country, and the controls are the point rather than the footnote. Stucco fronts, sash " +
    "windows, railings, roof slopes, front doors and even paint colours can be controlled, and listed " +
    "building consent is a legal requirement with criminal penalties for ignoring it — which is why a " +
    "quote here should name the consents it assumes. Mansion blocks add leasehold and managing agent " +
    "consent on top. Basement work is tightly restricted. Parking is controlled everywhere, so bay " +
    "suspensions and skip licences belong in the price from the start.",
  "kingston-upon-thames":
    "Kingston is Victorian and Edwardian terraces around the town centre giving way to interwar semis " +
    "further out, with conservation areas in the older parts controlling windows, doors, roofing materials " +
    "and front boundaries. The river is the thing to establish first: parts of the borough are in a flood " +
    "risk zone, and that changes what you can do with a basement, a new ground floor or a drainage run, " +
    "and sometimes what an insurer will accept afterwards. Check the Environment Agency flood map for your " +
    "address before you design anything below ground. Away from the river the usual suburban run of " +
    "extensions, roofing, driveways and garden work applies.",
  lambeth:
    "Lambeth is Victorian terraces in Clapham, Brixton, Herne Hill and Streatham, post-war estates between " +
    "them, and a great deal of flat conversion throughout — which makes the ownership question the first " +
    "one on any job. A leaseholder needs the freeholder's written consent for structural work and for " +
    "anything touching shared pipework or a communal boiler, and work on a shared wall needs a party wall " +
    "agreement with formal notice. Several areas are conservation areas, where windows, roofs and front " +
    "elevations are controlled. Streets are controlled parking almost throughout, so a skip needs a " +
    "licence and often a suspended bay.",
  lewisham:
    "Lewisham is Victorian and Edwardian terraces across most of the borough, with post-war estates and a " +
    "lot of recent building around Lewisham and Deptford. Blackheath, Brockley and Telegraph Hill have " +
    "well-established conservation areas, where windows, roofing materials, front doors and front boundary " +
    "walls are controlled and a quote that assumes permitted development will be wrong. The borough is " +
    "hilly and the older terraces are tight on access, so getting materials in and waste out is a real " +
    "part of the cost; a skip on the road needs a council licence. In the new blocks, the building " +
    "manager's rules on hours and lifts govern the schedule.",
  merton:
    "Merton runs from Victorian and Edwardian villas around Wimbledon to interwar semis in Morden and " +
    "Mitcham, and the two ends of the borough price quite differently. The older stock brings period work " +
    "— sash windows, slate roofs, chimney stacks, damp — along with conservation area controls in several " +
    "parts of Wimbledon, where windows, roofs and front boundaries are not yours to change freely. The " +
    "borough is well treed, so tree preservation orders are a genuine consideration before felling, " +
    "pruning or digging foundations near a mature tree. Further out, side access and driveways make the " +
    "same jobs cheaper to carry out.",
  newham:
    "Newham is two building stocks a generation apart. Forest Gate, Plaistow and East Ham are Victorian " +
    "terraces, where the work is re-roofing, damp, rewiring, loft conversions and rear extensions, and " +
    "where narrow streets and controlled parking make access part of the price. Stratford and the Royal " +
    "Docks are new-build flats, where the building is managed: consent from the freeholder or managing " +
    "agent, booked lifts, agreed working hours, and restrictions on what can be altered at all. Those are " +
    "different jobs needing different trades, so when you compare quotes make sure both have worked on " +
    "your kind of property.",
  redbridge:
    "Redbridge is mostly interwar semi-detached housing — Ilford, Gants Hill, Barkingside — with Victorian " +
    "and Edwardian stock around Wanstead and South Woodford. Side access and gardens are the norm, so " +
    "extensions, loft conversions, driveways, fencing and landscaping are the borough's standard work, and " +
    "a van that can park on the property keeps a day rate honest. Wanstead and Snaresbrook include " +
    "conservation areas with controls over windows, doors and roofing, and the borough has a lot of mature " +
    "trees, some protected by preservation orders. Check both before you commission anything that changes " +
    "a frontage or disturbs a root zone.",
  "richmond-upon-thames":
    "Richmond upon Thames is as tightly controlled as any borough in London, and for good reason: Georgian " +
    "and Victorian housing, extensive conservation areas, a lot of listed buildings and a great many " +
    "protected trees. Windows, roofs, front doors, railings, boundary walls and tree work can all need " +
    "consent, and a quote that assumes permitted development is a quote to question. The Thames matters " +
    "too — parts of the borough are in a flood risk zone, which affects basements, ground floors and " +
    "drainage and sometimes what an insurer will accept. Establish conservation status, listing and flood " +
    "zone for the address before any design work starts.",
  southwark:
    "Southwark holds Georgian streets in Bermondsey and Borough, Victorian terraces through Camberwell and " +
    "Peckham, very large post-war estates, and new towers around Elephant and Castle — four different jobs " +
    "under one council. The Georgian and Victorian areas carry conservation controls and listed buildings, " +
    "where windows, roofs and front elevations need consent. The flats, old and new, need the freeholder's " +
    "or managing agent's written permission for structural work and for anything touching shared services. " +
    "Parking is controlled across most of the borough, so skip licences and bay suspensions belong in the " +
    "quote rather than arriving later.",
  sutton:
    "Sutton is consistently suburban: interwar and post-war semis and bungalows, front and rear gardens, " +
    "driveways and side access almost throughout. That makes it one of the easier boroughs to get work " +
    "done in, because materials and waste do not have to go through the house and a skip can usually stand " +
    "on the drive without a council licence. The work follows the stock — extensions, loft and garage " +
    "conversions, re-roofing, driveways, fencing and garden work. Conservation areas exist in parts of " +
    "Carshalton and Beddington, and the borough is well treed, so check for a preservation order before " +
    "any tree is touched.",
  "tower-hamlets":
    "Tower Hamlets is overwhelmingly flats: Victorian terraces in Bow and Bethnal Green long since " +
    "converted, very large estates, and the Docklands and Canary Wharf towers. That makes written consent " +
    "the first step on almost any job — from the freeholder or managing agent for structural work, for " +
    "anything cutting into a party wall and for anything touching communal pipework, heating or " +
    "ventilation. Managed blocks also set working hours, lift bookings and delivery windows that a " +
    "realistic quote has to price in. Several of the older areas are conservation areas, where windows, " +
    "roofs and frontages are controlled as well.",
  "waltham-forest":
    "Waltham Forest is Victorian and Edwardian terraces almost throughout Walthamstow, Leyton and " +
    "Leytonstone, which makes the loft conversion and the rear or side-return extension the borough's " +
    "defining jobs, alongside the period work of sash windows, slate roofs and damp. Several areas are " +
    "conservation areas with controls over front windows, doors, roofing materials and front boundary " +
    "walls. The borough has extensive low-traffic and controlled-parking schemes, which genuinely affects " +
    "how a trade gets to you and where a van or a skip can stand — a local trade will know the route, and " +
    "a skip on the road needs a council licence.",
  wandsworth:
    "Wandsworth is Victorian terraces at scale — Battersea, the streets between the commons, Tooting and " +
    "Earlsfield — with the side-return extension and the loft conversion as the standard work and the " +
    "usual period jobs of sash windows, slate roofs, chimney stacks and damp underneath it. Conservation " +
    "areas cover a good deal of that stock, controlling windows, roofing materials and front elevations. " +
    "Many of those houses are now flats, so leasehold consent and a party wall agreement with the " +
    "neighbour come before the first fixing. Nine Elms is the other Wandsworth: new managed blocks with " +
    "their own rules on access and hours.",
  westminster:
    "Westminster is the most tightly controlled place in the country to alter a building. Stucco terraces, " +
    "mansion blocks and Georgian streets sit inside extensive conservation areas with a very large number " +
    "of listed buildings, and windows, doors, railings, roof slopes, shopfronts and external paint can all " +
    "need consent — listed building consent being a legal requirement, not a formality. Mansion blocks add " +
    "the managing agent's permission and their rules on hours, lifts and deliveries. Kerbside parking is " +
    "controlled throughout, so bay suspensions and skip licences are a real cost, and noisy work is " +
    "restricted to agreed hours.",
};

async function main() {
  const city = await db.city.findUnique({ where: { slug: CITY }, select: { id: true, name: true } });
  if (!city) { console.log(`${arg}: no city "${CITY}" — nothing to do.`); await db.$disconnect(); return; }

  const slugs = Object.keys(INTROS);
  const existing = await db.location.findMany({ where: { cityId: city.id, slug: { in: slugs } }, select: { id: true, slug: true, intro: true } });
  const bySlug = new Map(existing.map((l) => [l.slug, l]));

  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length) console.log(`${arg}: not present, skipped — ${missing.join(", ")}`);

  let written = 0, kept = 0;
  for (const slug of slugs) {
    const loc = bySlug.get(slug);
    if (!loc) continue;
    if (loc.intro && loc.intro.trim().length >= 100 && !force) { kept++; continue; }
    await db.location.update({ where: { id: loc.id }, data: { intro: INTROS[slug] } });
    written++;
  }

  const lengths = Object.entries(INTROS).map(([slug, text]) => ({ slug, chars: text.length }));
  const shortest = lengths.reduce((a, b) => (a.chars <= b.chars ? a : b));
  console.log(`\n${arg}: ${written} intro(s) written, ${kept} left alone (already had one).`);
  console.log(`shortest is ${shortest.slug} at ${shortest.chars} characters; the gate needs 100.`);

  const blankBoroughs = await db.location.count({ where: { cityId: city.id, kind: "BOROUGH", OR: [{ intro: null }, { intro: "" }] } });
  const blankHoods = await db.location.count({ where: { cityId: city.id, kind: { not: "BOROUGH" }, OR: [{ intro: null }, { intro: "" }] } });
  console.log(`${blankBoroughs} borough(s) still have no intro; ${blankHoods} neighbourhood(s) have none by design (decision D8).`);
  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
