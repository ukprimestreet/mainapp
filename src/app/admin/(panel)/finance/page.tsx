import Link from "next/link";
import { Breakdown, Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn, field, labelCls } from "@/components/Dash";
import { adminCan, requirePermission } from "@/lib/auth";
import { gbp } from "@/lib/commerce";
import { resolveRange, recordedExpenses, type RangeKey } from "@/lib/growth";
import { expensesByCategory, expensesInRange, failedPayments, outstandingInvoices, refundedOrders, revenueInRange, vatStatus } from "@/lib/finance";
import { addExpense, deleteExpense, markOrderRefunded } from "../../finance-actions";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance — Admin", robots: { index: false, follow: false } };

type SP = { searchParams: Promise<{ range?: string; from?: string; to?: string; msg?: string }> };

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: "30d", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_year", label: "This year" },
];

const CATEGORY_LABEL: Record<string, string> = {
  HOSTING: "Hosting & infra", MARKETING: "Marketing", SALES: "Sales", CONTENT: "Content",
  CONTRACTORS: "Contractors", PAYMENT_FEES: "Payment processing fees", OTHER: "Other",
};

export default async function Finance({ searchParams }: SP) {
  await requirePermission("money.view");
  const canRefund = await adminCan("refunds.issue");
  const sp = await searchParams;
  const range = resolveRange(sp);

  const [revenue, vat, failed, refunds, outstanding, expenseRows, byCategory, writerAndExpensePence] = await Promise.all([
    revenueInRange(range.from, range.to),
    vatStatus(),
    failedPayments(range.from, range.to),
    refundedOrders(range.from, range.to),
    outstandingInvoices(),
    expensesInRange(range.from, range.to),
    expensesByCategory(range.from, range.to),
    recordedExpenses(range.from, range.to),
  ]);

  const contributionMargin = revenue.total - writerAndExpensePence.pence;
  const rangeHref = (key: RangeKey) => `/admin/finance?range=${key}`;
  const d = (date: Date) => date.toISOString().slice(0, 10);

  return (
    <>
      <PageHead
        title="Finance"
        subtitle="Revenue excluding VAT, costs, and the things not yet matched automatically — disclosed rather than guessed at."
        actions={<Link href="/admin/growth" className={btn("ghost")}>Growth dashboard</Link>}
      />
      {sp.msg && <Notice tone="info" title="Done">{sp.msg}</Notice>}

      <Card title="VAT">
        {vat.enabled ? (
          <p className="text-[15px]">VAT is <strong>on</strong>, charged at <strong>{vat.rateLabel}</strong>. New checkouts and renewals include it; it is tracked separately from revenue everywhere on this page.</p>
        ) : (
          <p className="text-[15px]">VAT is <strong>off</strong> (the default, pending VAT registration). Nothing is charged for it. Switch it on and set the rate in <Link href="/admin/settings" className="font-bold underline">Settings</Link> once registered.</p>
        )}
      </Card>

      <div className="mb-7 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Link key={p.key} href={rangeHref(p.key)} className={btn(range.key === p.key ? "primary" : "quiet")}>{p.label}</Link>
        ))}
      </div>

      <MetricRow cols={3}>
        <Metric label={`Revenue (ex VAT) — ${range.label}`} value={gbp(revenue.total)} icon="card" tone="accent" />
        <Metric label="VAT collected" value={gbp(revenue.vatCollected)} icon="chart" hint={vat.enabled ? "Not revenue — owed to HMRC once registered" : "0 while VAT is off"} />
        <Metric label="Contribution margin" value={gbp(contributionMargin)} icon="bolt" tone={contributionMargin < 0 ? "warn" : "dark"} hint="Revenue minus recorded expenses — not a statutory figure" />
      </MetricRow>

      <Card title="Revenue by stream" description={`${range.label}, ex VAT.`}>
        <Breakdown rows={[
          { label: "Memberships", value: revenue.memberships, tone: "yellow" },
          { label: "Featured listings", value: revenue.featured },
          { label: "Sponsorships", value: revenue.sponsorships },
          { label: "Lead credits", value: revenue.leadCredits },
        ]} />
        <ul className="mt-5 space-y-2 border-t border-line pt-4 text-[13px] text-grey">
          {revenue.untracked.map((u) => (
            <li key={u.label}><strong className="text-ink">{u.label}:</strong> not tracked — {u.note}</li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-7 lg:grid-cols-2">
        <Card title="Failed payments" description={`${range.label}.`}>
          {failed.length === 0 ? (
            <Empty title="No failed payments" icon="check" />
          ) : (
            <Table head={["Business", "Product", "Amount", "Date"]}>
              {failed.map((f) => (
                <Row key={f.id}><Cell>{f.businessName}</Cell><Cell>{f.productKey}</Cell><Cell>{gbp(f.amountPence)}</Cell><Cell className="text-grey">{f.date ? d(f.date) : "—"}</Cell></Row>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Refunds" description={`${range.label}. Only shows refunds an admin has confirmed — Stripe's refund webhook can't be auto-matched to an order yet, so it is never guessed at.`}>
          {refunds.length === 0 ? (
            <Empty title="No refunds recorded" icon="check" />
          ) : (
            <Table head={["Business", "Product", "Amount", "Date"]}>
              {refunds.map((r) => (
                <Row key={r.id}><Cell>{r.businessName}</Cell><Cell>{r.productKey}</Cell><Cell>{gbp(r.amountPence)}</Cell><Cell className="text-grey">{r.date ? d(r.date) : "—"}</Cell></Row>
              ))}
            </Table>
          )}
          {canRefund && (
            <form action={markOrderRefunded} className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
              <div className="flex-1 min-w-[220px]">
                <label htmlFor="orderId" className={labelCls}>Order id to mark refunded</label>
                <input id="orderId" name="id" required className={field} placeholder="cl..." />
              </div>
              <button className={btn("danger")}>Mark refunded</button>
            </form>
          )}
        </Card>
      </div>

      <Card title="Outstanding invoices" description="Sponsorships agreed but not yet marked invoiced.">
        {outstanding.length === 0 ? (
          <Empty title="Nothing outstanding" icon="check" />
        ) : (
          <Table head={["Sponsor", "Kind", "Amount", "Status"]}>
            {outstanding.map((o) => (
              <Row key={o.id}><Cell>{o.sponsorName}</Cell><Cell>{o.kind}</Cell><Cell>{gbp(o.pricePence)}</Cell><Cell><Chip tone="quiet">{o.status}</Chip></Cell></Row>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Operating expenses" description={`${range.label}. Separate from writer payments, which stay on the Payments page.`}>
        <Breakdown rows={byCategory.map((c) => ({ label: CATEGORY_LABEL[c.category] ?? c.category, value: c.pence }))} />
        <form action={addExpense} className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <div>
            <label htmlFor="category" className={labelCls}>Category</label>
            <select id="category" name="category" required className={field}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="description" className={labelCls}>Description</label>
            <input id="description" name="description" required className={field} placeholder="Vercel bill — November" />
          </div>
          <div>
            <label htmlFor="amountGbp" className={labelCls}>Amount (£)</label>
            <input id="amountGbp" name="amountGbp" required className={field} inputMode="decimal" placeholder="45.00" />
          </div>
          <div>
            <label htmlFor="date" className={labelCls}>Date</label>
            <input id="date" name="date" type="date" required className={field} defaultValue={d(new Date())} />
          </div>
          <div className="flex items-end gap-2">
            <input id="recurring" name="recurring" type="checkbox" className="h-5 w-5" />
            <label htmlFor="recurring" className="text-sm font-bold">Recurring</label>
          </div>
          <div className="flex items-end sm:col-span-2">
            <button className={btn()}>Record expense</button>
          </div>
        </form>

        <div className="mt-6">
          {expenseRows.length === 0 ? (
            <Empty title="No expenses recorded" icon="card" />
          ) : (
            <Table head={["Date", "Category", "Description", "Amount", "", ""]}>
              {expenseRows.map((e) => (
                <Row key={e.id}>
                  <Cell className="text-grey">{d(e.date)}</Cell>
                  <Cell>{CATEGORY_LABEL[e.category] ?? e.category}</Cell>
                  <Cell>{e.description}{e.recurring && <Chip tone="quiet">Recurring</Chip>}</Cell>
                  <Cell>{gbp(e.amountPence)}</Cell>
                  <Cell>
                    <form action={deleteExpense}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="font-bold text-grey underline hover:text-ink">Remove</button>
                    </form>
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <Card title="Export" description="CSV, for the range selected above.">
        <div className="flex flex-wrap gap-3">
          <a href={`/admin/api/finance/export?kind=orders&range=${range.key}`} className={btn("quiet")}>Export orders (CSV)</a>
          <a href={`/admin/api/finance/export?kind=expenses&range=${range.key}`} className={btn("quiet")}>Export expenses (CSV)</a>
        </div>
      </Card>
    </>
  );
}
