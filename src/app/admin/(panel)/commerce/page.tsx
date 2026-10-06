import { CommerceNav } from "@/components/CommerceNav";
import { billingConfigured } from "@/lib/billing";
import { campaignTotals, gbp, monthlyPence } from "@/lib/commerce";
import { db } from "@/lib/db";
import { SITE } from "@/lib/constants";
import { saveProduct } from "../../commerce-actions";

const field = "min-h-10 w-full rounded-lg border-2 border-line px-2 text-sm";
export default async function Commerce({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const now = new Date();
  const [products, subs, paid, deals, camps, newEnq] = await Promise.all([
    db.product.findMany({ orderBy: { sortOrder: "asc" } }),
    db.subscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE"] } } }),
    db.order.aggregate({ where: { status: "PAID" }, _sum: { amountPence: true }, _count: true }),
    db.sponsorship.findMany({ where: { status: { in: ["ACTIVE", "DONE"] } } }),
    db.campaign.findMany({ where: { status: "ACTIVE", endsAt: { gte: now } }, include: { stats: true } }),
    db.salesEnquiry.count({ where: { status: "NEW" } }),
  ]);
  const price = new Map(products.map((p) => [p.key, p]));
  const live = subs.filter((s) => s.status === "ACTIVE" ? !s.currentPeriodEnd || s.currentPeriodEnd > now : true);
  const mrr = live.reduce((a, s) => a + (price.get(s.productKey) ? monthlyPence(price.get(s.productKey)!) : 0), 0);
  const t = campaignTotals(camps.flatMap((c) => c.stats));
  const configured = billingConfigured();
  return (
    <>
      <CommerceNav active="/admin/commerce" msg={msg} />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-mist p-4"><p className="text-sm font-bold">Active premium plans</p><p className="font-display text-3xl font-extrabold">{live.length}</p></div>
        <div className="rounded-xl bg-mist p-4"><p className="text-sm font-bold">Recurring revenue / month</p><p className="font-display text-3xl font-extrabold">{gbp(mrr)}</p></div>
        <div className="rounded-xl bg-mist p-4"><p className="text-sm font-bold">Online sales ({paid._count})</p><p className="font-display text-3xl font-extrabold">{gbp(paid._sum.amountPence ?? 0)}</p></div>
        <div className="rounded-xl bg-mist p-4"><p className="text-sm font-bold">Sponsorship deals</p><p className="font-display text-3xl font-extrabold">{gbp(deals.reduce((a, d) => a + d.pricePence, 0))}</p></div>
        <div className="rounded-xl bg-mist p-4"><p className="text-sm font-bold">Running campaigns</p><p className="font-display text-3xl font-extrabold">{camps.length}</p></div>
        <div className="rounded-xl bg-mist p-4"><p className="text-sm font-bold">Impressions / clicks</p><p className="font-display text-3xl font-extrabold">{t.impressions} / {t.clicks}</p></div>
        <div className="rounded-xl bg-mist p-4"><p className="text-sm font-bold">Click-through rate</p><p className="font-display text-3xl font-extrabold">{t.ctr}%</p></div>
        <div className="rounded-xl bg-mist p-4"><p className="text-sm font-bold">New enquiries</p><p className="font-display text-3xl font-extrabold">{newEnq}</p></div>
      </div>
      <section className={`mb-8 rounded-xl border-2 p-4 text-sm ${configured ? "border-ink" : "border-red-700"}`}><p className="font-bold">{configured ? "✓ Online payments (Stripe) configured." : "⚠ Online payments are NOT configured."}</p>
        <p className="mt-1">{configured ? <>Webhook endpoint to register in Stripe: <code className="rounded bg-mist px-1">{SITE.url}/api/stripe/webhook</code> (events: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated/deleted, checkout.session.expired).</> : <>Set <code>STRIPE_SECRET_KEY</code> and <code>STRIPE_WEBHOOK_SECRET</code>. Until then owners use “Request this” and you arrange invoices; grant plans under <em>Premium plans</em>. Amounts are ex VAT: add VAT handling/invoicing before taking real money.</>}</p></section>

      <h2 className="mb-1 text-xl font-extrabold">Products</h2>
      <p className="mb-4 max-w-3xl text-sm text-grey">Prices below are <strong>placeholders at £0 and inactive</strong>. Nothing is sold until you set real prices and tick Active. For online checkout create the matching Price in Stripe and paste its id.</p>
      <ul className="space-y-4">{products.map((p) => (
        <li key={p.id} className="rounded-2xl border border-line p-4"><form action={saveProduct} className="grid gap-3 md:grid-cols-6"><input type="hidden" name="id" value={p.id} />
          <div className="md:col-span-2"><label htmlFor={`n-${p.id}`} className="block text-xs font-bold">{p.kind} · {p.key}</label><input id={`n-${p.id}`} name="name" defaultValue={p.name} className={field} /></div>
          <div><label htmlFor={`p-${p.id}`} className="block text-xs font-bold">Price £ (ex VAT, {p.interval.toLowerCase().replace("_", "-")})</label><input id={`p-${p.id}`} name="priceGbp" defaultValue={(p.pricePence / 100).toFixed(2)} inputMode="decimal" className={field} /></div>
          {p.kind === "FEATURED" ? <div><label htmlFor={`d-${p.id}`} className="block text-xs font-bold">Days</label><input id={`d-${p.id}`} name="durationDays" defaultValue={p.durationDays ?? 30} className={field} /></div> : <div />}
          <div><label htmlFor={`s-${p.id}`} className="block text-xs font-bold">Stripe price id</label><input id={`s-${p.id}`} name="stripePriceId" defaultValue={p.stripePriceId ?? ""} placeholder="price_…" className={field} /></div>
          <label className="flex items-end gap-2 pb-2 font-bold"><input type="checkbox" name="active" defaultChecked={p.active} className="h-5 w-5" /> Active</label>
          <div className="md:col-span-5"><label htmlFor={`x-${p.id}`} className="block text-xs font-bold">Description (public)</label><input id={`x-${p.id}`} name="description" defaultValue={p.description} className={field} /></div>
          <div className="flex items-end"><button className="min-h-10 rounded-full bg-ink px-5 font-bold text-yellow">Save</button></div></form></li>))}</ul>
    </>
  );
}
