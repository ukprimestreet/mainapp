/**
 * Production seed: REFERENCE DATA ONLY — the real city, the 33 London boroughs, the category taxonomy and the
 * (inactive, £0) product catalogue. It never creates businesses, articles or reviews: those must be real.
 * Idempotent (upsert only, nothing is deleted), so it is safe to re-run after a deploy.
 */
import { PrismaClient } from "@prisma/client";
import { AREA_CENTROIDS } from "../src/lib/geo";

const db = new PrismaClient();
const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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

const PRODUCTS = [
  { key: "premium_monthly", kind: "PREMIUM", name: "Premium profile — monthly", description: "Photo gallery, offer banner, enquiry form with leads, and click analytics.", interval: "MONTH", sortOrder: 1 },
  { key: "premium_yearly", kind: "PREMIUM", name: "Premium profile — yearly", description: "Everything in Premium, billed yearly.", interval: "YEAR", sortOrder: 2 },
  { key: "featured_7d", kind: "FEATURED", name: "Featured placement — 7 days", description: "A labelled Sponsored slot on relevant category and area pages for 7 days.", interval: "ONE_OFF", durationDays: 7, sortOrder: 3 },
  { key: "featured_30d", kind: "FEATURED", name: "Featured placement — 30 days", description: "A labelled Sponsored slot on relevant category and area pages for 30 days.", interval: "ONE_OFF", durationDays: 30, sortOrder: 4 },
];

const cityData = {
  name: "London", status: "LIVE", region: LONDON.region, country: "United Kingdom", timezone: "Europe/London",
  lat: LONDON.lat, lng: LONDON.lng, postcodePrefixes: JSON.stringify(LONDON.prefixes), sortOrder: 0,
};
const city = await db.city.upsert({ where: { slug: "london" }, create: { slug: "london", intro: LONDON.intro, launchedAt: new Date(), ...cityData }, update: cityData });
if (!(await db.city.findUnique({ where: { slug: "london" } }))!.intro) await db.city.update({ where: { id: city.id }, data: { intro: LONDON.intro } });

const areaId: Record<string, string> = {};
for (const b of BOROUGHS) {
  const slug = slugify(b), c = AREA_CENTROIDS[slug];
  const row = await db.location.upsert({
    where: { cityId_slug: { cityId: city.id, slug } },
    create: { slug, name: b, cityId: city.id, kind: "BOROUGH", lat: c?.[0], lng: c?.[1] },
    update: { name: b, kind: "BOROUGH", lat: c?.[0], lng: c?.[1] },
  });
  areaId[b] = row.id;
}
// Neighbourhoods carry no intro on purpose: the quality gate keeps them out of the index until an editor writes one.
for (const [n, parent] of NEIGHBOURHOODS) {
  const slug = slugify(n);
  await db.location.upsert({
    where: { cityId_slug: { cityId: city.id, slug } },
    create: { slug, name: n, cityId: city.id, kind: "NEIGHBOURHOOD", parentId: areaId[parent] },
    update: { name: n, kind: "NEIGHBOURHOOD", parentId: areaId[parent] },
  });
}
for (const [n, intro] of CATEGORIES) {
  const slug = slugify(n);
  await db.category.upsert({ where: { slug }, create: { slug, name: n, intro }, update: { name: n, intro } });
}
for (const p of PRODUCTS) await db.product.upsert({ where: { key: p.key }, create: { ...p, pricePence: 0, active: false }, update: {} });

const [biz, arts] = await Promise.all([db.business.count(), db.article.count()]);
console.log(`Reference data ready: 1 city, ${BOROUGHS.length} boroughs, ${NEIGHBOURHOODS.length} neighbourhoods, ${CATEGORIES.length} categories, ${PRODUCTS.length} products (inactive, £0).`);
console.log(`Existing content left untouched: ${biz} businesses, ${arts} articles. No sample data was created.`);
await db.$disconnect();
