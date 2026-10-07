/**
 * Moves the launch articles onto the owner's author account (cc@primestreet.uk, Chinedu Chimezie).
 * The account is created now so the articles have a named author of record; the person can claim it later
 * by signing in with that email address. Idempotent.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const EMAIL = "cc@primestreet.uk";
const NAME = "Chinedu Chimezie";

const BIO =
  "Chinedu Chimezie is the founder and editor of PrimeStreet. He writes about how London business actually works: " +
  "tax and rates, premises, regulation and the practical decisions involved in running something small in an expensive city. " +
  "Every piece is researched from primary sources — government guidance, the statutory company register and businesses' own " +
  "published material — and each one lists those sources and the date they were checked at the foot of the article. " +
  "PrimeStreet does not reproduce other directories' listings, ratings or reviews. Corrections are welcome.";

const SLUGS = [
  "checks-before-paying-a-deposit-london-trades",
  "small-business-rates-london-explained",
  "when-to-register-for-vat-london-business",
  "why-local-business-data-online-is-wrong",
  "registered-address-tells-you-less-than-you-think",
  "mayor-of-london-business-support-what-exists",
];

const profile = { name: NAME, role: "Founder and Editor", bio: BIO, email: EMAIL, active: true };
const owner = await db.author.upsert({
  where: { email: EMAIL },
  create: { slug: "chinedu-chimezie", ...profile },
  update: profile,
});

const moved = await db.article.updateMany({ where: { slug: { in: SLUGS } }, data: { authorId: owner.id } });
console.log(`Author: ${owner.name} <${owner.email}> at /authors/${owner.slug}`);
console.log(`Articles reassigned: ${moved.count}`);

// The placeholder editorial account is only removed once nothing points at it.
const placeholder = await db.author.findUnique({ where: { slug: "primestreet-editorial" }, include: { _count: { select: { articles: true } } } });
if (placeholder && placeholder._count.articles === 0) {
  await db.cityEditor.deleteMany({ where: { authorId: placeholder.id } });
  await db.author.delete({ where: { id: placeholder.id } });
  console.log("Removed the empty placeholder author (PrimeStreet Editorial).");
} else if (placeholder) {
  console.log(`Kept PrimeStreet Editorial: still has ${placeholder._count.articles} article(s).`);
}
await db.$disconnect();
