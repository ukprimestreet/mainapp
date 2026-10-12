/**
 * Publishes one post about Ample Cleaners to production.
 *
 * Per docs/data-sourcing.md: every fact below was read from amplecleaners.com itself on 12 October 2026 and
 * written here in our own words. Nothing is invented — no quotes, no founder story, no customer numbers, no
 * reviews and no praise, because there is no record of completed work anywhere we could check.
 *
 * Disclosure is CONNECTED, not SPONSORED: nothing was paid, so "paid for by the business featured" would be
 * untrue. The connection is still material to a reader, and using editorial content to promote a business you
 * are connected to without making that clear is a banned practice under Schedule 1 of the Consumer Protection
 * from Unfair Trading Regulations, now carried into the DMCC Act 2024. The badge plus one line at the foot
 * discharges that. No individual is named.
 *
 * The company's own claims (DBS checks, insurance, the guarantee) are attributed to the company rather than
 * asserted as fact, because we have not verified them.
 *
 * Two deliberate omissions:
 *  - The telephone number on the site is 0333 000 0000, a placeholder. We do not publish a number that would
 *    send a reader to a dead line.
 *  - No directory listing. docs/data-sourcing.md only admits a business to the directory when its own site
 *    publishes both a full address and a working telephone number, and this one publishes neither.
 *
 * Idempotent: upserts by slug, deletes nothing. Safe to re-run.
 */
import { PrismaClient } from "@prisma/client";

const url = (process.env.DATABASE_URL ?? "").replace("schema=dev", "schema=public");
const db = new PrismaClient({ datasources: { db: { url } } });

const CHECKED = "12 October 2026";
const SLUG = "ample-cleaners-east-london-cleaning";

const body = [
  "Ample Cleaners is a cleaning company working across east London, covering Barking, Dagenham, Romford, Hornchurch, Ilford, Upminster, Stratford and Chadwell Heath, along with a wider list of neighbourhoods across the boroughs of Barking and Dagenham, Havering, Redbridge and Newham and over the Essex border.",

  "It handles five kinds of work: regular domestic cleaning, one-off deep cleans, end of tenancy cleaning, office and commercial cleaning, and after-builders cleaning. Everything is booked online rather than over the counter, and the cleaners travel to the property.",

  "## Regular domestic cleaning",

  "Regular cleaning runs on a weekly, fortnightly or monthly visit and is charged by the hour at £15, with a three-hour minimum — so the smallest booking comes to £45. According to the company there is no contract and a regular slot can be stopped at any time, which matters if you are trying a cleaner for the first time or only need help through a busy stretch.",

  "## Deep cleaning",

  "A deep clean is the one-off version: the jobs that a weekly visit never gets to, such as inside the oven, behind and under appliances, limescale in bathrooms, skirtings, door frames and window interiors. Deep cleans are quoted for the individual property rather than charged hourly, which is the usual arrangement for work where nobody can judge the scale of it from a postcode.",

  "## End of tenancy cleaning",

  "End of tenancy cleaning is aimed at the handover at the end of a let, where the standard is set by the inventory check rather than by how clean the place looks. It is the service most often tied to getting a deposit back in full, and for landlords and letting agents in Romford, Ilford and Barking it is usually the difference between a flat that can be re-let next week and one that cannot. Like deep cleans, it is quoted per property.",

  "## Office and commercial cleaning",

  "Office cleaning covers workplaces rather than homes — desks, kitchens, washrooms and communal areas — and is quoted on the size of the space and how often it needs doing. For small offices and units around Ilford, Stratford and Dagenham this is typically an early-morning or evening visit scheduled around the working day.",

  "## After-builders cleaning",

  "After-builders cleaning is the clear-up once work finishes: construction dust, which settles everywhere and comes back twice, plus paint and adhesive residue, and the fine grit that ordinary vacuuming spreads rather than removes. It is quoted individually and is worth booking as a separate job rather than hoping a normal clean will cover it.",

  "## Areas covered",

  "The named coverage is Barking, Dagenham, Romford, Hornchurch, Ilford, Upminster, Stratford and Chadwell Heath, with further neighbourhoods listed across Redbridge, Havering, Newham and the Essex border. Addresses outside the list are worth asking about rather than assuming the answer is no.",

  "## How booking works",

  "Booking takes a 20% deposit, which is credited against the total rather than added to it, with the balance due after the job is done. The company says changes are free up to 48 hours before a visit.",

  "## What the company says about its cleaners",

  "Ample Cleaners describes its cleaners as DBS-checked and the business as fully insured, and advertises a 24-hour satisfaction guarantee: if something is not right and you raise it within a day, it offers to re-clean.",

  "Those are the company's own statements and PrimeStreet has not verified them. For any cleaner you are letting into your home alone, it is reasonable to ask for the name of the insurer and how recently the checks were done — a firm that means it will not mind being asked.",

  "## Getting in touch",

  "Bookings and quotes go through the site at [amplecleaners.com](https://amplecleaners.com), or by email at hello@amplecleaners.com. No telephone line is listed at the time of writing.",

  "\n---\n",

  "Details above were read from amplecleaners.com on " + CHECKED + " and written in our own words. Prices and coverage change, so check the site before booking. PrimeStreet and Ample Cleaners share common ownership, and nothing was paid for this placement.",
].join("\n\n");

const article = {
  type: "NEWS",
  title: "Ample Cleaners: domestic, end of tenancy and office cleaning across east London",
  standfirst:
    "Regular cleaning at £15 an hour with a three-hour minimum, plus deep cleans, end of tenancy, office and after-builders work quoted per property, across Barking, Dagenham, Romford, Hornchurch, Ilford, Upminster and Stratford.",
  seoDescription:
    "Ample Cleaners covers Barking, Dagenham, Romford, Hornchurch, Ilford, Upminster, Stratford and Chadwell Heath: regular domestic cleaning at £15 an hour, deep cleaning, end of tenancy cleaning, office cleaning and after-builders cleaning.",
  body,
  status: "PUBLISHED",
  disclosure: "CONNECTED",
  isSample: false,
  featured: false,
};

const author = await db.author.findFirst({ where: { email: "cc@primestreet.uk" } });
if (!author) throw new Error("The cc@primestreet.uk author account does not exist in production.");
const city = await db.city.findFirst({ where: { slug: "london" } });
if (!city) throw new Error("The london city row does not exist in production.");

const existing = await db.article.findUnique({ where: { slug: SLUG } });
const data = { ...article, authorId: author.id, cityId: city.id, publishedAt: existing?.publishedAt ?? new Date() };
await db.article.upsert({ where: { slug: SLUG }, create: { slug: SLUG, ...data }, update: data });

console.log(`${existing ? "Updated" : "Published"}: /news/${SLUG}`);
console.log(`Disclosure: ${article.disclosure} — "Connected business", no individual named`);
console.log("Not done:   no directory listing, and no telephone number published (the site's is a placeholder)");
await db.$disconnect();
