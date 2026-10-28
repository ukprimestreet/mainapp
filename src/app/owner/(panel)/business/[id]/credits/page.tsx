import Link from "next/link";
import { Card, Notice, PageHead, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { OwnerTabs } from "@/components/OwnerTabs";
import { billingConfigured } from "@/lib/billing";
import { gbp } from "@/lib/commerce";
import {
  CREDIT_PRICE_PENCE, LOW_BALANCE_THRESHOLD, MAX_CREDITS_PER_PURCHASE, MIN_CREDITS_PER_PURCHASE,
  creditBalance, creditHistory,
} from "@/lib/credits";
import { db } from "@/lib/db";
import { MAX_RECIPIENTS } from "@/lib/leads";
import { requireBusiness } from "@/lib/owner";
import { applyVat, formatRate, vatSettings } from "@/lib/vat";
import { buyCredits } from "../../../../business-actions";

export const dynamic = "force-dynamic";

const PACKS = [10, 25, 50] as const;

const KIND: Record<string, string> = {
  FREE_GRANT: "Welcome credits",
  PURCHASE: "Bought",
  CONSUMPTION: "Job request",
  REFUND: "Refund",
  ADJUSTMENT: "Adjusted by PrimeStreet",
  REVERSAL: "Put back",
};

/**
 * Lead credits: what they are for, how many are left, and buying more.
 *
 * This page exists because the rest of the system promised it. `/register` and the welcome email both say
 * "credits are £1 each after the first five", and until now there was no way to buy one: a business got five
 * leads and then silently stopped being matched. The matcher excluded it with a recorded reason, which was
 * correct and completely invisible to them.
 *
 * The price is £1 per credit, excluding VAT, and VAT is added only when it legally applies — Prime Street
 * must not charge VAT before it is registered (decision D4). The figures below come from the same functions
 * that build the Stripe line item, so what is quoted here is what is charged.
 */
export default async function Credits({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; bought?: string; cancelled?: string }>;
}) {
  const { id } = await params;
  const { msg, bought, cancelled } = await searchParams;
  const { business } = await requireBusiness(id);

  const [balance, history, vat, orders, assignments] = await Promise.all([
    creditBalance(id),
    creditHistory(id, 40),
    vatSettings(),
    db.order.findMany({ where: { businessId: id, productKey: "lead-credits" }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.leadAssignment.count({ where: { businessId: id, creditCharged: true, status: { not: "REVERSED" } } }),
  ]);

  const quote = (n: number) => applyVat(n * CREDIT_PRICE_PENCE, vat);
  const canBuy = billingConfigured();

  return (
    <>
      <OwnerTabs id={business.id} name={business.name} active="credits" />

      <PageHead
        title="Lead credits"
        subtitle={`One credit per job request we send you. Your listing is free with or without them.`}
      />

      {bought && (
        <Notice tone="good" title="Thank you">
          Your payment went through. Credits appear here the moment our payment provider confirms it — usually
          seconds, occasionally a minute. Nothing else is needed from you.
        </Notice>
      )}
      {cancelled && <Notice tone="info" title="Nothing was charged">You came back without paying. Your balance is unchanged.</Notice>}
      {msg && <Notice tone="info" title="Note">{msg}</Notice>}

      {balance === 0 && (
        <Notice tone="warn" title="You are not receiving job requests">
          At zero credits, new requests in your areas go to other businesses. Your listing is unaffected and
          stays free — credits are only for receiving job requests.
        </Notice>
      )}
      {balance > 0 && balance <= LOW_BALANCE_THRESHOLD && (
        <Notice tone="warn" title={`${balance} credit${balance === 1 ? "" : "s"} left`}>
          At zero, requests go to somebody else instead.
        </Notice>
      )}

      <Card title="Where you stand">
        <dl className="grid gap-4 text-[15px] sm:grid-cols-3">
          <div>
            <dt className="font-bold">Credits left</dt>
            <dd className="font-display text-3xl font-extrabold">{balance}</dd>
          </div>
          <div>
            <dt className="font-bold">Jobs you have paid for</dt>
            <dd className="font-display text-3xl font-extrabold">{assignments}</dd>
            <dd className="text-[13px] text-grey">all time</dd>
          </div>
          <div>
            <dt className="font-bold">Price</dt>
            <dd className="font-display text-3xl font-extrabold">{gbp(CREDIT_PRICE_PENCE)}</dd>
            <dd className="text-[13px] text-grey">
              per credit{vat.enabled ? `, plus VAT at ${formatRate(vat.rateBp)}` : ", and no VAT applies"}
            </dd>
          </div>
        </dl>
        <p className="mt-5 text-[14px] text-grey">
          One credit is charged when we send you a job request — never for a job you were not sent, and never
          twice for the same one. Each job goes to a maximum of {MAX_RECIPIENTS} businesses. If we take a job
          back because you did not open it, the credit comes back too.
        </p>
      </Card>

      <Card title="Buy credits" description={vat.enabled ? `Prices include VAT at ${formatRate(vat.rateBp)}.` : "No VAT applies: PrimeStreet is not VAT-registered."}>
        {!canBuy ? (
          <p className="text-[15px]">
            Card payment is not switched on yet. Email us and we will add credits to your account by hand —
            you will not be charged until it is.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {PACKS.map((n) => (
                <form key={n} action={buyCredits}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="quantity" value={n} />
                  <button className="w-full rounded-2xl border-2 border-ink p-5 text-left transition hover:bg-yellow">
                    <span className="block font-display text-2xl font-extrabold">{n} credits</span>
                    <span className="block text-[15px]">{gbp(quote(n).grossPence)}</span>
                    <span className="block text-[13px] text-grey">
                      {n} jobs{quote(n).vatPence > 0 ? ` · includes ${gbp(quote(n).vatPence)} VAT` : ""}
                    </span>
                  </button>
                </form>
              ))}
            </div>

            <form action={buyCredits} className="mt-6 flex flex-wrap items-end gap-3 border-t border-line pt-6">
              <input type="hidden" name="businessId" value={business.id} />
              <div>
                <label htmlFor="quantity" className={labelCls}>Or another number</label>
                <input
                  id="quantity" name="quantity" type="number" inputMode="numeric"
                  min={MIN_CREDITS_PER_PURCHASE} max={MAX_CREDITS_PER_PURCHASE} defaultValue={MIN_CREDITS_PER_PURCHASE}
                  className={`${field} max-w-[9rem]`}
                />
                <p className="mt-1.5 text-[13px] text-grey">Between {MIN_CREDITS_PER_PURCHASE} and {MAX_CREDITS_PER_PURCHASE}.</p>
              </div>
              <button className={btn()}>Buy</button>
            </form>

            <p className="mt-5 text-[13px] text-grey">
              You are taken to our payment provider to pay by card. We never see or store your card details.
              Credits never expire, and nothing you pay for changes your rating, your reviews or where you
              appear in search.
            </p>
          </>
        )}
      </Card>

      <Card title="Everything that has moved" description="Every credit in and out, with the reason. This is the ledger, not a summary of it.">
        {history.length === 0 ? (
          <p className="text-[15px] text-grey">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-bold">{KIND[t.kind] ?? t.kind}</p>
                  <p className="text-[13px] text-grey [overflow-wrap:anywhere]">{t.reason}</p>
                </div>
                <div className="text-right">
                  <p className={`font-display text-lg font-extrabold ${t.delta > 0 ? "" : "text-grey"}`}>
                    {t.delta > 0 ? "+" : ""}{t.delta}
                  </p>
                  <p className="text-[12px] text-grey">{fmtDate(t.createdAt)} · left {t.balanceAfter}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {orders.length > 0 && (
        <Card title="Payments" description="Receipts come from our payment provider by email.">
          <ul className="divide-y divide-line text-[15px]">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                <span>{o.quantity} credit{o.quantity === 1 ? "" : "s"} · {fmtDate(o.createdAt)}</span>
                <span className="font-bold">
                  {gbp(o.amountPence)}{o.vatPence > 0 ? ` (incl. ${gbp(o.vatPence)} VAT)` : ""} ·{" "}
                  {o.status === "PAID" ? "paid" : o.status === "PENDING" ? "not completed" : o.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mb-10 text-[14px] text-grey">
        Questions about a charge? <Link href={`/owner/business/${id}/leads`} className="underline">Your job requests</Link> show
        what each credit was spent on. If something looks wrong, email us with the reference and we will answer
        from the record.
      </p>
    </>
  );
}
