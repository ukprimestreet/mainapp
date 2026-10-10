import { Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { gbp } from "@/lib/commerce";
import { db } from "@/lib/db";
import { addPayment, approvePayments, markPaid, queryInvoice, revealBankDetails } from "../../editorial-money-actions";
import { payeeState, readBank, unpayableWithMoneyDue } from "@/lib/payee";
import { formatSortCode } from "@/lib/secretbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Writer payments — Admin", robots: { index: false, follow: false } };

const STATUS = {
  DUE: { label: "Not yet invoiced", tone: "quiet" as const },
  SUBMITTED: { label: "Awaiting approval", tone: "review" as const },
  APPROVED: { label: "Approved, unpaid", tone: "good" as const },
  PAID: { label: "Paid", tone: "live" as const },
};

const waitingDays = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86400_000);

export default async function Payments({ searchParams }: { searchParams: Promise<{ msg?: string; reveal?: string }> }) {
  const { msg, reveal } = await searchParams;
  const [rows, writers, unpayable] = await Promise.all([
    db.writerPayment.findMany({ include: { author: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.author.findMany({ where: { active: true, email: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    unpayableWithMoneyDue(),
  ]);

  // A reveal is one writer at a time, off the back of a form post that has already been logged.
  const revealed = reveal ? await db.author.findUnique({ where: { id: reveal } }) : null;
  const revealedBank = revealed ? readBank(revealed) : null;

  const submitted = rows.filter((r) => r.status === "SUBMITTED");
  const approved = rows.filter((r) => r.status === "APPROVED");
  const due = rows.filter((r) => r.status === "DUE");
  const paidThisMonth = rows.filter((r) => r.status === "PAID" && r.paidAt && r.paidAt.toISOString().slice(0, 7) === new Date().toISOString().slice(0, 7));
  const owed = [...submitted, ...approved, ...due].reduce((n, r) => n + r.amountPence, 0);
  const stale = submitted.filter((r) => waitingDays(r.updatedAt) >= 7);

  // Invoices arrive in batches under one reference, so they are approved as a batch too.
  const batches = new Map<string, typeof submitted>();
  for (const r of submitted) {
    const key = `${r.author.id}::${r.reference ?? "no reference"}`;
    batches.set(key, [...(batches.get(key) ?? []), r]);
  }

  return (
    <>
      <PageHead
        title="Writer payments"
        subtitle="What writers are owed, what they have invoiced, and what has actually gone out. Approving is not paying — the two steps are separate so nothing is assumed."
      />
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      <MetricRow>
        <Metric label="Awaiting your approval" value={submitted.length} icon="inbox" tone={submitted.length ? "accent" : "plain"} hint={gbp(submitted.reduce((n, r) => n + r.amountPence, 0))} />
        <Metric label="Approved, not yet paid" value={gbp(approved.reduce((n, r) => n + r.amountPence, 0))} icon="card" tone={approved.length ? "warn" : "plain"} hint={`${approved.length} ${approved.length === 1 ? "item" : "items"}`} />
        <Metric label="Owed in total" value={gbp(owed)} icon="chart" hint="Everything not yet paid" />
        <Metric label="Paid this month" value={gbp(paidThisMonth.reduce((n, r) => n + r.amountPence, 0))} icon="check" tone="dark" />
      </MetricRow>

      {stale.length > 0 && (
        <Notice tone="warn" title={`${stale.length} ${stale.length === 1 ? "invoice has" : "invoices have"} been waiting a week or more`}>
          Freelancers are not a credit line. Approve or query these today.
        </Notice>
      )}

      {unpayable.length > 0 && (
        <Notice tone="warn" title={`${unpayable.length} ${unpayable.length === 1 ? "writer is" : "writers are"} owed money we cannot send`}>
          <ul className="mt-1 space-y-1">
            {unpayable.map((u) => (
              <li key={u.authorId}>
                <strong>{u.name}</strong> — {gbp(u.pence)} outstanding, missing {u.state.missing.join(", ")}.
              </li>
            ))}
          </ul>
          <p className="mt-2">
            They have been prompted in their own dashboard. Approving an invoice we then cannot pay is worse than
            telling them straight away, so chase this before the next run.
          </p>
        </Notice>
      )}

      {revealed && (
        <Card title={`Payment details — ${revealed.name}`} description="This view has been recorded in the audit log. Close the page when you are done.">
          {revealedBank ? (
            <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
              <div><dt className="font-bold">Pay to</dt><dd>{revealed.payeeName ?? revealedBank.accountName}</dd></div>
              <div><dt className="font-bold">Account name</dt><dd>{revealedBank.accountName}</dd></div>
              <div><dt className="font-bold">Sort code</dt><dd className="font-mono">{formatSortCode(revealedBank.sortCode)}</dd></div>
              <div><dt className="font-bold">Account number</dt><dd className="font-mono">{revealedBank.accountNumber}</dd></div>
              {revealedBank.iban && <div><dt className="font-bold">IBAN</dt><dd className="font-mono [overflow-wrap:anywhere]">{revealedBank.iban}</dd></div>}
              {revealedBank.swift && <div><dt className="font-bold">SWIFT/BIC</dt><dd className="font-mono">{revealedBank.swift}</dd></div>}
              <div className="sm:col-span-2"><dt className="font-bold">Invoice address</dt><dd className="whitespace-pre-line">{revealed.payeeAddress ?? "—"}</dd></div>
              <div><dt className="font-bold">VAT</dt><dd>{revealed.vatRegistered ? (revealed.vatNumber ?? "registered, number missing") : "Not registered"}</dd></div>
            </dl>
          ) : (
            <p className="text-[15px] text-grey">
              {revealed.bankEnc
                ? "We hold an account for this writer but it cannot be decrypted — the encryption key has changed since it was saved. Ask them to re-enter it; do not guess."
                : "This writer has not added any bank details yet."}
            </p>
          )}
        </Card>
      )}

      <Card title="Invoices awaiting approval" description="Grouped by writer and invoice reference, as they were submitted.">
        {submitted.length === 0 ? (
          <Empty title="No invoices waiting" icon="check">When a writer raises one it appears here.</Empty>
        ) : (
          <div className="space-y-6">
            {[...batches.entries()].map(([key, items]) => {
              const first = items[0];
              const total = items.reduce((n, r) => n + r.amountPence, 0);
              const days = waitingDays(first.updatedAt);
              return (
                <div key={key} className="rounded-2xl border-2 border-ink p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-[17px] font-extrabold">{first.author.name}</p>
                      <p className="text-[13px] text-grey">
                        Invoice {first.reference ?? "— no reference"} · {items.length} {items.length === 1 ? "item" : "items"} · submitted {fmtDate(first.updatedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-xl font-extrabold tabular-nums">{gbp(total)}</p>
                      {days >= 7 && <Chip tone="bad">waiting {days} days</Chip>}
                    </div>
                  </div>

                  <ul className="mt-4 space-y-1.5 text-[14px]">
                    {items.map((r) => (
                      <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-line pb-1.5 last:border-0">
                        <span className="[overflow-wrap:anywhere]">{r.description}</span>
                        <span className="font-display font-extrabold tabular-nums">{gbp(r.amountPence)}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <form action={approvePayments}>
                      {items.map((r) => <input key={r.id} type="hidden" name="payment" value={r.id} />)}
                      <button className={btn()}>Approve {gbp(total)}</button>
                    </form>
                    <form action={revealBankDetails}>
                      <input type="hidden" name="authorId" value={first.author.id} />
                      <button className={btn("ghost")}>Show bank details</button>
                    </form>
                  </div>

                  <details className="mt-4">
                    <summary className="cursor-pointer text-[14px] font-bold">Query one of these instead</summary>
                    <div className="mt-3 space-y-3">
                      {items.map((r) => (
                        <form key={r.id} action={queryInvoice} className="flex flex-wrap items-end gap-3">
                          <input type="hidden" name="id" value={r.id} />
                          <div className="min-w-[14rem] flex-1">
                            <label htmlFor={`q-${r.id}`} className={labelCls}>{r.description} — {gbp(r.amountPence)}</label>
                            <input id={`q-${r.id}`} name="reason" className={field} placeholder="What needs sorting before we pay it" />
                          </div>
                          <button className={btn("ghost")}>Send back</button>
                        </form>
                      ))}
                      <p className="text-[13px] text-grey">
                        A query puts the line back in the writer&rsquo;s list ready to invoice again. Nothing is written off, and they are told why.
                      </p>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {approved.length > 0 && (
        <Card title="Approved and waiting to be paid" description="Mark these paid once the money has actually left the account, not when you intend to send it.">
          <form action={markPaid}>
            <ul className="space-y-2">
              {approved.map((r) => (
                <li key={r.id}>
                  <label className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 hover:border-ink">
                    <input type="checkbox" name="payment" value={r.id} className="size-4" defaultChecked />
                    <span className="flex-1 [overflow-wrap:anywhere]">
                      <strong>{r.author.name}</strong> — {r.description}
                      <span className="block text-[13px] text-grey">
                        Invoice {r.reference ?? "—"} · approved by {r.approvedBy ?? "—"}
                      </span>
                    </span>
                    <span className="font-display font-extrabold tabular-nums">{gbp(r.amountPence)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button className={`${btn()} mt-4`}>Mark the ticked items paid</button>
            <p className="mt-2 text-[13px] text-grey">Each writer gets one email with their total, not one per line.</p>
          </form>
        </Card>
      )}

      <Card title="Add a fee" description="For work outside a commission: a pitch we took, an extra day, a kill fee.">
        {writers.length === 0 ? (
          <p className="text-[15px] text-grey">No writers with accounts yet.</p>
        ) : (
          <form action={addPayment} className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="authorId" className={labelCls}>Writer</label>
              <select id="authorId" name="authorId" required className={field}>
                <option value="">Choose…</option>
                {writers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="description" className={labelCls}>What it is for</label>
              <input id="description" name="description" required className={field} placeholder="Kill fee — Hackney markets piece" />
            </div>
            <div>
              <label htmlFor="amount" className={labelCls}>Amount (£)</label>
              <input id="amount" name="amount" required className={field} inputMode="decimal" placeholder="150" />
            </div>
            <div className="sm:col-span-3">
              <button className={btn()}>Add it as ready to invoice</button>
              <p className="mt-2 text-[13px] text-grey">The writer sees your wording exactly, so write it as you would say it to them.</p>
            </div>
          </form>
        )}
      </Card>

      <Card title="Everything" description="Newest first.">
        {rows.length === 0 ? (
          <Empty title="No payments recorded" icon="card">Fees appear here as commissions are delivered.</Empty>
        ) : (
          <Table head={["Writer", "For", "Amount", "Status", "Dates"]}>
            {rows.map((r) => {
              const st = STATUS[r.status as keyof typeof STATUS] ?? { label: r.status, tone: "quiet" as const };
              return (
                <Row key={r.id}>
                  <Cell className="whitespace-nowrap font-semibold">{r.author.name}</Cell>
                  <Cell className="[overflow-wrap:anywhere]">
                    {r.description}
                    {r.reference && <span className="block text-[13px] text-grey">Invoice {r.reference}</span>}
                  </Cell>
                  <Cell className="whitespace-nowrap font-display font-extrabold tabular-nums">{gbp(r.amountPence)}</Cell>
                  <Cell><Chip tone={st.tone}>{st.label}</Chip></Cell>
                  <Cell className="whitespace-nowrap text-[13px] text-grey">
                    Added {fmtDate(r.createdAt)}
                    {r.paidAt && <span className="block">Paid {fmtDate(r.paidAt)}</span>}
                  </Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title="How we pay">
        <ul className="space-y-2 text-[14px] text-grey">
          <li><strong className="text-ink">Approve or query within a week.</strong> Sitting on an invoice is a cost we push onto someone who can afford it least.</li>
          <li><strong className="text-ink">Readership never changes a fee.</strong> It is agreed before the work and paid in full whatever happens.</li>
          <li><strong className="text-ink">Marked paid means paid.</strong> Only tick it once the transfer has gone, because the writer gets an email saying the money is on its way.</li>
          <li><strong className="text-ink">Every change here is in the audit log</strong> with who did it, so money questions have an answer.</li>
        </ul>
      </Card>
    </>
  );
}
