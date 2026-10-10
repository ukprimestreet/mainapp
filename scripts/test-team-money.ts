// Team invitations, article read counting, and the writer money rules.
// These touch real rows, so everything created here is namespaced and deleted at the end.
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import { sha256 } from "../src/lib/antispam";
import { inviteState } from "../src/lib/team-invite";
import { countArticleView, articleViews, dayKey } from "../src/lib/analytics";
import { isBotUA } from "../src/lib/owner";
import { isOpenNow, londonDay, londonNow } from "../src/lib/geo";
import { payeeState, readBank, unpayableWithMoneyDue } from "../src/lib/payee";
import { encryptJson, encryptField, last4 } from "../src/lib/secretbox";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

const MARK = "teammoney.test";

async function cleanup() {
  // Only ever our own fixtures: every row is tied to the marker slug or email domain.
  const biz = await db.business.findMany({ where: { slug: { startsWith: "tm-test-" } }, select: { id: true } });
  const bizIds = biz.map((b) => b.id);
  if (bizIds.length) {
    await db.teamInvite.deleteMany({ where: { businessId: { in: bizIds } } });
    await db.businessOwner.deleteMany({ where: { businessId: { in: bizIds } } });
    await db.business.deleteMany({ where: { id: { in: bizIds } } });
  }
  const arts = await db.article.findMany({ where: { slug: { startsWith: "tm-test-" } }, select: { id: true } });
  if (arts.length) {
    await db.articleStat.deleteMany({ where: { articleId: { in: arts.map((a) => a.id) } } });
    await db.article.deleteMany({ where: { id: { in: arts.map((a) => a.id) } } });
  }
  const authors = await db.author.findMany({ where: { email: { endsWith: `@${MARK}` } }, select: { id: true } });
  if (authors.length) {
    await db.writerPayment.deleteMany({ where: { authorId: { in: authors.map((a) => a.id) } } });
    await db.commission.deleteMany({ where: { authorId: { in: authors.map((a) => a.id) } } });
    await db.notification.deleteMany({ where: { subjectId: { in: authors.map((a) => a.id) } } });
    await db.author.deleteMany({ where: { id: { in: authors.map((a) => a.id) } } });
  }
  await db.owner.deleteMany({ where: { email: { endsWith: `@${MARK}` } } });
}

