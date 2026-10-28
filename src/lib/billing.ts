import { createHmac, timingSafeEqual } from "crypto";
import { CREDIT_PRICE_PENCE, CREDIT_PRODUCT_KEY, MAX_CREDITS_PER_PURCHASE, MIN_CREDITS_PER_PURCHASE, creditPurchase } from "./credits";
import { db } from "./db";
import { applyVat, vatSettings } from "./vat";

/**
 * Stripe over plain HTTPS (no SDK dependency). The API base is configurable (STRIPE_API_BASE) so tests run against a local mock.
 * Needs STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET. Without them billing is "not configured" and the UI falls back to sales enquiries.
 */
const apiBase = () => (process.env.STRIPE_API_BASE ?? "https://api.stripe.com/v1").replace(/\/$/, "");
export const billingConfigured = () => !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;

/** Stripe wants application/x-www-form-urlencoded with bracketed nesting: a[b][0]=c */
export function encodeForm(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") out.push(...encodeForm(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}
async function stripe<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${apiBase()}${path}`, { method: "POST", headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body: encodeForm(params).join("&"), signal: AbortSignal.timeout(15000) });
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!r.ok) throw new Error(j.error?.message ?? `Stripe error ${r.status}`);
  return j;
}

const STRIPE_INTERVAL: Record<string, "month" | "year" | undefined> = { MONTH: "month", YEAR: "year" };

export async function createCheckout(o: { productKey: string; businessId: string; ownerId: string; ownerEmail: string; successUrl: string; cancelUrl: string }): Promise<{ url: string } | { error: string }> {
  if (!billingConfigured()) return { error: "Online payment isn't set up yet." };
  const product = await db.product.findUnique({ where: { key: o.productKey } });
  if (!product || !product.active || product.pricePence <= 0 || !product.stripePriceId) return { error: "This product isn't available to buy online." };
  // product.pricePence is always VAT-exclusive. VAT, when switched on, is added on top here — the quoted
  // price never silently changes, and nothing is charged while VAT is off (the default, pre-registration).
  const vat = applyVat(product.pricePence, await vatSettings());
  const order = await db.order.create({ data: { businessId: o.businessId, ownerId: o.ownerId, productKey: product.key, amountPence: vat.grossPence, vatPence: vat.vatPence, vatRateBp: vat.rateBp, source: "CHECKOUT" } });
  try {
    const recurring = STRIPE_INTERVAL[product.interval];
    const s = await stripe<{ id: string; url: string }>("/checkout/sessions", {
      mode: product.interval === "ONE_OFF" ? "payment" : "subscription",
      // No VAT: reuse the fixed Stripe Price exactly as before. With VAT: an ad-hoc price for the
      // VAT-inclusive amount, computed above — no Stripe Tax configuration required.
      line_items: vat.vatPence > 0
        ? { 0: { price_data: { currency: "gbp", unit_amount: vat.grossPence, product_data: { name: product.name }, ...(recurring ? { recurring: { interval: recurring } } : {}) }, quantity: 1 } }
        : { 0: { price: product.stripePriceId, quantity: 1 } },
      success_url: o.successUrl, cancel_url: o.cancelUrl, client_reference_id: order.id, customer_email: o.ownerEmail,
      metadata: { order_id: order.id, business_id: o.businessId, product_key: product.key },
      ...(product.interval !== "ONE_OFF" ? { subscription_data: { metadata: { order_id: order.id, business_id: o.businessId, product_key: product.key } } } : {}),
    });
    await db.order.update({ where: { id: order.id }, data: { stripeSessionId: s.id } });
    return { url: s.url };
  } catch (e) {
    await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    return { error: `Couldn't start checkout: ${(e as Error).message}` };
  }
}

/**
 * Buying lead credits.
 *
 * Separate from `createCheckout` because credits are not a `Product`: they are sold by the credit at a fixed
 * £1 excluding VAT, so there is no price for an administrator to set and **nothing to configure in Stripe**.
 * The line item is built here from `CREDIT_PRICE_PENCE × quantity`, which means the only thing standing
 * between a business and topping up is the two API keys.
 *
 * VAT is added on top when, and only when, it is switched on (decision D4: Prime Street must not charge VAT
 * before it is registered). The rate in force is snapshotted on the order, so a later change never rewrites
 * what somebody was charged.
 */
