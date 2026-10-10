import Link from "next/link";
import { Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, area, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { gbp } from "@/lib/commerce";
import { canSubmit } from "@/lib/author-profile";
import { db } from "@/lib/db";
import { cancelCommission, markDelivered, offerCommission } from "../../editorial-money-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Commissions — Admin", robots: { index: false, follow: false } };

const STATUS = {
  OFFERED: { label: "Waiting on the writer", tone: "review" as const },
  ACCEPTED: { label: "In hand", tone: "live" as const },
  DECLINED: { label: "Declined", tone: "bad" as const },
  DELIVERED: { label: "Delivered", tone: "good" as const },
  CANCELLED: { label: "Cancelled", tone: "quiet" as const },
};

const lateness = (d: Date | null, status: string) => {
  if (!d || status !== "ACCEPTED") return null;
  const days = Math.ceil((d.getTime() - Date.now()) / 86400_000);
  return days < 0 ? `${Math.abs(days)} days late` : days === 0 ? "Due today" : days <= 2 ? `Due in ${days} days` : null;
};

export default async function Commissions({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const [rows, writers] = await Promise.all([
    db.commission.findMany({ include: { author: { select: { name: true, slug: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.author.findMany({ where: { active: true, email: { not: null } }, orderBy: { name: "asc" } }),
  ]);

  const offered = rows.filter((r) => r.status === "OFFERED");
  const accepted = rows.filter((r) => r.status === "ACCEPTED");
  const late = accepted.filter((r) => r.dueAt && r.dueAt.getTime() < Date.now());
  const committed = accepted.reduce((n, r) => n + (r.feePence ?? 0), 0);
  // Only writers who could actually deliver: the same gate they face when submitting work.
  const ready = writers.filter((w) => canSubmit(w).ok);
  const notReady = writers.length - ready.length;

  return (
    <>
      <PageHead
        title="Commissions"
        subtitle="What we have asked writers to do, what they said, and what it costs. A fee is agreed here, before any work starts — never after."
      />
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      <MetricRow>
        <Metric label="Waiting on a writer" value={offered.length} icon="inbox" tone={offered.length ? "accent" : "plain"} />
        <Metric label="In hand" value={accepted.length} icon="pen" />
        <Metric label="Past deadline" value={late.length} icon="shield" tone={late.length ? "warn" : "plain"} hint={late.length ? "Chase these" : "Nothing overdue"} />
        <Metric label="Committed fees" value={gbp(committed)} icon="card" hint="On accepted work, not yet owed" />
      </MetricRow>

      <Card title="Commission a writer" description="They get an email and an in-app notification, and can accept or decline. Declining is not held against them.">
        {ready.length === 0 ? (
          <Empty title="No writer is ready to be commissioned" icon="users" action={<Link href="/admin/authors" className="font-bold underline">Writers</Link>}>
            A writer needs a profile at least 90% complete, and the author terms accepted, before they can submit work — so there is no point commissioning one before that.
            {notReady > 0 && ` ${notReady} ${notReady === 1 ? "writer is" : "writers are"} part-way there.`}
          </Empty>
        ) : (
          <form action={offerCommission} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="authorId" className={labelCls}>Writer</label>
              <select id="authorId" name="authorId" required className={field}>
                <option value="">Choose…</option>
                {ready.map((w) => <option key={w.id} value={w.id}>{w.name} — {w.email}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="type" className={labelCls}>Section</label>
              <select id="type" name="type" className={field} defaultValue="NEWS">
                {Object.entries(ARTICLE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="title" className={labelCls}>Working title</label>
              <input id="title" name="title" required className={field} placeholder="What the piece is about" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="brief" className={labelCls}>The brief</label>
              <textarea id="brief" name="brief" required rows={5} className={area} placeholder="What the piece should cover, who to speak to, what length, and what would make it good. The writer gets this wording exactly as you write it." />
              <p className="mt-1.5 text-[13px] text-grey">A vague brief produces a vague piece and wastes someone else&rsquo;s day. Say what you actually want.</p>
            </div>
            <div>
              <label htmlFor="fee" className={labelCls}>Fee (£)</label>
              <input id="fee" name="fee" className={field} inputMode="decimal" placeholder="150" />
              <p className="mt-1.5 text-[13px] text-grey">Agreed now, paid whatever the readership turns out to be.</p>
            </div>
            <div>
              <label htmlFor="dueAt" className={labelCls}>Deadline</label>
              <input id="dueAt" name="dueAt" type="date" className={field} />
            </div>
            <div className="sm:col-span-2">
              <button className={btn()}>Offer this commission</button>
            </div>
          </form>
        )}
      </Card>

      {accepted.length > 0 && (
        <Card title="In hand" description="Accepted and being written. Marking one delivered records the fee as owed.">
          <Table head={["Piece", "Writer", "Fee", "Deadline", ""]}>
            {accepted.map((c) => {
              const l = lateness(c.dueAt, c.status);
              return (
                <Row key={c.id}>
                  <Cell className="font-semibold [overflow-wrap:anywhere]">{c.title}</Cell>
                  <Cell className="whitespace-nowrap">{c.author.name}</Cell>
                  <Cell className="whitespace-nowrap font-display font-extrabold tabular-nums">{c.feePence ? gbp(c.feePence) : <span className="text-red-800">not set</span>}</Cell>
                  <Cell className="whitespace-nowrap text-grey">
                    {c.dueAt ? fmtDate(c.dueAt) : "—"}
                    {l && <span className="ml-2 align-middle"><Chip tone="bad">{l}</Chip></span>}
                  </Cell>
                  <Cell>
                    <form action={markDelivered}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className={btn("ghost")}>Delivered</button>
                    </form>
                  </Cell>
                </Row>
              );
            })}
          </Table>
        </Card>
      )}

      <Card title="Everything commissioned" description="Newest first.">
        {rows.length === 0 ? (
          <Empty title="Nothing commissioned yet" icon="pen">Offer one above and it appears here.</Empty>
        ) : (
          <div className="space-y-4">
            {rows.map((c) => {
              const st = STATUS[c.status as keyof typeof STATUS] ?? { label: c.status, tone: "quiet" as const };
              return (
                <div key={c.id} className="rounded-2xl border-2 border-line p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-[17px] font-extrabold [overflow-wrap:anywhere]">{c.title}</p>
                      <p className="text-[13px] text-grey">
                        {ARTICLE_TYPES[c.type as ArticleType]?.label ?? c.type} · {c.author.name}
                        {c.feePence ? ` · ${gbp(c.feePence)}` : " · fee not set"} · offered {fmtDate(c.createdAt)} by {c.commissionedBy}
                      </p>
                    </div>
                    <Chip tone={st.tone}>{st.label}</Chip>
                  </div>
                  {c.note && (
                    <p className="mt-3 rounded-xl bg-mist p-3 text-[14px]">
                      <strong>{c.status === "DECLINED" ? "Why they declined:" : "Note:"}</strong> {c.note}
                    </p>
                  )}
                  {(c.status === "OFFERED" || c.status === "ACCEPTED") && (
                    <form action={cancelCommission} className="mt-4 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="id" value={c.id} />
                      <div className="min-w-[16rem] flex-1">
                        <label htmlFor={`r-${c.id}`} className={labelCls}>Cancel, with a reason the writer will read</label>
                        <input id={`r-${c.id}`} name="reason" className={field} placeholder="Why this is no longer going ahead" />
                      </div>
                      <button className={btn("danger")}>Cancel it</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="How we commission">
        <ul className="space-y-2 text-[14px] text-grey">
          <li><strong className="text-ink">The fee is agreed first.</strong> Never after the piece lands, and never adjusted because of how it performed.</li>
          <li><strong className="text-ink">A no costs nothing.</strong> Declining a commission has no effect on what a writer is offered next.</li>
          <li><strong className="text-ink">If we cancel, we pay for work already done.</strong> That is our mistake to absorb, not the writer&rsquo;s.</li>
          <li><strong className="text-ink">A commission is not a promise to publish.</strong> We pay for the work either way, but we only publish what stands up.</li>
        </ul>
      </Card>
    </>
  );
}
