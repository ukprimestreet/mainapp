import { db } from "../src/lib/db";
import { checkFormToken, formToken, isDisposableEmail, sha256 } from "../src/lib/antispam";
import { bodyHash, computeFlags, emailHash, recalcRating, reviewSchema, stars } from "../src/lib/reviews";

let fail = 0;
const t = (n: string, c: boolean) => { console.log(c ? "PASS" : "FAIL", n); if (!c) fail++; };
(async () => {
  const now = Date.now();
  t("form token: too fast", checkFormToken(formToken(now), { now: now + 1000 }) === "too-fast");
  t("form token: ok", checkFormToken(formToken(now), { now: now + 6000 }) === "ok");
  t("form token: stale", checkFormToken(formToken(now), { now: now + 5 * 3600_000 }) === "stale");
  t("form token: tampered/invalid", checkFormToken(formToken(now).replace(/.$/, "x"), { now: now + 6000 }) === "invalid" && checkFormToken("junk") === "invalid" && checkFormToken("") === "invalid");
  t("disposable email detection", isDisposableEmail("a@mailinator.com") && !isDisposableEmail("a@gmail.com"));
  t("emailHash case/space-insensitive", emailHash(" Foo@Bar.com ") === emailHash("foo@bar.com"));
  t("bodyHash ignores punctuation/case", bodyHash("Great Food!!") === bodyHash("great   food"));
  t("stars()", stars(4) === "★★★★☆" && stars(5) === "★★★★★" && stars(1.4) === "★☆☆☆☆");
  const ok = { rating: "4", body: "x".repeat(40), authorName: "Sam", email: "Sam@Example.com" };
  t("schema accepts valid + normalises email", reviewSchema.safeParse(ok).success && reviewSchema.parse(ok).email === "sam@example.com");
  t("schema rejects rating 0/6/blank, short body, bad email, long name", ["0", "6", "", "abc"].every((r) => !reviewSchema.safeParse({ ...ok, rating: r }).success) && !reviewSchema.safeParse({ ...ok, body: "short" }).success && !reviewSchema.safeParse({ ...ok, email: "no" }).success && !reviewSchema.safeParse({ ...ok, authorName: "x".repeat(41) }).success);

  // DB-backed signals + rating maths (temporary business)
  const loc = await db.location.findFirst(); const cat = await db.category.findFirst(); const city = await db.city.findFirst();
  const biz = await db.business.create({ data: { slug: "unit-review-biz", name: "Unit Review Biz", summary: "s".repeat(20), description: "d".repeat(60), cityId: city!.id, locationId: loc!.id, categoryId: cat!.id, websiteHost: "unitbiz.example", email: "owner@unitbiz.example", isSample: false } });
  const f1 = await computeFlags({ body: "Visit www.spam.com or call 020 7946 0958 now THISISSHOUTING", email: "x@mailinator.com", businessId: biz.id, ipHash: "ip1" });
  t("flags: link, phone, shouting, disposable", ["contains-link", "contains-phone", "shouting", "disposable-email"].every((f) => f1.includes(f)));
  const f2 = await computeFlags({ body: "A perfectly normal sensible review text here", email: "me@unitbiz.example", businessId: biz.id, ipHash: "ip1" });
  t("flags: email at business domain = conflict signal; clean text no spam flags", f2.includes("email-matches-business-domain") && !f2.includes("contains-link"));
  t("flags: owner's exact email", (await computeFlags({ body: "normal text normal text", email: "owner@unitbiz.example", businessId: biz.id, ipHash: "z" })).includes("email-matches-business-email"));
  const mk = (rating: number, status: string, n: number) => db.review.create({ data: { businessId: biz.id, authorName: "T", authorEmail: `t${n}@x.com`, authorEmailHash: sha256(`t${n}`), rating, body: "b".repeat(50), status, bodyHash: `bh${n}`, ipHash: "ip1" } });
  await mk(5, "PUBLISHED", 1); await mk(4, "PUBLISHED", 2); await mk(1, "PENDING", 3); await mk(1, "HELD", 4); await mk(1, "REJECTED", 5);
  await recalcRating(biz.id);
  const b = await db.business.findUnique({ where: { id: biz.id } });
  t("rating counts ONLY published (4.5 from 2)", b?.ratingAvg === 4.5 && b.ratingCount === 2);
  t("duplicate-text + same-ip + burst signals", await computeFlags({ body: "b".repeat(50), email: "n@x.com", businessId: biz.id, ipHash: "ip1" }).then((f) => f.includes("same-ip-as-another-review-of-this-business") && f.includes("review-burst")));
  await db.review.deleteMany({ where: { businessId: biz.id, status: "PUBLISHED" } }); await recalcRating(biz.id);
  const b2 = await db.business.findUnique({ where: { id: biz.id } });
  t("rating resets to null/0 with no published reviews", b2?.ratingAvg === null && b2.ratingCount === 0);
  let dupFail = false; try { await mk(3, "PENDING", 3); } catch { dupFail = true; }
  t("DB enforces one review per person per business", dupFail);
  await db.review.deleteMany({ where: { businessId: biz.id } }); await db.business.delete({ where: { id: biz.id } });
  console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exitCode = fail ? 1 : 0;
})().finally(() => db.$disconnect());
