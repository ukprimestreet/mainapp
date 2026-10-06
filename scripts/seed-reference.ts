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
const PRODUCTS = [
  { key: "premium_monthly", kind: "PREMIUM", name: "Premium profile — monthly", description: "Photo gallery, offer banner, enquiry form with leads, and click analytics.", interval: "MONTH", sortOrder: 1 },
  { key: "premium_yearly", kind: "PREMIUM", name: "Premium profile — yearly", description: "Everything in Premium, billed yearly.", interval: "YEAR", sortOrder: 2 },
  { key: "featured_7d", kind: "FEATURED", name: "Featured placement — 7 days", description: "A labelled Sponsored slot on relevant category and area pages for 7 days.", interval: "ONE_OFF", durationDays: 7, sortOrder: 3 },
  { key: "featured_30d", kind: "FEATURED", name: "Featured placement — 30 days", description: "A labelled Sponsored slot on relevant category and area pages for 30 days.", interval: "ONE_OFF", durationDays: 30, sortOrder: 4 },
];

const city = await db.city.upsert({ where: { slug: "london" }, create: { slug: "london", name: "London" }, update: { name: "London" } });
for (const b of BOROUGHS) {
  const slug = slugify(b), c = AREA_CENTROIDS[slug];
  await db.location.upsert({ where: { slug }, create: { slug, name: b, cityId: city.id, lat: c?.[0], lng: c?.[1] }, update: { name: b, lat: c?.[0], lng: c?.[1] } });
}
for (const [n, intro] of CATEGORIES) {
  const slug = slugify(n);
  await db.category.upsert({ where: { slug }, create: { slug, name: n, intro }, update: { name: n, intro } });
}
for (const p of PRODUCTS) await db.product.upsert({ where: { key: p.key }, create: { ...p, pricePence: 0, active: false }, update: {} });

const [biz, arts] = await Promise.all([db.business.count(), db.article.count()]);
console.log(`Reference data ready: 1 city, ${BOROUGHS.length} boroughs, ${CATEGORIES.length} categories, ${PRODUCTS.length} products (inactive, £0).`);
console.log(`Existing content left untouched: ${biz} businesses, ${arts} articles. No sample data was created.`);
await db.$disconnect();
