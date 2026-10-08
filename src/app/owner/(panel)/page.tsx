import Link from "next/link";
import { ClaimBadge } from "@/components/ui";
import { RatingBadge } from "@/components/Reviews";
import { Chip, Empty, Panel, Progress, Stat, StatRow, btn } from "@/components/Dash";
import { db } from "@/lib/db";
import { completeness, requireOwner, views30 } from "@/lib/owner";
import { bizPath } from "@/lib/queries";
import { clicks30, getEntitlements } from "@/lib/commerce";

export const dynamic = "force-dynamic";

export default async function OwnerHome() {
  const owner = await requireOwner();
  const links = await db.businessOwner.findMany({
    where: { ownerId: owner.id },
    include: { business: { include: { category: true, city: true, location: true } } },
  });
  const rows = await Promise.all(links.map(async (l) => ({
    b: l.business,
    views: await views30(l.businessId),
    c: completeness(l.business),
    clicks: await clicks30(l.businessId),
    ent: await getEntitlements(l.businessId),
    published: await db.review.count({ where: { businessId: l.businessId, status: "PUBLISHED" } }),
    unanswered: await db.review.count({ where: { businessId: l.businessId, status: "PUBLISHED", response: null } }),
    newLeads: await db.lead.count({ where: { businessId: l.businessId, status: "NEW" } }),
  })));

  const totalViews = rows.reduce((n, r) => n + r.views, 0);
  const totalLeads = rows.reduce((n, r) => n + r.newLeads, 0);
  const totalUnanswered = rows.reduce((n, r) => n + r.unanswered, 0);

  return (
    <>
      <header className="mb-8">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Welcome, {owner.name.split(" ")[0]}</h1>
        <p className="mt-1 text-grey">How your business is doing on PrimeStreet, and anything waiting on you.</p>
      </header>

      {rows.length > 0 && (
        <StatRow>
          <Stat label="Profile views" value={totalViews} hint="Last 30 days" tone="accent" />
          <Stat label="New enquiries" value={totalLeads} hint={totalLeads ? "Waiting for a reply" : "Nothing new"} tone={totalLeads ? "warn" : "plain"} />
          <Stat label="Reviews to reply to" value={totalUnanswered} hint="A reply is public" />
          <Stat label="Businesses" value={rows.length} hint="You manage these" />
        </StatRow>
      )}

      {rows.length === 0 && (
        <Empty title="You don't manage any businesses right now">
          If your access was removed and you think that is a mistake, get in touch.
        </Empty>
      )}

      {rows.map(({ b, views, c, clicks, ent, published, unanswered, newLeads }) => (
        <Panel
          key={b.id}
          title={b.name}
          description={`${b.category.name} · ${b.location.name}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <ClaimBadge status={b.claimStatus} />
              {ent.premium && <Chip tone="good">Premium</Chip>}
              <RatingBadge avg={b.ratingAvg} count={b.ratingCount} />
            </div>
          }
        >
          <StatRow>
            <Stat label="Profile views" value={views} hint="Last 30 days" />
            <Stat label="Website clicks" value={ent.premium ? clicks.website : "—"} hint={ent.premium ? "Last 30 days" : "Premium shows this"} />
            <Stat label="Phone taps" value={ent.premium ? clicks.phone : "—"} hint={ent.premium ? "Last 30 days" : "Premium shows this"} />
            <Stat label="New enquiries" value={newLeads} hint={newLeads ? "Reply soon" : "Nothing new"} tone={newLeads ? "warn" : "plain"} href={`/owner/business/${b.id}/leads`} />
          </StatRow>

          <div className="mb-5 max-w-xl">
            <Progress percent={c.pct} target={100} label="Profile completeness" />
            {c.pct < 100 && (
              <p className="mt-2 text-sm text-grey">
                <strong className="text-ink">Next to add:</strong> {c.items.filter(([, ok]) => !ok).map(([n]) => n).slice(0, 3).join(" · ")}
              </p>
            )}
          </div>

          {unanswered > 0 && (
            <p className="mb-5 rounded-xl border-2 border-ink bg-yellow-soft p-3 text-sm font-bold">
              {unanswered} of {published} reviews have no reply from you yet. A reply is public and shows you are paying attention.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Link href={`/owner/business/${b.id}`} className={btn()}>Edit profile</Link>
            <Link href={`/owner/business/${b.id}/reviews`} className={btn("ghost")}>Reviews{unanswered ? ` (${unanswered})` : ""}</Link>
            <Link href={`/owner/business/${b.id}/leads`} className={btn("ghost")}>Enquiries{newLeads ? ` (${newLeads})` : ""}</Link>
            <Link href={`/owner/business/${b.id}/promote`} className={btn("ghost")}>Promote</Link>
            <Link href={`/owner/business/${b.id}/coverage`} className={btn("ghost")}>Tell us your story</Link>
            <Link href={bizPath(b)} className="inline-flex min-h-11 items-center px-3 font-bold underline">View public page</Link>
          </div>
        </Panel>
      ))}
    </>
  );
}
