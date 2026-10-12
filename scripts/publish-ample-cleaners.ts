/**
 * Publishes one SPONSORED post about Ample Cleaners to production.
 *
 * Per docs/data-sourcing.md: every fact below was read from amplecleaners.com itself on 12 October 2026 and
 * written here in our own words. Nothing is invented — no quotes, no founder story, no customer numbers, no
 * trading history, because none of that is published anywhere we could check it.
 *
 * Two deliberate omissions:
 *  - The telephone number on the site is 0333 000 0000, a placeholder. We do not publish a number that would
 *    send a reader to a dead line.
 *  - No directory listing is created. docs/data-sourcing.md only admits a business to the directory when its
 *    own site publishes both a full address and a working telephone number, and this one publishes neither.
 *
 * Disclosure is in the body as well as the label, because the automatic founder-ownership disclosure fires on
 * a LINKED business record, and there is no listing here to link.
 *
 * Idempotent: upserts by slug, deletes nothing. Safe to re-run.
 */
import { PrismaClient } from "@prisma/client";

const url = (process.env.DATABASE_URL ?? "").replace("schema=dev", "schema=public");
const db = new PrismaClient({ datasources: { db: { url } } });

const CHECKED = "12 October 2026";
const SLUG = "ample-cleaners-east-london-cleaning";

const body = [
  "**Disclosure:** Ample Cleaners is owned by PrimeStreet's founder, Chinedu Chimezie. This is a paid-placement slot used for our own business, so no money changed hands with a third party. It is not independent editorial, nobody at PrimeStreet assessed the quality of the work, and it carries none of the checks we apply to a business we write about ourselves.",

  "Ample Cleaners is a domestic and commercial cleaning service working across the east London boroughs. It sells five things: regular cleaning on a weekly, fortnightly or monthly visit; one-off deep cleans; end of tenancy cleans; office cleaning; and after-builders cleaning.",

  "## What it costs",

  "Regular cleaning is priced by the hour at £15, with a three-hour minimum, so the smallest booking is £45. Deep cleans, end of tenancy, office and after-builders work are quoted individually rather than charged by the hour, which is the usual arrangement for jobs where the amount of work is not obvious until someone has seen the place.",

  "Booking takes a 20% deposit, which is credited against the total rather than charged on top, with the balance due after the job. The site says changes are free up to 48 hours before a visit, and that regular cleaning runs with no contract and can be stopped at any time.",

  "## Where it covers",

  "The named areas are Barking, Dagenham, Romford, Hornchurch, Ilford, Upminster, Stratford and Chadwell Heath, with a longer list of neighbourhoods across Redbridge, Havering, Newham and over the Essex border. Anyone outside that list is worth an email before assuming the answer is no.",

  "## What the company says about its cleaners",

  "Ample Cleaners describes its cleaners as DBS-checked and the business as fully insured. It also advertises a 24-hour satisfaction guarantee: if something is not right and you say so within a day, it offers to re-clean.",

  "Those are the company's own statements and we have not verified them. If they matter to you — and for anyone letting a stranger into their home alone, they should — ask for the insurance certificate and the name of the insurer before the first visit, and ask how recently the DBS checks were done. A business that means it will not mind being asked.",

  "## What is not published yet",

  "There is no trading address, no opening hours and no telephone number on the site at the time of writing, and no company registration number. For now the way in is the booking form at [amplecleaners.com](https://amplecleaners.com) or email at hello@amplecleaners.com.",

  "That is normal for a service that comes to you rather than one you visit, but it does mean there is less to check than for an established firm. If you want a track record, this is not yet the place to find one: there are no published reviews and nothing we could find elsewhere.",

  "## If you are comparing cleaners in east London",

  "The questions worth asking any of them are the same. Who exactly is coming, and is it the same person each week? Are they employed or self-employed, and who is liable if something is broken? Is the hourly rate the whole price, or do materials, parking and congestion charge land on top? What happens if your regular cleaner is ill? And what is the notice period to stop — a service that needs a contract to keep you is telling you something.",

  "\n---\n\n## What this is, and where these details came from",

  "This is a sponsored post. The details above were read from amplecleaners.com on " + CHECKED + " and written in our own words. Prices and coverage change: check the site before you book.",

  "Ample Cleaners is owned by PrimeStreet's founder. We publish that here rather than leaving you to work it out, because a media site that writes about its owner's businesses without saying so is not worth reading. Our rule is unchanged: nothing can be bought that affects a rating, a review, search order or ordinary editorial coverage — including by us.",
].join("\n\n");

const article = {
  type: "NEWS",
  title: "Ample Cleaners: hourly domestic cleaning and end-of-tenancy work across east London",
  standfirst:
    "A cleaning service covering Barking, Dagenham, Romford and the surrounding boroughs, at £15 an hour for regular visits with a three-hour minimum. A sponsored post for a business owned by PrimeStreet's founder.",
  seoDescription:
    "Ample Cleaners covers Barking, Dagenham, Romford, Hornchurch, Ilford, Upminster and Stratford: regular cleaning at £15 an hour with a three-hour minimum, plus deep cleans, end of tenancy, office and after-builders work quoted individually.",
  body,
  status: "PUBLISHED",
  disclosure: "SPONSORED",
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
console.log(`Author:     ${author.name} <${author.email}>`);
console.log(`Disclosure: ${article.disclosure} + an explicit founder-ownership disclosure in the body`);
console.log("Not done:   no directory listing, and no telephone number published (the site's is a placeholder)");
await db.$disconnect();
