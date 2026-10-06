import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";

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

export async function createCheckout(o: { productKey: string; businessId: string; ownerId: string; ownerEmail: string; successUrl: string; cancelUrl: string }): Promise<{ url: string } | { error: string }> {
  if (!billingConfigured()) return { error: "Online payment isn't set up yet." };
  const product = await db.product.findUnique({ where: { key: o.productKey } });
  if (!product || !product.active || product.pricePence <= 0 || !product.stripePriceId) return { error: "This product isn't available to buy online." };
  const order = await db.order.create({ data: { businessId: o.businessId, ownerId: o.ownerId, productKey: product.key, amountPence: product.pricePence } });
  try {
    const s = await stripe<{ id: string; url: string }>("/checkout/sessions", {
      mode: product.interval === "ONE_OFF" ? "payment" : "subscription",
      line_items: { 0: { price: product.stripePriceId, quantity: 1 } },
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
      const r = await db.subscription.updateMany({ where: { stripeSubscriptionId: subId }, data: { status: "ACTIVE", ...(end ? { currentPeriodEnd: end } : {}) } });
      return r.count ? "period extended" : "unknown subscription";
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
