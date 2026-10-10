import { Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requireAuthor } from "@/lib/author-auth";
import { gbp } from "@/lib/commerce";
import { db } from "@/lib/db";
import Link from "next/link";
import { payeeState } from "@/lib/payee";
import { submitInvoice } from "../../writer-actions";

export const dynamic = "force-dynamic";

const STATUS = {
  DUE: { label: "Ready to invoice", tone: "review" as const },
  SUBMITTED: { label: "Invoiced", tone: "quiet" as const },
  APPROVED: { label: "Approved for payment", tone: "good" as const },
  PAID: { label: "Paid", tone: "live" as const },
};

export default async function Payments({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await requireAuthor();
  const { msg } = await searchParams;
  const rows = await db.writerPayment.findMany({ where: { authorId: me.id }, orderBy: { createdAt: "desc" } });
  const due = rows.filter((r) => r.status === "DUE");
  const outstanding = rows.filter((r) => r.status !== "PAID").reduce((n, r) => n + r.amountPence, 0);
  const paid = rows.filter((r) => r.status === "PAID").reduce((n, r) => n + r.amountPence, 0);
  const payee = payeeState(me);

  return (
    <>
      <PageHead
        title="Payments"
        subtitle="What you are owed, what you have invoiced, and what has been paid. Fees are always agreed in writing before the work starts."
      />
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      {payee.payable ? (
        <Notice tone="good" title="We can pay you">
          Paying into the account ending <strong>{payee.masked?.replace(/•/g, "")}</strong>.{" "}
          <Link href="/write/payments/details" className="font-bold underline">Change your payment details</Link>.
        </Notice>
      ) : (
        <Notice tone="warn" title="We have no way to pay you yet">
          Still needed: {payee.missing.join(", ")}.{" "}
          <Link href="/write/payments/details" className="font-bold underline">Add your payment details</Link> — it takes a
          minute, and nothing is lost in the meantime: anything owed stays owed.
        </Notice>
      )}

      <MetricRow cols={3}>
        <Metric label="Ready to invoice" value={gbp(due.reduce((n, r) => n + r.amountPence, 0))} icon="card" tone={due.length ? "accent" : "plain"} hint={`${due.length} ${due.length === 1 ? "item" : "items"}`} />
        <Metric label="Outstanding" value={gbp(outstanding)} icon="chart" hint="Invoiced or approved, not yet paid" />
        <Metric label="Paid to date" value={gbp(paid)} icon="check" tone="dark" />
      </MetricRow>

      {due.length > 0 && (
        <Card title="Raise an invoice" description="Tick what you are billing for and give it your own reference.">
          <form action={submitInvoice} className="space-y-4">
            <ul className="space-y-2">
              {due.map((r) => (
                <li key={r.id}>
                  <label className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-ink">
                    <input type="checkbox" name="payment" value={r.id} defaultChecked className="h-5 w-5" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold [overflow-wrap:anywhere]">{r.description}</span>
                      <span className="block text-[12px] text-grey">Added {fmtDate(r.createdAt)}</span>
                    </span>
                    <span className="font-display font-extrabold tabular-nums">{gbp(r.amountPence)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="max-w-xs">
              <label className={labelCls} htmlFor="reference">Your invoice reference</label>
              <input id="reference" name="reference" required className={field} placeholder="INV-2026-014" />
            </div>
            <button className={btn()}>Submit invoice</button>
          </form>
        </Card>
      )}

      <Card title="History">
        {rows.length === 0 ? (
          <Empty title="Nothing recorded yet" icon="card">
            When an editor agrees a fee for a commission, it appears here ready to invoice.
          </Empty>
        ) : (
          <Table head={["What for", "Amount", "Status", "Reference", "Added", "Paid"]}>
            {rows.map((r) => {
              const st = STATUS[r.status as keyof typeof STATUS] ?? { label: r.status, tone: "quiet" as const };
              return (
                <Row key={r.id}>
                  <Cell className="font-semibold [overflow-wrap:anywhere]">{r.description}</Cell>
                  <Cell className="font-display font-extrabold tabular-nums">{gbp(r.amountPence)}</Cell>
                  <Cell><Chip tone={st.tone}>{st.label}</Chip></Cell>
                  <Cell className="text-grey">{r.reference ?? "—"}</Cell>
                  <Cell className="whitespace-nowrap text-grey">{fmtDate(r.createdAt)}</Cell>
                  <Cell className="whitespace-nowrap text-grey">{r.paidAt ? fmtDate(r.paidAt) : "—"}</Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title="How payment works">
        <ul className="space-y-2 text-[14px] text-grey">
          <li><strong className="text-ink">Fees are agreed before the work.</strong> If a commission has no fee on it, ask an editor before you start.</li>
          <li><strong className="text-ink">Invoice when you are ready.</strong> Tick several items together if that suits you.</li>
          <li><strong className="text-ink">Readership does not change your fee.</strong> You are paid for the work, not the traffic.</li>
        </ul>
      </Card>
    </>
  );
}