export async function createCreditCheckout(o: {
  businessId: string; ownerId: string; ownerEmail: string; quantity: number; successUrl: string; cancelUrl: string;
}): Promise<{ url: string } | { error: string }> {
  if (!billingConfigured()) return { error: "Card payment isn't set up yet. Email us and we will add credits by hand." };
  // Not floored: 7.9 in a whole-number field is a typo, and quietly selling somebody 7 credits for a number
  // they did not type is the sort of thing that is defensible and still wrong. Refuse and let them correct it.
  const quantity = o.quantity;
  if (!Number.isInteger(quantity) || quantity < MIN_CREDITS_PER_PURCHASE || quantity > MAX_CREDITS_PER_PURCHASE) {
    return { error: `Choose a whole number between ${MIN_CREDITS_PER_PURCHASE} and ${MAX_CREDITS_PER_PURCHASE}.` };
  }
  const business = await db.business.findUnique({ where: { id: o.businessId }, select: { id: true, name: true } });
  if (!business) return { error: "That business no longer exists." };

  const net = quantity * CREDIT_PRICE_PENCE;
  const vat = applyVat(net, await vatSettings());
  const order = await db.order.create({
    data: {
      businessId: o.businessId, ownerId: o.ownerId, productKey: CREDIT_PRODUCT_KEY, quantity,
      amountPence: vat.grossPence, vatPence: vat.vatPence, vatRateBp: vat.rateBp, source: "CHECKOUT",
    },
  });

  try {
    const s = await stripe<{ id: string; url: string }>("/checkout/sessions", {
      mode: "payment",
      line_items: {
        0: {
          // Priced per credit with a real quantity, so the Stripe receipt reads "12 × £1.00" rather than a
          // single opaque total. A business checking its card statement should recognise what it bought.
          price_data: {
            currency: "gbp",
            unit_amount: vat.vatPence > 0 ? Math.round(vat.grossPence / quantity) : CREDIT_PRICE_PENCE,
            product_data: { name: "PrimeStreet lead credit" },
          },
          quantity,
        },
      },
      success_url: o.successUrl, cancel_url: o.cancelUrl, client_reference_id: order.id, customer_email: o.ownerEmail,
      metadata: { order_id: order.id, business_id: o.businessId, product_key: CREDIT_PRODUCT_KEY, credits: String(quantity) },
    });
    await db.order.update({ where: { id: order.id }, data: { stripeSessionId: s.id } });
    return { url: s.url };
  } catch (e) {
    await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    return { error: `Couldn't start checkout: ${(e as Error).message}` };
  }
}

export async function createPortal(customerId: string, returnUrl: string): Promise<{ url: string } | { error: string }> {
  if (!billingConfigured()) return { error: "Billing isn't set up." };
  try { return { url: (await stripe<{ url: string }>("/billing_portal/sessions", { customer: customerId, return_url: returnUrl })).url }; } catch (e) { return { error: (e as Error).message }; }
}

