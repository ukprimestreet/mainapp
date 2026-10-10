import { Card, Cell, Chip, Empty, Metric, MetricRow, PageHead, Row, Table, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const PER = 60;

export default async function Audit({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; page?: string }> }) {
  const { q, type, page } = await searchParams;
  const p = Math.max(1, Number(page) || 1);
  const where = {
    ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" as const } }, { detail: { contains: q, mode: "insensitive" as const } }] } : {}),
    ...(type ? { targetType: type } : {}),
  };
  const [rows, total, types, today] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (p - 1) * PER, take: PER }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["targetType"], _count: { _all: true } }),
    db.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 86400_000) } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER));
  const qs = (n: number) => `/admin/audit?page=${n}${q ? `&q=${encodeURIComponent(q)}` : ""}${type ? `&type=${type}` : ""}`;

  return (
    <>
      <PageHead
        title="Audit log"
        subtitle="Who did what, and when. Every consequential action is recorded here, and nothing in the interface can edit or delete a record."
      />

      <MetricRow cols={3}>
        <Metric label="Recorded actions" value={total.toLocaleString()} icon="shield" />
        <Metric label="In the last 24 hours" value={today} icon="bolt" tone={today ? "accent" : "plain"} />
        <Metric label="Kinds of record" value={types.length} icon="file" />
      </MetricRow>

      <Card title="Search">
        <form className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className={labelCls} htmlFor="q">Action or detail</label>
            <input id="q" name="q" defaultValue={q ?? ""} className={field} placeholder="claim, suspended, published…" />
          </div>
          <div>
            <label className={labelCls} htmlFor="type">Kind</label>
            <select id="type" name="type" defaultValue={type ?? ""} className={field}>
              <option value="">All</option>
              {types.map((t) => <option key={t.targetType} value={t.targetType}>{t.targetType} ({t._count._all})</option>)}
            </select>
          </div>
          <button className={btn("ghost")}>Search</button>
        </form>
      </Card>

      <Card title={`${total.toLocaleString()} ${total === 1 ? "record" : "records"}`} description={pages > 1 ? `Page ${p} of ${pages}` : undefined}>
        {rows.length === 0 ? (
          <Empty title="Nothing matches" icon="search">Try a broader search.</Empty>
        ) : (
          <>
            <Table head={["When", "Action", "Kind", "Detail"]}>
              {rows.map((r) => (
                <Row key={r.id}>
                  <Cell className="whitespace-nowrap text-grey">{fmtDate(r.createdAt)}</Cell>
                  <Cell className="font-semibold">{r.action}</Cell>
                  <Cell><Chip tone="quiet">{r.targetType}</Chip></Cell>
                  <Cell className="max-w-lg text-grey [overflow-wrap:anywhere]">{r.detail ?? "—"}</Cell>
                </Row>
              ))}
            </Table>
            {pages > 1 && (
              <nav aria-label="Pages" className="mt-5 flex flex-wrap items-center gap-4 text-sm font-bold">
                {p > 1 && <a href={qs(p - 1)} className="underline">← Newer</a>}
                <span className="text-grey">Page {p} of {pages}</span>
                {p < pages && <a href={qs(p + 1)} className="underline">Older →</a>}
              </nav>
            )}
          </>
        )}
      </Card>
    </>
  );
}
