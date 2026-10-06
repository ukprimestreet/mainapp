import { db } from "../src/lib/db";
import { encodeForm, processEvent, signStripePayload, verifyStripeSignature } from "../src/lib/billing";
import { activeCampaigns, campaignTotals, getEntitlements, gbp, monthlyPence, parseGallery, pickFeatured, rotate } from "../src/lib/commerce";
import { buildDigest } from "../src/lib/newsletter";

let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const DAY = 86400_000;

(async () => {
  // ---------------------------------------------------------- signature
  const secret = "whsec_unit", body = JSON.stringify({ id: "evt_1", type: "x", data: { object: {} } });
  const now = 1_800_000_000;
  const good = signStripePayload(body, secret, now);
  t("signature: valid header accepted", verifyStripeSignature(body, good, secret, now));
  t("signature: wrong secret / tampered body / missing header / empty secret rejected", !verifyStripeSignature(body, good, "whsec_other", now) && !verifyStripeSignature(body + " ", good, secret, now) && !verifyStripeSignature(body, null, secret, now) && !verifyStripeSignature(body, good, "", now));
  t("signature: replay window (±5 min) enforced both ways", !verifyStripeSignature(body, good, secret, now + 301) && !verifyStripeSignature(body, good, secret, now - 301) && verifyStripeSignature(body, good, secret, now + 299));
  t("signature: malformed headers rejected, extra v1 values (key rotation) accepted", !verifyStripeSignature(body, "garbage", secret, now) && !verifyStripeSignature(body, "t=abc,v1=00", secret, now) && !verifyStripeSignature(body, `t=${now},v1=short`, secret, now) && verifyStripeSignature(body, `${good},v1=${"0".repeat(64)}`, secret, now) && verifyStripeSignature(body, `t=${now},v1=${"0".repeat(64)},v1=${good.split("v1=")[1]}`, secret, now));
  t("encodeForm: Stripe bracket nesting, skips null/undefined, encodes", encodeForm({ mode: "payment", line_items: { 0: { price: "price_1", quantity: 1 } }, metadata: { a: "x y&z" }, skip: undefined, nul: null }).join("&") === "mode=payment&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Ba%5D=x%20y%26z");

  // ---------------------------------------------------------- pure helpers
  t("money helpers", gbp(2900) === "£29" && gbp(2950) === "£29.50" && gbp(0) === "£0" && monthlyPence({ pricePence: 29900, interval: "YEAR" }) === 2492 && monthlyPence({ pricePence: 2900, interval: "MONTH" }) === 2900 && monthlyPence({ pricePence: 5000, interval: "ONE_OFF" }) === 0);
  t("campaignTotals: sums and CTR (1 dp), zero-safe", JSON.stringify(campaignTotals([{ impressions: 200, clicks: 3 }, { impressions: 100, clicks: 0 }])) === '{"impressions":300,"clicks":3,"ctr":1}' && campaignTotals([]).ctr === 0);
  t("parseGallery: filters non-strings, caps at 8, junk-safe", parseGallery('["a","b",3,null]').join() === "a,b" && parseGallery(JSON.stringify(Array.from({ length: 20 }, (_, i) => "u" + i))).length === 8 && parseGallery("junk").length === 0 && parseGallery(null).length === 0);
  const mk = (id: string, shown: number) => ({ id, stats: [{ impressions: shown }] });
  t("rotate: least-shown first (fair), limit respected, ties random but stable per rnd", rotate([mk("a", 50), mk("b", 5), mk("c", 20)], 2).map((x) => x.id).join() === "b,c" && rotate([mk("a", 1), mk("b", 1)], 1, () => 0.9).length === 1);

  // ---------------------------------------------------------- DB fixtures
  const wipe = async () => {
    await db.campaign.deleteMany({ where: { OR: [{ advertiser: "unit" }, { business: { slug: { startsWith: "cm-" } } }] } });
    await db.sponsorship.deleteMany({ where: { sponsorName: { startsWith: "Unit " } } });
    await db.order.deleteMany({ where: { business: { slug: { startsWith: "cm-" } } } });
    await db.subscription.deleteMany({ where: { business: { slug: { startsWith: "cm-" } } } });
    await db.business.deleteMany({ where: { slug: { startsWith: "cm-" } } });
    await db.stripeEvent.deleteMany({ where: { id: { startsWith: "evt_unit" } } });
    await db.article.deleteMany({ where: { slug: { startsWith: "cm-" } } });
  };
  await wipe();
  const city = (await db.city.findFirst())!, hk = (await db.location.findFirst({ where: { slug: "hackney" } }))!, cm = (await db.location.findFirst({ where: { slug: "camden" } }))!;
  const cl = (await db.category.findUnique({ where: { slug: "cleaning" } }))!, cf = (await db.category.findUnique({ where: { slug: "cafes" } }))!;
  const mkb = (slug: string, o: Record<string, unknown> = {}) => db.business.create({ data: { slug: `cm-${slug}`, name: `Cm ${slug}`, summary: "s".repeat(20), description: "d".repeat(80), cityId: city.id, locationId: hk.id, categoryId: cl.id, isSample: false, ...o } });
  const [A, B, S, U] = [await mkb("a"), await mkb("b"), await mkb("sample", { isSample: true }), await mkb("unpub", { published: false })];
  const camp = (b: { id: string } | null, o: Record<string, unknown> = {}) => db.campaign.create({ data: { kind: "FEATURED", businessId: b?.id, placement: "LISTING", startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 5 * DAY), categoryId: cl.id, locationId: null, ...o } });
  const cA = await camp(A), cB = await camp(B, { locationId: hk.id });
  await camp(A, { status: "PAUSED" }); await camp(A, { endsAt: new Date(Date.now() - 1000) }); await camp(A, { startsAt: new Date(Date.now() + DAY) });
  await camp(S); await camp(U); await camp(A, { categoryId: cf.id }); await camp(A, { locationId: cm.id, categoryId: null });
  const capped = await camp(B, { impressionCap: 100 }); await db.campaignStat.create({ data: { campaignId: capped.id, day: "2026-01-01", impressions: 100 } });
  const list = await activeCampaigns("FEATURED", "LISTING", { categoryId: cl.id, locationId: hk.id });
  t("campaigns: only active + in-date + matching targeting + under cap; paused/ended/future/sample/unpublished/other-category/other-area/capped excluded", list.length === 2 && list.every((c) => [cA.id, cB.id].includes(c.id)), `got ${list.length}`);
  t("campaigns: category-wide slot (no area) excludes area-targeted campaigns", (await activeCampaigns("FEATURED", "LISTING", { categoryId: cl.id })).map((c) => c.id).join() === cA.id);
  t("campaigns: slot in another category matches only that targeting; null=any matches everywhere", (await activeCampaigns("FEATURED", "LISTING", { categoryId: cf.id, locationId: cm.id })).length === 2);
  t("pickFeatured: max N, labelled data present", (await pickFeatured({ categoryId: cl.id, locationId: hk.id }, 1)).length === 1 && !!(await pickFeatured({ categoryId: cl.id, locationId: hk.id }, 2))[0].business?.name);
  t("campaigns: AD kind and other placements are separate", (await activeCampaigns("AD", "HOME", {})).length === 0 && (await activeCampaigns("FEATURED", "HOME", { categoryId: cl.id })).length === 0);

  // ---------------------------------------------------------- entitlements
  const sub = (o: Record<string, unknown>) => db.subscription.create({ data: { businessId: A.id, productKey: "premium_monthly", provider: "STRIPE", status: "ACTIVE", ...o } });
  t("entitlements: none by default", !(await getEntitlements(A.id)).premium);
  let s1 = await sub({ currentPeriodEnd: new Date(Date.now() + DAY) });
  t("entitlements: ACTIVE with future end → premium (+until)", (await getEntitlements(A.id)).premium && (await getEntitlements(A.id)).until!.getTime() > Date.now());
  await db.subscription.update({ where: { id: s1.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
  t("entitlements: ACTIVE but period ended → not premium (can't outlive what was paid)", !(await getEntitlements(A.id)).premium);
  await db.subscription.update({ where: { id: s1.id }, data: { status: "PAST_DUE", currentPeriodEnd: new Date(Date.now() - 3 * DAY) } });
  t("entitlements: PAST_DUE within the 7-day grace → still premium", (await getEntitlements(A.id)).premium && (await getEntitlements(A.id)).status === "PAST_DUE");
  await db.subscription.update({ where: { id: s1.id }, data: { currentPeriodEnd: new Date(Date.now() - 8 * DAY) } });
  t("entitlements: PAST_DUE beyond grace → not premium", !(await getEntitlements(A.id)).premium);
  await db.subscription.update({ where: { id: s1.id }, data: { status: "CANCELED", currentPeriodEnd: new Date(Date.now() + DAY) } });
  t("entitlements: CANCELED → not premium even if period remains", !(await getEntitlements(A.id)).premium);
  await sub({ provider: "MANUAL", currentPeriodEnd: new Date(Date.now() + 10 * DAY), note: "inv-1" });
  t("entitlements: manual grant works and reports its source", (await getEntitlements(A.id)).source === "MANUAL");
  t("entitlements are per business", !(await getEntitlements(B.id)).premium);
  await db.subscription.deleteMany({ where: { businessId: A.id } });

  // ---------------------------------------------------------- webhooks / processEvent
  await db.product.upsert({ where: { key: "unit_premium" }, create: { key: "unit_premium", kind: "PREMIUM", name: "Unit premium", description: "d".repeat(20), pricePence: 2900, interval: "MONTH", active: true, stripePriceId: "price_unit" }, update: {} });
  await db.product.upsert({ where: { key: "unit_featured" }, create: { key: "unit_featured", kind: "FEATURED", name: "Unit featured", description: "d".repeat(20), pricePence: 4900, interval: "ONE_OFF", durationDays: 14, active: true, stripePriceId: "price_unit2" }, update: {} });
  const order = await db.order.create({ data: { businessId: A.id, productKey: "unit_premium", amountPence: 2900, stripeSessionId: "cs_unit_1" } });
  const ev = (id: string, type: string, object: Record<string, unknown>) => ({ id, type, data: { object } });
  t("event: unknown order ignored (no state change)", (await processEvent(ev("evt_unit_0", "checkout.session.completed", { id: "cs_nope", payment_status: "paid" }))) === "unknown order");
  t("event: unpaid checkout doesn't activate anything", (await processEvent(ev("evt_unit_1", "checkout.session.completed", { id: "cs_unit_1", payment_status: "unpaid", metadata: { order_id: order.id } }))) === "not paid yet" && !(await getEntitlements(A.id)).premium);
  const r1 = await processEvent(ev("evt_unit_2", "checkout.session.completed", { id: "cs_unit_1", payment_status: "paid", customer: "cus_1", subscription: "sub_unit_1", metadata: { order_id: order.id } }));
  t("event: paid subscription checkout → order PAID, premium ACTIVE with Stripe ids", r1 === "premium activated" && (await db.order.findUnique({ where: { id: order.id } }))!.status === "PAID" && (await getEntitlements(A.id)).premium && (await db.subscription.findUnique({ where: { stripeSubscriptionId: "sub_unit_1" } }))!.stripeCustomerId === "cus_1");
  t("event: the same event id twice is processed once (idempotent)", (await processEvent(ev("evt_unit_2", "checkout.session.completed", { id: "cs_unit_1", payment_status: "paid", subscription: "sub_unit_1", metadata: { order_id: order.id } }))) === "duplicate" && (await db.subscription.count({ where: { businessId: A.id } })) === 1);
  t("event: a different event for an already-paid order doesn't double-activate", (await processEvent(ev("evt_unit_3", "checkout.session.completed", { id: "cs_unit_1", payment_status: "paid", subscription: "sub_unit_1", metadata: { order_id: order.id } }))) === "already paid");
  const end = Math.floor((Date.now() + 40 * DAY) / 1000);
  t("event: invoice.paid extends the period to the invoice's period end", (await processEvent(ev("evt_unit_4", "invoice.paid", { subscription: "sub_unit_1", lines: { data: [{ period: { end } }] } }))) === "period extended" && Math.abs((await db.subscription.findUnique({ where: { stripeSubscriptionId: "sub_unit_1" } }))!.currentPeriodEnd!.getTime() - end * 1000) < 1000);
  await processEvent(ev("evt_unit_5", "invoice.payment_failed", { subscription: "sub_unit_1" }));
  t("event: payment failed → PAST_DUE (still premium inside grace)", (await db.subscription.findUnique({ where: { stripeSubscriptionId: "sub_unit_1" } }))!.status === "PAST_DUE" && (await getEntitlements(A.id)).premium);
  await processEvent(ev("evt_unit_6", "customer.subscription.updated", { id: "sub_unit_1", status: "active", cancel_at_period_end: true, current_period_end: end }));
  t("event: subscription.updated maps status + cancel-at-period-end", (await db.subscription.findUnique({ where: { stripeSubscriptionId: "sub_unit_1" } }))!.status === "ACTIVE" && (await db.subscription.findUnique({ where: { stripeSubscriptionId: "sub_unit_1" } }))!.cancelAtPeriodEnd === true);
  await processEvent(ev("evt_unit_7", "customer.subscription.deleted", { id: "sub_unit_1" }));
  t("event: subscription.deleted → CANCELED, premium ends", !(await getEntitlements(A.id)).premium);
  const fo = await db.order.create({ data: { businessId: B.id, productKey: "unit_featured", amountPence: 4900, stripeSessionId: "cs_unit_2" } });
  t("event: paid FEATURED order creates a campaign (own category/area, duration from product)", (await processEvent(ev("evt_unit_8", "checkout.session.completed", { id: "cs_unit_2", payment_status: "paid", metadata: { order_id: fo.id } }))) === "featured campaign created" && await (async () => { const c = await db.campaign.findFirst({ where: { orderId: fo.id } }); return !!c && c.source === "ORDER" && c.businessId === B.id && c.categoryId === cl.id && Math.abs(c.endsAt.getTime() - (Date.now() + 14 * DAY)) < 60_000; })());
  const so = await db.order.create({ data: { businessId: S.id, productKey: "unit_featured", amountPence: 4900, stripeSessionId: "cs_unit_3" } });
  t("event: paid featured order for a SAMPLE business never creates a campaign", (await processEvent(ev("evt_unit_9", "checkout.session.completed", { id: "cs_unit_3", payment_status: "paid", metadata: { order_id: so.id } }))) === "paid, business not promotable" && (await db.campaign.count({ where: { orderId: so.id } })) === 0);
  const eo = await db.order.create({ data: { businessId: A.id, productKey: "unit_premium", amountPence: 2900, stripeSessionId: "cs_unit_4" } });
  await processEvent(ev("evt_unit_10", "checkout.session.expired", { id: "cs_unit_4" }));
  t("event: expired checkout marks the pending order FAILED", (await db.order.findUnique({ where: { id: eo.id } }))!.status === "FAILED");
  t("event: unrelated types ignored; refund noted for manual handling", (await processEvent(ev("evt_unit_11", "customer.created", {}))) === "ignored" && (await processEvent(ev("evt_unit_12", "charge.refunded", {}))).startsWith("refund noted"));
  t("event: subscription events for unknown ids are harmless", (await processEvent(ev("evt_unit_13", "customer.subscription.deleted", { id: "sub_missing" }))) === "subscription canceled");

  // ---------------------------------------------------------- newsletter sponsor block
  await db.article.create({ data: { slug: "cm-news", type: "NEWS", title: "Cm unit news story", standfirst: "s".repeat(40), body: "b".repeat(400), status: "PUBLISHED", publishedAt: new Date(Date.now() - 3600_000), authorId: (await db.author.findFirst())!.id, isSample: false } });
  await db.sponsorship.create({ data: { kind: "NEWSLETTER", sponsorName: "Unit Sponsor Ltd", status: "ACTIVE", notes: "Thanks to our sponsor.", website: "https://sponsor.example" } });
  await db.sponsorship.create({ data: { kind: "NEWSLETTER", sponsorName: "Unit Draft Co", status: "DRAFT" } });
  const dg = await buildDigest(7);
  t("digest: active newsletter sponsor appears in a clearly labelled block; drafts don't", !!dg && dg.body.includes("SPONSORED") && dg.body.includes("Unit Sponsor Ltd") && dg.body.includes("don't influence what we cover") && !dg.body.includes("Unit Draft Co"));

  await db.product.deleteMany({ where: { key: { startsWith: "unit_" } } });
  await wipe();
  console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exitCode = fail ? 1 : 0;
})().finally(() => db.$disconnect());