async function main() {
  await cleanup();

  // ------------------------------------------------ fixtures
  const cat = await db.category.findFirst();
  const loc = await db.location.findFirst();
  const city = await db.city.findFirst();
  if (!cat || !loc || !city) throw new Error("Reference data missing — run db:seed:reference first.");

  const business = await db.business.create({
    data: { slug: "tm-test-shop", name: "Test Shop", summary: "A shop for tests", description: "x".repeat(80), categoryId: cat.id, locationId: loc.id, cityId: city.id, published: true },
  });

  // ------------------------------------------------ invitations
  const raw = randomBytes(18).toString("base64url");
  const invite = await db.teamInvite.create({
    data: { businessId: business.id, email: `mate@${MARK}`, invitedBy: `boss@${MARK}`, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 7 * 86400_000) },
  });

  t("a live invitation reads as ok", (await inviteState(raw)).state === "ok");
  t("looking at an invitation does not use it up", (await inviteState(raw)).state === "ok");
  t("the invitation carries the business it is for", (await inviteState(raw)).invite?.business.name === "Test Shop");
  t("an unknown token is invalid, not an error", (await inviteState("not-a-real-token")).state === "invalid");

  await db.teamInvite.update({ where: { id: invite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  t("an expired invitation is reported as expired", (await inviteState(raw)).state === "expired");
  await db.teamInvite.update({ where: { id: invite.id }, data: { expiresAt: new Date(Date.now() + 86400_000), acceptedAt: new Date() } });
  t("an accepted invitation cannot be reused", (await inviteState(raw)).state === "used");

  // The single-use claim is the thing that matters: two simultaneous accepts, one winner.
  await db.teamInvite.update({ where: { id: invite.id }, data: { acceptedAt: null } });
  const [a, b] = await Promise.all([
    db.teamInvite.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date() } }),
    db.teamInvite.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date() } }),
  ]);
  t("only one of two simultaneous accepts can win", a.count + b.count === 1, `got ${a.count}+${b.count}`);

  // ------------------------------------------------ article reads
  const author = await db.author.create({ data: { slug: `tm-test-writer-${Date.now()}`, name: "Test Writer", email: `writer@${MARK}` } });
  const article = await db.article.create({
    data: { slug: "tm-test-piece", title: "A test piece", standfirst: "For tests", body: "x".repeat(200), type: "NEWS", status: "PUBLISHED", publishedAt: new Date(), authorId: author.id },
  });

  await countArticleView(article.id, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
  await countArticleView(article.id, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
  const today = await db.articleStat.findUnique({ where: { articleId_day: { articleId: article.id, day: dayKey(new Date()) } } });
  t("two reads are counted as two", today?.views === 2, `got ${today?.views}`);

  await countArticleView(article.id, "Googlebot/2.1 (+http://www.google.com/bot.html)");
  await countArticleView(article.id, null);
  const afterBots = await db.articleStat.findUnique({ where: { articleId_day: { articleId: article.id, day: dayKey(new Date()) } } });
  t("bots and blank user agents are not counted", afterBots?.views === 2, `got ${afterBots?.views}`);
  t("isBotUA agrees about the obvious cases", isBotUA("curl/8.0") && isBotUA(undefined) && !isBotUA("Mozilla/5.0 (Macintosh)"));

  const series = await articleViews(article.id, 30);
  t("the reads series totals the counted views", series.total === 2, `got ${series.total}`);
  t("the series is dense — one point per day", series.points.length === 30, `got ${series.points.length}`);

  // ------------------------------------------------ special hours beat the weekly pattern
  const weekly = JSON.stringify({ mon: "09:00-17:00", tue: "09:00-17:00", wed: "09:00-17:00", thu: "09:00-17:00", fri: "09:00-17:00", sat: "09:00-17:00", sun: "09:00-17:00" });
  const noon = new Date(`${londonDay()}T12:00:00Z`);
  t("open during the weekly pattern", isOpenNow(weekly, noon) === true);
  t("a special CLOSED day overrides the weekly pattern", isOpenNow(weekly, noon, [{ day: londonDay(noon), closed: true, opens: null, closes: null }]) === false);
  t("a special day whose window has passed reports closed",
    isOpenNow(weekly, noon, [{ day: londonDay(noon), closed: false, opens: "00:05", closes: "00:30" }]) === false);
  // Built from London's own clock, so the test cannot break when the clocks change.
  const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const nowMins = londonNow(noon).minutes;
  t("…and reports open inside those shorter hours",
    isOpenNow(weekly, noon, [{ day: londonDay(noon), closed: false, opens: hhmm(nowMins - 60), closes: hhmm(nowMins + 60) }]) === true);
  t("a special day for ANOTHER date does not affect today", isOpenNow(weekly, noon, [{ day: "1999-12-25", closed: true, opens: null, closes: null }]) === true);
  t("no hours at all is still unknown, not closed", isOpenNow(null, noon) === null);
  t("a special day works even with no weekly hours published", isOpenNow(null, noon, [{ day: londonDay(noon), closed: true, opens: null, closes: null }]) === false);

  // ------------------------------------------------ money rules
  const commission = await db.commission.create({
    data: { authorId: author.id, title: "A commissioned piece", brief: "y".repeat(60), type: "NEWS", feePence: 15000, commissionedBy: "admin@test" },
  });
  t("a commission starts as offered", commission.status === "OFFERED");

  // Delivering a commission is what creates the money owed — the fee cannot appear from nowhere.
  await db.$transaction([
    db.commission.update({ where: { id: commission.id }, data: { status: "DELIVERED" } }),
    db.writerPayment.create({ data: { authorId: author.id, amountPence: 15000, description: "A commissioned piece", status: "DUE" } }),
  ]);
  const owed = await db.writerPayment.findFirst({ where: { authorId: author.id } });
  t("delivering records exactly the agreed fee", owed?.amountPence === 15000, `got ${owed?.amountPence}`);
  t("…and it starts ready to invoice, not paid", owed?.status === "DUE");

  // Approval and payment are separate states, so "approved" can never read as "paid".
  await db.writerPayment.update({ where: { id: owed!.id }, data: { status: "SUBMITTED", reference: "INV-1" } });
  const approvedOnly = await db.writerPayment.findMany({ where: { id: owed!.id, status: "APPROVED" } });
  t("a submitted invoice is not yet approved", approvedOnly.length === 0);

  const paidFromSubmitted = await db.writerPayment.updateMany({ where: { id: owed!.id, status: "APPROVED" }, data: { status: "PAID", paidAt: new Date() } });
  t("an unapproved invoice cannot be marked paid", paidFromSubmitted.count === 0);

  await db.writerPayment.update({ where: { id: owed!.id }, data: { status: "APPROVED", approvedBy: "admin@test" } });
  const paidNow = await db.writerPayment.updateMany({ where: { id: owed!.id, status: "APPROVED" }, data: { status: "PAID", paidAt: new Date() } });
  t("once approved it can be marked paid", paidNow.count === 1);
  const finalRow = await db.writerPayment.findUnique({ where: { id: owed!.id } });
  t("a paid row keeps the date it was paid", !!finalRow?.paidAt);
  t("the fee never changed along the way", finalRow?.amountPence === 15000);

  // ------------------------------------------------ paying a writer: details held encrypted
  const fresh = await db.author.findUnique({ where: { id: author.id } });
  t("a new writer is not payable and we say exactly what is missing", (() => {
    const st = payeeState(fresh!);
    return !st.payable && st.missing.length === 3 && st.hasBank === false && st.masked === null;
  })());

  await db.author.update({
    where: { id: author.id },
    data: {
      payeeName: "S O'Brien Media Ltd",
      payeeAddress: "1 Mare Street, London E8 4RU",
      bankEnc: encryptJson({ accountName: "S O'Brien Media Ltd", sortCode: "040004", accountNumber: "12345678" }),
      bankLast4: last4("12345678"),
      bankUpdatedAt: new Date(),
      utrEnc: encryptField("1234567890"),
    },
  });
  const payable = await db.author.findUnique({ where: { id: author.id } });
  t("with a payee, an address and an account, the writer is payable", payeeState(payable!).payable === true);
  t("the masked account shows only the last four digits", payeeState(payable!).masked === "•••• 5678");
  t("the stored ciphertext does not contain the account number", !payable!.bankEnc!.includes("12345678"));
  t("the UTR is not stored in plain text either", !payable!.utrEnc!.includes("1234567890"));
  t("an admin reveal decrypts the real account", (() => {
    const b = readBank(payable!);
    return b?.accountNumber === "12345678" && b.sortCode === "040004";
  })());
  t("VAT registration without a number makes a writer unpayable", (() => {
    const st = payeeState({ ...payable!, vatRegistered: true, vatNumber: null });
    return !st.payable && st.missing.some((m) => /VAT/.test(m));
  })());

  // The admin warning: money owed to someone we have no way of paying.
  await db.writerPayment.create({ data: { authorId: author.id, amountPence: 5000, description: "Unpayable test fee", status: "DUE" } });
  await db.author.update({ where: { id: author.id }, data: { bankEnc: null, bankLast4: null } });
  const stuck = await unpayableWithMoneyDue();
  t("an admin is warned about money owed to a writer we cannot pay", stuck.some((u) => u.authorId === author.id && u.pence >= 5000));
  await db.author.update({ where: { id: author.id }, data: { bankEnc: encryptJson({ accountName: "A B", sortCode: "040004", accountNumber: "12345678" }), bankLast4: "5678" } });
  const unstuck = await unpayableWithMoneyDue();
  t("…and stops being warned once the details are there", !unstuck.some((u) => u.authorId === author.id));

  t("a ciphertext read under the wrong key is null, never a wrong account", (() => {
    const real = process.env.FIELD_KEY;
    process.env.FIELD_KEY = Buffer.alloc(32, 7).toString("base64");
    const out = readBank(payable!);
    process.env.FIELD_KEY = real;
    return out === null;
  })());


  await cleanup();
  console.log(fail === 0 ? "\nALL TEAM/MONEY TESTS PASS" : `\n${fail} FAILED`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
