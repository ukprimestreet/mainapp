/**
 * Seed script. ALL business/article/episode content here is FICTIONAL SAMPLE DATA
 * (isSample = true) so the platform can be developed and demoed without publishing
 * invented facts about real businesses. Replace with researched real entries via
 * the Phase 2 importer before public launch. Locations/categories are real structure.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

import { normName } from "../src/lib/business";
import { AREA_CENTROIDS } from "../src/lib/geo";
const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const BOROUGHS = [
  "Barking and Dagenham", "Barnet", "Bexley", "Brent", "Bromley", "Camden", "City of London", "Croydon",
  "Ealing", "Enfield", "Greenwich", "Hackney", "Hammersmith and Fulham", "Haringey", "Harrow", "Havering",
  "Hillingdon", "Hounslow", "Islington", "Kensington and Chelsea", "Kingston upon Thames", "Lambeth",
  "Lewisham", "Merton", "Newham", "Redbridge", "Richmond upon Thames", "Southwark", "Sutton",
  "Tower Hamlets", "Waltham Forest", "Wandsworth", "Westminster",
];

const CATEGORIES: [string, string][] = [
  ["Cleaning", "Domestic, commercial and specialist cleaning companies across London."],
  ["Removals", "Home and office removals, man-and-van and storage."],
  ["Logistics", "Couriers, freight and last-mile delivery businesses."],
  ["Restaurants", "Independent restaurants and local favourites."],
  ["Cafes", "Coffee shops, bakeries and brunch spots."],
  ["Beauty", "Salons, barbers, nails and wellness."],
  ["Gyms and Fitness", "Gyms, studios and personal training."],
  ["Property", "Estate agents, lettings and property services."],
  ["Construction", "Builders, contractors and trades."],
  ["Professional Services", "Accountants, solicitors and consultants."],
  ["Retail", "Independent shops and local retailers."],
  ["Technology", "London startups and software businesses."],
];

type B = {
  n: string; cat: string; loc: string; sum: string; desc: string; svc: string[]; year?: number;
  featured?: boolean; hours?: string;
};

// Greater London, with the outward-code prefixes we use to work out which city a visitor's postcode is in.
const LONDON = {
  intro:
    "London is nine million people and roughly a million businesses, from century-old markets to software firms three months old. " +
    "PrimeStreet covers it borough by borough: who is opening, who is hiring, who is closing, and who is quietly very good at what they do.",
  region: "Greater London",
  lat: 51.5072,
  lng: -0.1276,
  prefixes: ["E", "EC", "N", "NW", "SE", "SW", "W", "WC", "BR", "CR", "DA", "EN", "HA", "IG", "KT", "RM", "SM", "TW", "UB", "WD"],
};

// Real, well-known London neighbourhoods and the borough each sits in. Geography, not invented content:
// a neighbourhood page stays out of the index until an editor writes an original intro for it (see seo-engine).
const NEIGHBOURHOODS: [string, string][] = [
  ["Shoreditch", "Hackney"], ["Dalston", "Hackney"], ["Stoke Newington", "Hackney"], ["Hackney Wick", "Hackney"],
  ["Camden Town", "Camden"], ["Kentish Town", "Camden"], ["Bloomsbury", "Camden"], ["Hampstead", "Camden"],
  ["Soho", "Westminster"], ["Mayfair", "Westminster"], ["Marylebone", "Westminster"], ["Pimlico", "Westminster"],
  ["Brixton", "Lambeth"], ["Clapham", "Lambeth"], ["Streatham", "Lambeth"], ["Waterloo", "Lambeth"],
  ["Peckham", "Southwark"], ["Bermondsey", "Southwark"], ["Dulwich", "Southwark"], ["Borough", "Southwark"],
  ["Shepherd's Bush", "Hammersmith and Fulham"], ["Fulham", "Hammersmith and Fulham"],
  ["Notting Hill", "Kensington and Chelsea"], ["Chelsea", "Kensington and Chelsea"],
  ["Angel", "Islington"], ["Holloway", "Islington"], ["Finsbury Park", "Islington"],
  ["Canary Wharf", "Tower Hamlets"], ["Whitechapel", "Tower Hamlets"], ["Bethnal Green", "Tower Hamlets"], ["Bow", "Tower Hamlets"],
  ["Stratford", "Newham"], ["East Ham", "Newham"],
  ["Walthamstow", "Waltham Forest"], ["Leyton", "Waltham Forest"],
  ["Tooting", "Wandsworth"], ["Battersea", "Wandsworth"], ["Putney", "Wandsworth"],
  ["Crouch End", "Haringey"], ["Tottenham", "Haringey"], ["Wood Green", "Haringey"],
  ["Greenwich Town", "Greenwich"], ["Woolwich", "Greenwich"],
  ["Wimbledon", "Merton"], ["Ealing Broadway", "Ealing"], ["Acton", "Ealing"], ["Richmond Town", "Richmond upon Thames"],
  ["Croydon Town", "Croydon"], ["Bromley Town", "Bromley"], ["Barnet Town", "Barnet"],
];

const H = "09:00-17:30";
const BUSINESSES: B[] = [
  { n: "Brightwell Cleaning Co", cat: "Cleaning", loc: "Hackney", sum: "Office and home cleaning team serving East London.", desc: "A sample profile illustrating how a cleaning company would appear on PrimeStreet, with services, areas served and a claim prompt.", svc: ["Office cleaning", "End of tenancy", "Deep cleans"], year: 2016, featured: true },
  { n: "Lea Valley Maids", cat: "Cleaning", loc: "Waltham Forest", sum: "Domestic cleaning across North-East London.", desc: "Sample profile. Demonstrates a smaller domestic cleaning business entry.", svc: ["Regular cleaning", "Ironing", "Oven cleaning"] },
  { n: "Crown & Anchor Cleaners", cat: "Cleaning", loc: "Croydon", sum: "Commercial cleaning for South London offices.", desc: "Sample profile for a commercial cleaning firm.", svc: ["Commercial cleaning", "Window cleaning"] },
  { n: "Spotless Southwark", cat: "Cleaning", loc: "Southwark", sum: "Specialist after-builders cleaning.", desc: "Sample profile for a specialist cleaning service.", svc: ["After builders", "Carpet cleaning"] },
  { n: "Thames Haul Removals", cat: "Removals", loc: "Newham", sum: "Family-run removals and storage.", desc: "Sample profile showing a removals company with storage services.", svc: ["House removals", "Packing", "Storage"], year: 2011 },
  { n: "Northgate Movers", cat: "Removals", loc: "Barnet", sum: "Man-and-van and office moves.", desc: "Sample profile for a man-and-van operator.", svc: ["Man and van", "Office moves"] },
  { n: "Greenwich Van Lines", cat: "Removals", loc: "Greenwich", sum: "Local and long-distance moves from SE London.", desc: "Sample removals profile.", svc: ["Local moves", "Long distance"] },
  { n: "Metro Parcel Express", cat: "Logistics", loc: "Hillingdon", sum: "Same-day courier near Heathrow.", desc: "Sample logistics profile illustrating a courier business.", svc: ["Same-day courier", "Pallet delivery"] },
  { n: "Docklands Freight Partners", cat: "Logistics", loc: "Tower Hamlets", sum: "Freight forwarding for small importers.", desc: "Sample logistics profile.", svc: ["Freight forwarding", "Customs support"] },
  { n: "Orbital Last Mile", cat: "Logistics", loc: "Enfield", sum: "Last-mile delivery for London retailers.", desc: "Sample logistics profile.", svc: ["Last-mile delivery", "Returns"] },
  { n: "Kiln & Ember", cat: "Restaurants", loc: "Hackney", sum: "Wood-fired neighbourhood restaurant.", desc: "Sample restaurant profile illustrating menus, hours and reviews placement.", svc: ["Dinner", "Weekend lunch", "Private hire"], featured: true, year: 2020 },
  { n: "The Plantain House", cat: "Restaurants", loc: "Lewisham", sum: "Caribbean kitchen with a local following.", desc: "Sample restaurant profile.", svc: ["Dine in", "Takeaway"] },
  { n: "Saffron Lane", cat: "Restaurants", loc: "Brent", sum: "Family-run Indian restaurant.", desc: "Sample restaurant profile.", svc: ["Dine in", "Catering"] },
  { n: "Little Oak Bakery", cat: "Cafes", loc: "Camden", sum: "Sourdough, pastries and filter coffee.", desc: "Sample cafe profile.", svc: ["Bakery", "Coffee", "Wholesale"] },
  { n: "Common Ground Coffee", cat: "Cafes", loc: "Islington", sum: "Independent coffee roaster and cafe.", desc: "Sample cafe profile.", svc: ["Coffee", "Brunch", "Beans online"] },
  { n: "Bean There Brixton", cat: "Cafes", loc: "Lambeth", sum: "Community cafe and co-working corner.", desc: "Sample cafe profile.", svc: ["Coffee", "Co-working"] },
  { n: "Fade Theory Barbers", cat: "Beauty", loc: "Haringey", sum: "Precision barbering in Tottenham.", desc: "Sample barbershop profile.", svc: ["Cuts", "Beard trims"] },
  { n: "Studio Nine Nails", cat: "Beauty", loc: "Wandsworth", sum: "Nail studio and lash bar.", desc: "Sample beauty profile.", svc: ["Gel nails", "Lashes"] },
  { n: "Halo Hair & Beauty", cat: "Beauty", loc: "Ealing", sum: "Salon specialising in natural hair.", desc: "Sample salon profile.", svc: ["Cuts", "Colour", "Braids"] },
  { n: "Ironworks Gym", cat: "Gyms and Fitness", loc: "Greenwich", sum: "Strength-focused independent gym.", desc: "Sample gym profile.", svc: ["Memberships", "Personal training"], hours: "06:00-22:00" },
  { n: "Flow State Studio", cat: "Gyms and Fitness", loc: "Camden", sum: "Yoga and pilates studio.", desc: "Sample studio profile.", svc: ["Yoga", "Pilates"] },
  { n: "Hearth & Key Estates", cat: "Property", loc: "Islington", sum: "Independent lettings and sales.", desc: "Sample estate agent profile.", svc: ["Lettings", "Sales", "Property management"] },
  { n: "Southbank Lettings", cat: "Property", loc: "Lambeth", sum: "Lettings specialists for young professionals.", desc: "Sample lettings profile.", svc: ["Lettings", "Tenant find"] },
  { n: "Parkside Property Group", cat: "Property", loc: "Croydon", sum: "Sales and lettings in Croydon.", desc: "Sample property profile.", svc: ["Sales", "Lettings"] },
  { n: "Ridgeway Build & Renovate", cat: "Construction", loc: "Barnet", sum: "Extensions, lofts and refurbishments.", desc: "Sample construction profile.", svc: ["Extensions", "Loft conversions"] },
  { n: "Foundry Electrical", cat: "Construction", loc: "Newham", sum: "Domestic and commercial electricians.", desc: "Sample trades profile.", svc: ["Rewiring", "EV chargers"] },
  { n: "Copperline Plumbing & Heating", cat: "Construction", loc: "Bromley", sum: "Boilers, bathrooms and emergency plumbing.", desc: "Sample trades profile.", svc: ["Boilers", "Bathrooms"] },
  { n: "Ledger & Co Accountants", cat: "Professional Services", loc: "Westminster", sum: "Accounting for small London businesses.", desc: "Sample accountancy profile.", svc: ["Bookkeeping", "Tax", "Payroll"] },
  { n: "Harlow Marsh Solicitors", cat: "Professional Services", loc: "Southwark", sum: "Commercial and property law.", desc: "Sample solicitors profile.", svc: ["Commercial law", "Conveyancing"] },
  { n: "Penny Black Stationers", cat: "Retail", loc: "Islington", sum: "Independent stationery shop.", desc: "Sample retail profile.", svc: ["Stationery", "Gifts"] },
  { n: "Record Shop Peckham", cat: "Retail", loc: "Southwark", sum: "Vinyl and local music.", desc: "Sample retail profile.", svc: ["Vinyl", "Events"] },
  { n: "Thread & Needle Tailors", cat: "Retail", loc: "Kensington and Chelsea", sum: "Alterations and bespoke tailoring.", desc: "Sample retail profile.", svc: ["Alterations", "Bespoke"] },
  { n: "Lumen Labs", cat: "Technology", loc: "Tower Hamlets", sum: "Early-stage software studio.", desc: "Sample startup profile.", svc: ["Software", "Consulting"], year: 2022 },
  { n: "Parcelpath", cat: "Technology", loc: "Hackney", sum: "Delivery-tracking startup.", desc: "Sample startup profile.", svc: ["SaaS"], year: 2023 },
  { n: "Clearbook Studio", cat: "Technology", loc: "Camden", sum: "Design and web for local SMEs.", desc: "Sample startup profile.", svc: ["Web design", "Branding"] },
];

type A = {
  type: string; title: string; stand: string; body: string; loc?: string; biz?: string[]; feat?: boolean; days: number;
  disclosure?: string;
};
const SAMPLE_NOTE = "\n\n> This is sample content created to demonstrate the PrimeStreet editorial format. It is not a real report.";
const ARTICLES: A[] = [
  { type: "NEWS", title: "A wood-fired restaurant opens its doors on a Hackney side street", stand: "Sample news article showing the format for new openings.", body: "## What's opening\n\nSample paragraph describing an opening, who is behind it and why it matters to the area.\n\n## Why it matters\n\nNews pieces answer who, what, where and why-now in the first paragraphs." + SAMPLE_NOTE, loc: "Hackney", biz: ["Kiln & Ember"], feat: true, days: 1 },
  { type: "NEWS", title: "Removals firms on rising storage demand across East London", stand: "Sample news article on a local trend.", body: "## The trend\n\nSample copy about a local trend with sourcing from real people once published." + SAMPLE_NOTE, loc: "Newham", biz: ["Thames Haul Removals"], days: 3 },
  { type: "NEWS", title: "Independent cafes extend opening hours in Camden", stand: "Sample news item for the cafe sector.", body: "Sample paragraph one.\n\nSample paragraph two." + SAMPLE_NOTE, loc: "Camden", biz: ["Little Oak Bakery"], days: 5 },
  { type: "STORY", title: "From one van to forty staff: a cleaning company's story", stand: "Sample business story showing long-form structure.", body: "## The beginning\n\nSample opening scene.\n\n## The turning point\n\nSample narrative section.\n\n> A sample pull quote from a founder.\n\n## What's next\n\nSample closing." + SAMPLE_NOTE, loc: "Hackney", biz: ["Brightwell Cleaning Co"], feat: true, days: 2 },
  { type: "STORY", title: "How a family bakery became a Camden fixture", stand: "Sample story format.", body: "## Early mornings\n\nSample copy." + SAMPLE_NOTE, loc: "Camden", biz: ["Little Oak Bakery"], days: 9 },
  { type: "INTERVIEW", title: "Inside the Business: building a removals company in Newham", stand: "Sample founder interview format with Q&A.", body: "## Q: How did you start?\n\nSample answer.\n\n## Q: What surprised you most?\n\nSample answer." + SAMPLE_NOTE, loc: "Newham", biz: ["Thames Haul Removals"], feat: true, days: 4 },
  { type: "INTERVIEW", title: "Inside the Business: running a neighbourhood restaurant", stand: "Sample interview.", body: "## Q: Why this street?\n\nSample answer." + SAMPLE_NOTE, loc: "Hackney", biz: ["Kiln & Ember"], days: 12 },
  { type: "GUIDE", title: "Ten independent businesses to know in Hackney", stand: "Sample local guide. Real guides need real, visited businesses.", body: "## How we chose\n\nGuides explain selection criteria openly.\n\n## The list\n\n- Sample entry one\n- Sample entry two" + SAMPLE_NOTE, loc: "Hackney", biz: ["Kiln & Ember", "Brightwell Cleaning Co", "Parcelpath"], feat: true, days: 6 },
  { type: "GUIDE", title: "Where to get a good coffee in Islington", stand: "Sample cafe guide.", body: "## Our picks\n\n- Sample entry" + SAMPLE_NOTE, loc: "Islington", biz: ["Common Ground Coffee"], days: 14 },
  { type: "BOTW", title: "Business of the Week: Kiln & Ember", stand: "Sample Business of the Week feature, chosen on editorial merit.", body: "## Why this week\n\nSample rationale. Business of the Week is editorial and never paid." + SAMPLE_NOTE, loc: "Hackney", biz: ["Kiln & Ember"], feat: true, days: 0 },
  { type: "INSIGHT", title: "London's cleaning industry: who's hiring and why", stand: "Sample industry insight format.", body: "## Snapshot\n\nSample analysis. Real insights cite sources." + SAMPLE_NOTE, biz: ["Brightwell Cleaning Co"], days: 8 },
];

async function main() {
  await db.emailOutbox.deleteMany(); await db.businessSubmission.deleteMany(); await db.auditLog.deleteMany(); await db.review.deleteMany(); await db.claimRequest.deleteMany(); await db.podcastEpisode.deleteMany();
  await db.articleBusiness.deleteMany(); await db.article.deleteMany(); await db.author.deleteMany();
  await db.business.deleteMany(); await db.category.deleteMany(); await db.location.deleteMany(); await db.city.deleteMany();

  await db.cityEditor.deleteMany();
  const city = await db.city.create({ data: {
    slug: "london", name: "London", status: "LIVE", intro: LONDON.intro, region: LONDON.region,
    lat: LONDON.lat, lng: LONDON.lng, postcodePrefixes: JSON.stringify(LONDON.prefixes), launchedAt: new Date(), sortOrder: 0,
  } });
  const locs: Record<string, string> = {};
  for (const b of BOROUGHS) {
    const c = AREA_CENTROIDS[slugify(b)];
    const l = await db.location.create({ data: { slug: slugify(b), name: b, cityId: city.id, kind: "BOROUGH", lat: c?.[0], lng: c?.[1] } });
    locs[b] = l.id;
  }
  for (const [n, parent] of NEIGHBOURHOODS) {
    await db.location.create({ data: { slug: slugify(n), name: n, cityId: city.id, kind: "NEIGHBOURHOOD", parentId: locs[parent] } });
  }
  const cats: Record<string, { id: string; slug: string }> = {};
  for (const [n, intro] of CATEGORIES) {
    const c = await db.category.create({ data: { slug: slugify(n), name: n, intro } });
    cats[n] = { id: c.id, slug: c.slug };
  }
  const bizIds: Record<string, string> = {};
  for (const b of BUSINESSES) {
    const hours = JSON.stringify(Object.fromEntries(["mon", "tue", "wed", "thu", "fri"].map((d) => [d, b.hours ?? H])));
    const r = await db.business.create({
      data: {
        slug: slugify(b.n), name: b.n, summary: b.sum, description: b.desc,
        cityId: city.id, locationId: locs[b.loc], categoryId: cats[b.cat].id,
        areasServed: b.loc, services: JSON.stringify(b.svc), openingHours: hours, founded: b.year,
        isSample: true, isFeatured: !!b.featured, normName: normName(b.n), source: "Fictional sample",
      },
    });
    bizIds[b.n] = r.id;
  }
  const author = await db.author.create({ data: { slug: "primestreet-editorial", name: "PrimeStreet Editorial", role: "Editorial team", bio: "The PrimeStreet editorial team." } });
  await db.cityEditor.create({ data: { cityId: city.id, authorId: author.id, role: "EDITOR" } });
  const created: Record<string, string> = {};
  for (const a of ARTICLES) {
    const r = await db.article.create({
      data: {
        slug: slugify(a.title), type: a.type, title: a.title, standfirst: a.stand, body: a.body,
        status: "PUBLISHED", isSample: true, featured: !!a.feat, authorId: author.id,
        locationId: a.loc ? locs[a.loc] : null, cityId: a.loc ? city.id : null, disclosure: a.disclosure ?? "EDITORIAL",
        publishedAt: new Date(Date.now() - a.days * 86400000),
        businesses: { create: (a.biz ?? []).map((n) => ({ businessId: bizIds[n] })) },
      },
    });
    created[a.title] = r.id;
  }
  await db.podcastEpisode.create({
    data: {
      slug: "inside-the-business-removals-newham", number: 1, title: "Inside the Business: building a removals company in Newham",
      description: "Sample episode entry. The same interview powers the written article, the podcast page and the business profile.",
      isSample: true, status: "PUBLISHED", publishedAt: new Date(Date.now() - 4 * 86400000),
      articleId: created["Inside the Business: building a removals company in Newham"], businessId: bizIds["Thames Haul Removals"],
    },
  });
  // Products start INACTIVE at £0: nothing is for sale until an admin sets real prices (Admin > Commerce).
  const PRODUCTS = [
    { key: "premium_monthly", kind: "PREMIUM", name: "Premium profile — monthly", description: "Photo gallery, offer banner, enquiry form with leads, and click analytics.", interval: "MONTH", sortOrder: 1 },
    { key: "premium_yearly", kind: "PREMIUM", name: "Premium profile — yearly", description: "Everything in Premium, billed yearly.", interval: "YEAR", sortOrder: 2 },
    { key: "featured_7d", kind: "FEATURED", name: "Featured placement — 7 days", description: "A labelled Sponsored slot on relevant category and area pages for 7 days.", interval: "ONE_OFF", durationDays: 7, sortOrder: 3 },
    { key: "featured_30d", kind: "FEATURED", name: "Featured placement — 30 days", description: "A labelled Sponsored slot on relevant category and area pages for 30 days.", interval: "ONE_OFF", durationDays: 30, sortOrder: 4 },
  ];
  for (const p of PRODUCTS) await db.product.upsert({ where: { key: p.key }, create: { ...p, pricePence: 0, active: false }, update: {} });
  console.log(`Seeded: ${BOROUGHS.length} boroughs, ${NEIGHBOURHOODS.length} neighbourhoods, ${CATEGORIES.length} categories, ${BUSINESSES.length} businesses, ${ARTICLES.length} articles.`);
}
main().finally(() => db.$disconnect());
