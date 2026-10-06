import { NextResponse } from "next/server";
import { processEvent, verifyStripeSignature } from "@/lib/billing";

export const dynamic = "force-dynamic";

/** Stripe → us. The RAW body must be used for signature verification, so we read text() and parse afterwards. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  if (!event.id || !event.type || !event.data?.object) return NextResponse.json({ error: "Malformed event" }, { status: 400 });
  try {
    const result = await processEvent({ id: event.id, type: event.type, data: { object: event.data.object } });
    return NextResponse.json({ received: true, result });
  } catch (e) {
    console.error("stripe webhook failed", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 }); // Stripe will retry
  }
}
