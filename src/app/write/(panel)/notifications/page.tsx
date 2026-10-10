import Link from "next/link";
import { Card, Chip, Empty, Metric, MetricRow, PageHead, btn } from "@/components/Dash";
import { Icon, type IconName } from "@/components/dash/Icon";
import { fmtDate } from "@/components/Cards";
import { requireAuthor } from "@/lib/author-auth";
import { listNotifications, unreadCount } from "@/lib/notify";
import { clearNotifications } from "../../writer-actions";

export const dynamic = "force-dynamic";

const KIND: Record<string, { icon: IconName; label: string }> = {
  DECISION: { icon: "check", label: "Decision" },
  COMMISSION: { icon: "inbox", label: "Commission" },
  PAYMENT: { icon: "card", label: "Payment" },
  REVIEW: { icon: "star", label: "Review" },
  ENQUIRY: { icon: "mail", label: "Enquiry" },
  SYSTEM: { icon: "bolt", label: "Notice" },
};

export default async function Notifications() {
  const me = await requireAuthor();
  const [items, unread] = await Promise.all([listNotifications("AUTHOR", me.id, 60), unreadCount("AUTHOR", me.id)]);

  return (
    <>
      <PageHead
        title="Notifications"
        subtitle="Everything that has happened to your work. Email can be missed or filtered; this is the copy that cannot go astray."
        actions={unread > 0 ? <form action={clearNotifications}><button className={btn("ghost")}>Mark all as read</button></form> : undefined}
      />

      <MetricRow cols={2}>
        <Metric label="Unread" value={unread} icon="bolt" tone={unread ? "accent" : "plain"} />
        <Metric label="All notifications" value={items.length} icon="inbox" />
      </MetricRow>

      <Card title="Recent">
        {items.length === 0 ? (
          <Empty title="Nothing yet" icon="inbox">
            Decisions on your work, commissions and payment updates will appear here as they happen.
          </Empty>
        ) : (
          <ol className="space-y-1">
            {items.map((n) => {
              const k = KIND[n.kind] ?? KIND.SYSTEM;
              const body = (
                <div className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 transition ${n.readAt ? "border-line bg-white" : "border-ink bg-yellow-soft"}`}>
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ink">
                    <Icon name={k.icon} size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold [overflow-wrap:anywhere]">{n.title}</p>
                      {!n.readAt && <Chip tone="review">New</Chip>}
                    </div>
                    {n.body && <p className="mt-1 text-[14px] text-grey [overflow-wrap:anywhere]">{n.body}</p>}
                    <p className="mt-1 text-[12px] text-grey">{k.label} · {fmtDate(n.createdAt)}</p>
                  </div>
                </div>
              );
              return <li key={n.id}>{n.href ? <Link href={n.href} className="block">{body}</Link> : body}</li>;
            })}
          </ol>
        )}
      </Card>
    </>
  );
}
