import { OwnerTabs } from "@/components/OwnerTabs";
import { fmtDate } from "@/components/Cards";
import { billingConfigured } from "@/lib/billing";
import { PREMIUM_FEATURES, campaignTotals, clicks30, getEntitlements, gbp, parseGallery } from "@/lib/commerce";
import { db } from "@/lib/db";
import { requireBusiness } from "@/lib/owner";
import { openBillingPortal } from "../../../../commerce-actions";
import { BuyForm } from "./BuyForm";
import { PremiumSettingsForm } from "./PremiumSettingsForm";

const INTERVAL: Record<string, string> = { MONTH: "/month", YEAR: "/year", ONE_OFF: "" };

export default async function Promote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string; cancelled?: string; msg?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { business: b } = await requireBusiness(id);
  const [ent, products, campaigns, clicks, orders] = await Promise.all([
    getEntitlements(b.id),
    db.product.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.campaign.findMany({ where: { businessId: b.id, kind: "FEATURED" }, orderBy: { createdAt: "desc" }, include: { stats: true }, take: 10 }),
    clicks30(b.id), db.order.findMany({ where: { businessId: b.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const online = billingConfigured();
  const stripeSub = await db.subscription.findFirst({ where: { businessId: b.id, provider: "STRIPE", stripeCustomerId: { not: null } } });
  return (
    <>
      <OwnerTabs id={b.id} name={b.name} active="promote" />
      {sp.paid && <p role="status" className="mb-4 rounded-lg border-2 border-ink bg-yellow px-4 py-2 font-bold">✓ Thanks! Your payment is being confirmed — your plan appears here within a minute.</p>}
      {sp.cancelled && <p role="status" className="mb-4 rounded-lg border-2 border-line px-4 py-2 font-bold">Checkout cancelled — nothing was charged.</p>}
      {sp.msg && <p role="status" className="mb-4 rounded-lg bg-yellow px-4 py-2 font-bold">{sp.msg}</p>}
      <p role="note" className="mb-8 max-w-3xl rounded-xl border-2 border-ink bg-yellow-soft p-4 text-sm font-semibold">Paying PrimeStreet never changes your rating, your reviews or our editorial coverage. Paid placements are always labelled “Sponsored”.</p>

      <section aria-labelledby="plan" className="mb-10"><h2 id="plan" className="mb-2 text-2xl font-extrabold">Your plan</h2>
        {ent.premium ? (
          <div className="rounded-2xl border-2 border-ink p-5"><p className="font-display text-xl font-extrabold">Premium {ent.status === "PAST_DUE" && <span className="text-red-700">· payment overdue</span>}</p>
            <p className="text-grey">{ent.until ? `${ent.cancelAtPeriodEnd ? "Ends" : "Renews"} on ${fmtDate(ent.until)}` : "No end date"}{ent.source === "MANUAL" ? " · arranged with our team" : ""}</p>
            {stripeSub && online && <form action={openBillingPortal} className="mt-3"><input type="hidden" name="id" value={b.id} /><button className="min-h-11 rounded-full border-2 border-ink px-5 font-bold">Manage billing / cancel</button></form>}</div>
        ) : <div className="rounded-2xl border border-line p-5"><p className="font-display text-xl font-extrabold">Free profile</p><p className="text-grey">Everything you need to be found, claimed and reviewed is free — always.</p></div>}
      </section>

      <section aria-labelledby="products" className="mb-10"><h2 id="products" className="mb-2 text-2xl font-extrabold">Upgrade &amp; promote</h2>
        <ul className="mb-3 list-disc pl-5 text-sm">{PREMIUM_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
        {products.length === 0 ? <p className="rounded-xl border-2 border-dashed border-line p-5 text-grey">Paid options aren&apos;t open yet. <a className="font-bold underline" href="/advertise">Tell us what you&apos;re interested in</a>.</p> : (
          <ul className="grid gap-4 md:grid-cols-2">{products.map((p) => (
            <li key={p.key} className="rounded-2xl border-2 border-ink p-5"><h3 className="font-display text-xl font-extrabold">{p.name}</h3><p className="font-extrabold">{gbp(p.pricePence)}<span className="font-normal text-grey">{INTERVAL[p.interval]} + VAT</span></p><p className="mb-3 mt-1 text-sm text-grey">{p.description}</p>
              <BuyForm id={b.id} product={p.key} online={online && !!p.stripePriceId} disabled={p.kind === "PREMIUM" && ent.premium} /></li>))}</ul>
        )}
        {orders.length > 0 && <p className="mt-3 text-sm text-grey">Recent orders: {orders.map((o) => `${o.productKey} (${o.status.toLowerCase()})`).join(", ")}</p>}
      </section>

      <section aria-labelledby="settings" className="mb-10"><h2 id="settings" className="mb-2 text-2xl font-extrabold">Premium features</h2>
        {ent.premium ? <PremiumSettingsForm id={b.id} initial={{ gallery: parseGallery(b.gallery).join("\n"), promoText: b.promoText ?? "", promoUrl: b.promoUrl ?? "" }} />
          : <p className="rounded-xl border-2 border-dashed border-line p-5 text-grey">Photo gallery, an offer banner and an enquiry form unlock with Premium.</p>}
      </section>

      <section aria-labelledby="analytics" className="mb-10"><h2 id="analytics" className="mb-2 text-2xl font-extrabold">Interest in your business (30 days)</h2>
        {ent.premium ? <dl className="grid gap-3 sm:grid-cols-3">{(["website", "phone", "directions"] as const).map((k) => <div key={k} className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold capitalize">{k} clicks</dt><dd className="font-display text-3xl font-extrabold">{clicks[k]}</dd></div>)}</dl>
          : <p className="rounded-xl border-2 border-dashed border-line p-5 text-grey">Premium shows how many people tapped your website, phone number and directions.</p>}
      </section>

      <section aria-labelledby="campaigns"><h2 id="campaigns" className="mb-2 text-2xl font-extrabold">Your featured campaigns</h2>
        {campaigns.length === 0 ? <p className="text-grey">No featured campaigns yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-ink"><th className="py-2">Status</th><th>Runs</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr></thead>
            <tbody>{campaigns.map((c) => { const t = campaignTotals(c.stats); return <tr key={c.id} className="border-b border-line"><td className="py-2">{c.status === "ACTIVE" && c.endsAt < new Date() ? "ENDED" : c.status}</td><td>{fmtDate(c.startsAt)} → {fmtDate(c.endsAt)}</td><td>{t.impressions}</td><td>{t.clicks}</td><td>{t.ctr}%</td></tr>; })}</tbody></table></div>
        )}</section>
    </>
  );
}
