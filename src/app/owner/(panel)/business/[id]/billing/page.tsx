import Link from "next/link";
import { Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requireBusiness } from "@/lib/owner";
import { gbp, getEntitlements } from "@/lib/commerce";
import { billingConfigured } from "@/lib/billing";
import { db } from "@/lib/db";
import { openBillingPortal } from "../../../../commerce-actions";

export const dynamic = "force-dynamic";

const STATUS = {
  ACTIVE: { label: "Active", tone: "live" as const },
  PAST_DUE: { label: "Payment failing", tone: "bad" as const },
  CANCELED: { label: "Ended", tone: "quiet" as const },
};

export default async function Billing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params; const { msg } = await searchParams;
  const { business } = await requireBusiness(id);
  const [ent, subs, orders, products] = await Promise.all([
    getEntitlements(id),
    db.subscription.findMany({ where: { businessId: id }, orderBy: { createdAt: "desc" } }),
    db.order.findMany({ where: { businessId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.product.findMany(),
  ]);
  const name = (k: string) => products.find((p) => p.key === k)?.name ?? k;
  const current = subs.find((s) => s.status === "ACTIVE" || s.status === "PAST_DUE");
  const paid = orders.filter((o) => o.status === "PAID");
  const spent = paid.reduce((n, o) => n + o.amountPence, 0);

  return (
    <>
      <PageHead
        title="Billing"
        subtitle="What you are paying, what you have paid, and how to stop. No surprises and no hoops."
        back={{ href: `/owner/business/${id}`, label: business.name }}
      />
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      {current?.status === "PAST_DUE" && (
        <Notice tone="warn" title="Payment is failing">
          We could not take your last payment. Your Premium features stay on for a short grace period while you fix it —
          usually it is just an expired card.
        </Notice>
      )}

      <MetricRow cols={3}>
        <Metric label="Current plan" value={current ? name(current.productKey) : "Free"} icon="card" tone={ent.premium ? "accent" : "plain"} hint={current ? STATUS[current.status as keyof typeof STATUS]?.label : "No subscription"} />
        <Metric label="Next payment" value={current?.currentPeriodEnd ? fmtDate(current.currentPeriodEnd) : "—"} icon="chart" hint={current?.cancelAtPeriodEnd ? "Ends then, no renewal" : current ? "Renews automatically" : undefined} />
        <Metric label="Paid to date" value={gbp(spent)} icon="check" hint={`${paid.length} ${paid.length === 1 ? "payment" : "payments"}`} />
      </MetricRow>

      <Card title="Manage your subscription">
        {!current ? (
          <>
            <p className="text-[15px] text-grey">You are on the free profile. Nothing is being charged.</p>
            <Link href={`/owner/business/${id}/promote`} className={`${btn()} mt-4`}>See what Premium adds</Link>
          </>
        ) : current.provider === "STRIPE" && billingConfigured() ? (
          <>
            <p className="text-[15px] text-grey">
              Update your card, download invoices or cancel. Cancelling keeps Premium until the end of the period you have paid for.
            </p>
            <form action={openBillingPortal} className="mt-4">
              <input type="hidden" name="businessId" value={id} />
              <button className={btn()}>Manage billing and invoices</button>
            </form>
          </>
        ) : (
          <>
            <p className="text-[15px] text-grey">
              This plan was arranged directly with our team rather than through online checkout. Email{" "}
              <strong>hello@primestreet.uk</strong> to change or cancel it and a person will sort it out.
            </p>
          </>
        )}
      </Card>

      <Card title="Payment history">
        {orders.length === 0 ? (
          <Empty title="Nothing charged yet" icon="card">Any payment you make appears here with its invoice.</Empty>
        ) : (
          <Table head={["What", "Amount", "Status", "When"]}>
            {orders.map((o) => (
              <Row key={o.id}>
                <Cell className="font-semibold">{name(o.productKey)}</Cell>
                <Cell className="font-display font-extrabold tabular-nums">{gbp(o.amountPence)}</Cell>
                <Cell>
                  <Chip tone={o.status === "PAID" ? "live" : o.status === "FAILED" ? "bad" : "quiet"}>{o.status.toLowerCase()}</Chip>
                </Cell>
                <Cell className="whitespace-nowrap text-grey">{fmtDate(o.createdAt)}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Card title="What you keep if you stop">
        <ul className="space-y-2.5 text-[15px]">
          <li><strong>Your listing, reviews, rating and search position are untouched.</strong> They were never part of what you paid for.</li>
          <li><strong>Your photos and offer text are saved, not deleted.</strong> If you come back they reappear as you left them.</li>
          <li><strong>What stops:</strong> the gallery, the offer banner, the enquiry form and click analytics.</li>
        </ul>
      </Card>
    </>
  );
}
