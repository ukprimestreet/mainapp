import { db } from "./db";
import { BUSINESS_TEMPLATES, bizById } from "./email/business-templates";
import { sendBusinessTemplate } from "./email/send";
import { businessViews } from "./analytics";
import { getEntitlements } from "./commerce";
import { completeness } from "./owner";

/**
 * The automation engine. The lifecycle programme describes WHEN each email should fire; this is the code
 * that finds the right recipients and sends it.
 *
 * Three safety rules, because an automated email that misfires reaches real businesses and cannot be recalled:
 *  1. Every automation is OFF until a human turns it on.
 *  2. Every run obeys a daily cap, so a mistake sends ten emails rather than ten thousand.
 *  3. Nothing is ever sent twice: each rule checks the outbox before sending to a given recipient.
 * A dry run reports exactly who would receive it and sends nothing.
 */
export type Candidate = { ownerId: string; email: string; businessId: string; label: string; data: Record<string, unknown> };
export type Rule = {
  key: string;
  /** Finds who should receive this today. */
  find: (limit: number) => Promise<Candidate[]>;
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

/** Has this exact template already gone to this address? Templates in the programme are once-per-recipient. */
async function alreadySent(subject: string, email: string) {
  return (await db.emailOutbox.count({ where: { to: email, subject } })) > 0;
}

const ownersOf = (businessId: string) =>
  db.businessOwner.findMany({ where: { businessId }, include: { owner: true } });

// ---------------------------------------------------------------- the rules
export const RULES: Rule[] = [
  {
    // An unclaimed profile that people are actually looking at.
    key: "biz-claim-invite",
    find: async (limit) => {
      const businesses = await db.business.findMany({
        where: { claimStatus: "UNCLAIMED", published: true, isSample: false, email: { not: null }, createdAt: { lte: daysAgo(7) } },
        include: { category: true, location: true },
        take: limit * 3,
      });
      const out: Candidate[] = [];
      for (const b of businesses) {
        if (out.length >= limit) break;
        const views = await businessViews(b.id, 30);
        if (views.total < 1 || !b.email) continue;
        const tpl = bizById("biz-claim-invite")!;
        const data = { business: b.name, area: b.location.name, category: b.category.name, views: views.total, claimUrl: "/claim", profileUrl: "/" };
        if (await alreadySent(tpl.subject(data as never), b.email)) continue;
        out.push({ ownerId: "", email: b.email, businessId: b.id, label: `${b.name} · ${views.total} views`, data });
      }
      return out;
    },
  },
  {
    // Claimed but still thin.
    key: "biz-profile-incomplete",
    find: async (limit) => {
      const links = await db.businessOwner.findMany({
        where: { business: { claimStatus: { in: ["CLAIMED", "VERIFIED"] }, isSample: false } },
        include: { owner: true, business: true },
        take: limit * 4,
      });
      const out: Candidate[] = [];
      for (const l of links) {
        if (out.length >= limit) break;
        const c = completeness(l.business);
        if (c.pct >= 70) continue;
        const tpl = bizById("biz-profile-incomplete")!;
        const data = {
          name: l.owner.name.split(" ")[0], business: l.business.name, percent: c.pct,
          missing: c.items.filter(([, ok]) => !ok).map(([n]) => n).slice(0, 4),
        };
        if (await alreadySent(tpl.subject(data as never), l.owner.email)) continue;
        out.push({ ownerId: l.ownerId, email: l.owner.email, businessId: l.businessId, label: `${l.business.name} · ${c.pct}%`, data });
      }
      return out;
    },
  },
  {
    // A published review nobody has answered.
    key: "biz-review-unanswered",
    find: async (limit) => {
      const reviews = await db.review.findMany({
        where: { status: "PUBLISHED", response: null, createdAt: { lte: daysAgo(7) }, business: { isSample: false } },
        include: { business: true },
        orderBy: { createdAt: "asc" },
        take: limit * 3,
      });
      const out: Candidate[] = [];
      for (const r of reviews) {
        if (out.length >= limit) break;
        for (const l of await ownersOf(r.businessId)) {
          const tpl = bizById("biz-review-unanswered")!;
          const data = {
            business: r.business.name, rating: r.rating, title: r.title, body: r.body.slice(0, 300),
            replyUrl: `/owner/business/${r.businessId}/reviews`,
            days: Math.round((Date.now() - r.createdAt.getTime()) / 86400_000),
          };
          if (await alreadySent(tpl.subject(data as never), l.owner.email)) continue;
          out.push({ ownerId: l.ownerId, email: l.owner.email, businessId: r.businessId, label: `${r.business.name} · ${r.rating}★`, data });
          break;
        }
      }
      return out;
    },
  },
  {
    // Paying for Premium and not using it — the most valuable retention email there is.
    key: "biz-premium-unused",
    find: async (limit) => {
      const subs = await db.subscription.findMany({ where: { status: "ACTIVE", createdAt: { lte: daysAgo(7) } }, include: { business: true }, take: limit * 3 });
      const out: Candidate[] = [];
      for (const s of subs) {
        if (out.length >= limit) break;
        const ent = await getEntitlements(s.businessId);
        if (!ent.premium) continue;
        const b = s.business;
        const used = (b.gallery && b.gallery !== "[]") || b.promoText;
        if (used) continue;
        for (const l of await ownersOf(s.businessId)) {
          const tpl = bizById("biz-premium-unused")!;
          const data = { business: b.name, url: `/owner/business/${b.id}/promote` };
          if (await alreadySent(tpl.subject(data as never), l.owner.email)) continue;
          out.push({ ownerId: l.ownerId, email: l.owner.email, businessId: b.id, label: b.name, data });
          break;
        }
      }
      return out;
    },
  },
  {
    // Real demand, and no Premium. Earned by their own numbers.
    key: "biz-premium-offer",
    find: async (limit) => {
      const links = await db.businessOwner.findMany({
        where: { business: { isSample: false, claimStatus: { in: ["CLAIMED", "VERIFIED"] } } },
        include: { owner: true, business: true },
        take: limit * 4,
      });
      const out: Candidate[] = [];
      const month = new Date().toLocaleDateString("en-GB", { month: "long" });
      for (const l of links) {
        if (out.length >= limit) break;
        const ent = await getEntitlements(l.businessId);
        if (ent.premium) continue;
        const [enquiries, views] = await Promise.all([
          db.lead.count({ where: { businessId: l.businessId, createdAt: { gte: daysAgo(30) } } }),
          businessViews(l.businessId, 30),
        ]);
        if (enquiries < 5 && views.total < 250) continue;
        const product = await db.product.findUnique({ where: { key: "premium_monthly" } });
        const tpl = bizById("biz-premium-offer")!;
        const data = {
          business: l.business.name, enquiries, month,
          price: product?.pricePence ? `£${(product.pricePence / 100).toFixed(0)} a month + VAT` : "see the site",
          url: `/owner/business/${l.businessId}/promote`,
        };
        if (await alreadySent(tpl.subject(data as never), l.owner.email)) continue;
        out.push({ ownerId: l.ownerId, email: l.owner.email, businessId: l.businessId, label: `${l.business.name} · ${enquiries} enquiries`, data });
      }
      return out;
    },
  },
  {
    // Started a purchase and did not finish.
    key: "biz-checkout-abandoned",
    find: async (limit) => {
      const orders = await db.order.findMany({
        where: { status: "PENDING", createdAt: { lte: daysAgo(1), gte: daysAgo(14) } },
        include: { business: true },
        take: limit * 2,
      });
      const out: Candidate[] = [];
      for (const o of orders) {
        if (out.length >= limit) break;
        const product = await db.product.findUnique({ where: { key: o.productKey } });
        for (const l of await ownersOf(o.businessId)) {
          const tpl = bizById("biz-checkout-abandoned")!;
          const data = { business: o.business.name, product: product?.name ?? "your order", url: `/owner/business/${o.businessId}/promote` };
          if (await alreadySent(tpl.subject(data as never), l.owner.email)) continue;
          out.push({ ownerId: l.ownerId, email: l.owner.email, businessId: o.businessId, label: `${o.business.name} · ${product?.name ?? o.productKey}`, data });
          break;
        }
      }
      return out;
    },
  },
];

export const ruleFor = (key: string) => RULES.find((r) => r.key === key);
/** Templates in the programme that no rule fires yet — shown in admin so the gap is visible, not hidden. */
export const manualOnly = () => BUSINESS_TEMPLATES.filter((t) => !RULES.some((r) => r.key === t.id));

/** Makes sure every rule has a row, so the admin screen can list them all. */
export async function ensureAutomations() {
  for (const r of RULES) {
    await db.automation.upsert({ where: { key: r.key }, create: { key: r.key }, update: {} });
  }
  return db.automation.findMany({ orderBy: { key: "asc" }, include: { runs: { orderBy: { startedAt: "desc" }, take: 1 } } });
}

export type RunResult = { key: string; sent: number; skipped: number; candidates: Candidate[]; error?: string };

/**
 * Runs one automation. `dryRun` finds the recipients and sends nothing, which is how you check a rule
 * before trusting it with real businesses.
 */
export async function runAutomation(key: string, opts: { dryRun?: boolean; byAdmin?: string } = {}): Promise<RunResult> {
  const rule = ruleFor(key);
  if (!rule) return { key, sent: 0, skipped: 0, candidates: [], error: "No such automation." };
  const row = await db.automation.upsert({ where: { key }, create: { key }, update: {} });
  if (!row.enabled && !opts.dryRun) return { key, sent: 0, skipped: 0, candidates: [], error: "This automation is switched off." };

  let sent = 0, skipped = 0, error: string | undefined;
  let candidates: Candidate[] = [];
  try {
    candidates = await rule.find(row.dailyCap);
    if (!opts.dryRun) {
      for (const c of candidates) {
        if (c.ownerId) {
          const r = await sendBusinessTemplate(key, c.ownerId, c.email, c.data);
          if (r.skipped) skipped++; else sent++;
        } else {
          // An unclaimed listing has no owner account yet, so there is no consent record to look up.
          // It still goes out as lifecycle mail about their own listing, with an unsubscribe link.
          const { sendMail } = await import("./mail");
          const { renderEmail } = await import("./email/layout");
          const tpl = bizById(key)!;
          const doc = tpl.build(c.data as never);
          const rendered = renderEmail({ ...doc, purpose: tpl.purpose });
          await sendMail(c.email, tpl.subject(c.data as never), rendered.text, { purpose: tpl.purpose, html: rendered.html, noFooter: true });
          sent++;
        }
      }
    }
  } catch (e) {
    error = String(e).slice(0, 300);
  }

  await db.$transaction([
    db.automationRun.create({ data: { key, sent, skipped, error, dryRun: !!opts.dryRun, byAdmin: opts.byAdmin } }),
    db.automation.update({
      where: { key },
      data: opts.dryRun
        ? { lastError: error ?? null }
        : { lastRunAt: new Date(), lastSent: sent, totalSent: { increment: sent }, totalSkipped: { increment: skipped }, lastError: error ?? null },
    }),
  ]);
  return { key, sent, skipped, candidates, error };
}

export async function runAllEnabled(byAdmin?: string) {
  const rows = await db.automation.findMany({ where: { enabled: true } });
  const results: RunResult[] = [];
  for (const r of rows) results.push(await runAutomation(r.key, { byAdmin }));
  return results;
}
