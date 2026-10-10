import Link from "next/link";
import { Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, area, btn } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requireAuthor } from "@/lib/author-auth";
import { ARTICLE_TYPES, type ArticleType } from "@/lib/constants";
import { gbp } from "@/lib/commerce";
import { db } from "@/lib/db";
import { respondToCommission } from "../../writer-actions";

export const dynamic = "force-dynamic";

const STATUS = {
  OFFERED: { label: "Offered", tone: "review" as const },
  ACCEPTED: { label: "Accepted", tone: "live" as const },
  DECLINED: { label: "Declined", tone: "quiet" as const },
  DELIVERED: { label: "Delivered", tone: "good" as const },
  CANCELLED: { label: "Cancelled", tone: "quiet" as const },
};

const due = (d: Date | null) => {
  if (!d) return { text: "No deadline", late: false };
  const days = Math.ceil((d.getTime() - Date.now()) / 86400_000);
  return { text: days < 0 ? `${Math.abs(days)} days late` : days === 0 ? "Due today" : `Due in ${days} days`, late: days < 0 };
};

export default async function Commissions({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await requireAuthor();
  const { msg } = await searchParams;
  const rows = await db.commission.findMany({ where: { authorId: me.id }, orderBy: [{ status: "asc" }, { dueAt: "asc" }] });
  const offered = rows.filter((r) => r.status === "OFFERED");
  const accepted = rows.filter((r) => r.status === "ACCEPTED");
  const owed = accepted.reduce((n, r) => n + (r.feePence ?? 0), 0);

  return (
    <>
      <PageHead
        title="Commissions"
        subtitle="Work an editor has asked you to do. Accepting one is a commitment to a deadline, so say no when you need to — it is far better than silence."
      />
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      <MetricRow cols={3}>
        <Metric label="Waiting for your answer" value={offered.length} icon="inbox" tone={offered.length ? "accent" : "plain"} />
        <Metric label="Accepted and in hand" value={accepted.length} icon="pen" />
        <Metric label="Agreed fees outstanding" value={gbp(owed)} icon="card" hint="On accepted commissions" />
      </MetricRow>

      {offered.length > 0 && (
        <Card title="Offered to you" description="Read the brief, then accept or decline. An editor would much rather hear no quickly.">
          <div className="space-y-6">
            {offered.map((c) => {
              const d = due(c.dueAt);
              return (
                <div key={c.id} className="rounded-2xl border-2 border-ink p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-lg font-extrabold [overflow-wrap:anywhere]">{c.title}</p>
                      <p className="text-[13px] text-grey">
                        {ARTICLE_TYPES[c.type as ArticleType]?.label ?? c.type}
                        {c.feePence ? ` · ${gbp(c.feePence)} agreed` : " · fee not set"}
                        {c.dueAt ? ` · ${d.text}` : ""}
                      </p>
                    </div>
                    <Chip tone={d.late ? "bad" : "review"}>{d.text}</Chip>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed [overflow-wrap:anywhere]">{c.brief}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <form action={respondToCommission}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="accept" value="1" />
                      <button className={`${btn()} w-full`}>Accept this commission</button>
                    </form>
                    <form action={respondToCommission} className="space-y-2">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="accept" value="0" />
                      <textarea name="note" rows={2} className={area} placeholder="Why you cannot take it — a line is enough." />
                      <button className={`${btn("ghost")} w-full`}>Decline</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="Everything commissioned" action={<Link href="/write/articles" className="font-bold underline">My work</Link>}>
        {rows.length === 0 ? (
          <Empty title="Nothing commissioned yet" icon="inbox">
            You can write and submit whatever you like without a commission. This page is for work an editor asks you for.
          </Empty>
        ) : (
          <Table head={["Brief", "Type", "Fee", "Due", "Status"]}>
            {rows.map((c) => {
              const d = due(c.dueAt);
              const st = STATUS[c.status as keyof typeof STATUS] ?? { label: c.status, tone: "quiet" as const };
              return (
                <Row key={c.id}>
                  <Cell className="font-semibold [overflow-wrap:anywhere]">
                    {c.title}
                    {c.note && <p className="text-[12px] font-normal text-grey">Your note: {c.note}</p>}
                  </Cell>
                  <Cell className="whitespace-nowrap text-grey">{ARTICLE_TYPES[c.type as ArticleType]?.label ?? c.type}</Cell>
                  <Cell className="font-display font-extrabold tabular-nums">{c.feePence ? gbp(c.feePence) : "—"}</Cell>
                  <Cell className={`whitespace-nowrap ${d.late && c.status === "ACCEPTED" ? "font-bold text-red-800" : "text-grey"}`}>
                    {c.dueAt ? fmtDate(c.dueAt) : "—"}
                  </Cell>
                  <Cell><Chip tone={st.tone}>{st.label}</Chip></Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