// ---------------------------------------------------------------- webhooks
/** Verifies the `Stripe-Signature` header (t=timestamp,v1=hmac). Constant-time compare, 5-minute replay window. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => { const i = p.indexOf("="); return [p.slice(0, i), p.slice(i + 1)]; })) as Record<string, string>;
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const candidates = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  return candidates.some((c) => c.length === expected.length && timingSafeEqual(Buffer.from(c), Buffer.from(expected)));
}
export const signStripePayload = (rawBody: string, secret: string, tSec = Math.floor(Date.now() / 1000)) => `t=${tSec},v1=${createHmac("sha256", secret).update(`${tSec}.${rawBody}`).digest("hex")}`;

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);
const sec = (v: unknown) => (typeof v === "number" ? new Date(v * 1000) : null);
const MAP: Record<string, string> = { active: "ACTIVE", trialing: "ACTIVE", past_due: "PAST_DUE", unpaid: "PAST_DUE", canceled: "CANCELED", incomplete_expired: "CANCELED" };

/** Applies a verified event. Idempotent: a Stripe event id is processed once. Returns what happened (for logs/tests). */
export async function processEvent(event: { id: string; type: string; data: { object: Obj } }): Promise<string> {
  try { await db.stripeEvent.create({ data: { id: event.id, type: event.type } }); } catch { return "duplicate"; }
  const o = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      const sessionId = str(o.id), orderId = str((o.metadata as Obj | undefined)?.order_id) ?? str(o.client_reference_id);
      const order = await db.order.findFirst({ where: { OR: [{ stripeSessionId: sessionId ?? "-" }, { id: orderId ?? "-" }] } });
      if (!order) return "unknown order";
      if (o.payment_status && o.payment_status !== "paid") return "not paid yet";
      if (order.status === "PAID") return "already paid";
      await db.order.update({ where: { id: order.id }, data: { status: "PAID", paidAt: new Date() } });

      // Lead credits first, and before any product lookup: there is no Product row for them, and granting
      // from `order.quantity` is what makes the amount charged and the credits granted the same fact.
      // `creditPurchase` is idempotent on the order, so a replayed webhook cannot grant twice.
      if (order.productKey === CREDIT_PRODUCT_KEY) {
        const granted = await creditPurchase(order.businessId, order.quantity, order.id, `Bought ${order.quantity} lead credit(s)`);
        return granted.ok ? `${order.quantity} credits granted` : `credits not granted: ${granted.reason}`;
      }

      const product = await db.product.findUnique({ where: { key: order.productKey } });
      if (!product) return "paid, product missing";
      if (product.kind === "PREMIUM") {
        const end = new Date(Date.now() + (product.interval === "YEAR" ? 366 : 31) * 86400_000); // provisional; invoice.paid sets the real period end
        await db.subscription.upsert({
          where: { stripeSubscriptionId: str(o.subscription) ?? `order:${order.id}` },
          create: { businessId: order.businessId, productKey: product.key, status: "ACTIVE", provider: "STRIPE", stripeCustomerId: str(o.customer), stripeSubscriptionId: str(o.subscription) ?? `order:${order.id}`, currentPeriodEnd: end },
          update: { status: "ACTIVE", currentPeriodEnd: end },
        });
        return "premium activated";
      }
      if (product.kind === "FEATURED") {
        const b = await db.business.findUnique({ where: { id: order.businessId } });
        if (!b || b.isSample) return "paid, business not promotable";
        await db.campaign.create({ data: { kind: "FEATURED", source: "ORDER", orderId: order.id, businessId: b.id, categoryId: b.categoryId, locationId: b.locationId, endsAt: new Date(Date.now() + (product.durationDays ?? 30) * 86400_000) } });
        return "featured campaign created";
      }
      return "paid";
    }
    case "invoice.paid": {
      const subId = str(o.subscription); if (!subId) return "no subscription";
      const end = sec(((o.lines as Obj | undefined)?.data as Obj[] | undefined)?.[0] && (((o.lines as Obj).data as Obj[])[0].period as Obj | undefined)?.end);
      const sub = await db.subscription.findFirst({ where: { stripeSubscriptionId: subId } });
      const r = await db.subscription.updateMany({ where: { stripeSubscriptionId: subId }, data: { status: "ACTIVE", ...(end ? { currentPeriodEnd: end } : {}) } });
      if (!r.count || !sub) return "unknown subscription";
      // The first invoice of a new subscription is already recorded via checkout.session.completed.
      // Everything after that (billing_reason subscription_cycle/subscription_update) is a renewal that
      // previously went unrecorded — Order only ever had the initial payment, undercounting real revenue.
      if (str(o.billing_reason) && o.billing_reason !== "subscription_create") {
        const invoiceId = str(o.id);
        const already = invoiceId ? await db.order.findFirst({ where: { stripeSessionId: `inv:${invoiceId}` } }) : null;
        if (already) return "renewal already recorded";
        const product = await db.product.findUnique({ where: { key: sub.productKey } });
        if (!product) return "renewed, product missing";
        const vat = applyVat(product.pricePence, await vatSettings());
        await db.order.create({
          data: {
            businessId: sub.businessId, productKey: product.key, amountPence: vat.grossPence, vatPence: vat.vatPence, vatRateBp: vat.rateBp,
            source: "RENEWAL", status: "PAID", paidAt: new Date(), stripeSessionId: invoiceId ? `inv:${invoiceId}` : undefined,
          },
        });
        return "renewal recorded";
      }
      return "period extended";
    }
    case "invoice.payment_failed": {
      const subId = str(o.subscription); if (!subId) return "no subscription";
      await db.subscription.updateMany({ where: { stripeSubscriptionId: subId }, data: { status: "PAST_DUE" } });
      return "marked past due";
    }
    case "customer.subscription.updated": {
      const id = str(o.id); if (!id) return "no id";
      await db.subscription.updateMany({ where: { stripeSubscriptionId: id }, data: { status: MAP[str(o.status) ?? ""] ?? "ACTIVE", cancelAtPeriodEnd: o.cancel_at_period_end === true, ...(sec(o.current_period_end) ? { currentPeriodEnd: sec(o.current_period_end)! } : {}) } });
      return "subscription updated";
    }
    case "customer.subscription.deleted": {
      const id = str(o.id); if (!id) return "no id";
      await db.subscription.updateMany({ where: { stripeSubscriptionId: id }, data: { status: "CANCELED" } });
      return "subscription canceled";
    }
    case "checkout.session.expired": {
      const sessionId = str(o.id);
      if (sessionId) await db.order.updateMany({ where: { stripeSessionId: sessionId, status: "PENDING" }, data: { status: "FAILED" } });
      return "session expired";
    }
    case "charge.refunded": {
      // refunds are matched by payment intent -> order is not tracked here; admins end campaigns / revoke from the console
      return "refund noted (handle in admin)";
    }
    default: return "ignored";
  }
}
