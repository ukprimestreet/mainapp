import Link from "next/link";
import { ClaimBadge } from "@/components/ui";
import { RatingBadge } from "@/components/Reviews";
import { db } from "@/lib/db";
import { completeness, requireOwner, views30 } from "@/lib/owner";
import { bizPath } from "@/lib/queries";

export default async function OwnerHome() {
  const owner = await requireOwner();
  const links = await db.businessOwner.findMany({ where: { ownerId: owner.id }, include: { business: { include: { category: true, city: true, location: true } } } });
  const rows = await Promise.all(links.map(async (l) => ({
    b: l.business, views: await views30(l.businessId), c: completeness(l.business),
    published: await db.review.count({ where: { businessId: l.businessId, status: "PUBLISHED" } }),
    unanswered: await db.review.count({ where: { businessId: l.businessId, status: "PUBLISHED", response: null } }),
  })));
  return (
    <>
      <h1 className="mb-1 text-3xl font-extrabold">Welcome, {owner.name.split(" ")[0]}</h1>
      <p className="mb-8 text-grey">Manage how your business appears on PrimeStreet.</p>
      {rows.length === 0 && <p className="rounded-xl border-2 border-dashed border-line p-6">You don&apos;t manage any businesses right now. If your access was removed and you think that&apos;s a mistake, contact us.</p>}
      <ul className="space-y-6">
        {rows.map(({ b, views, c, published, unanswered }) => (
          <li key={b.id} className="rounded-2xl border-2 border-ink p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-2xl font-extrabold">{b.name}</h2><p className="text-sm text-grey">{b.category.name} · {b.location.name}</p></div>
              <div className="flex items-center gap-3"><ClaimBadge status={b.claimStatus} /><RatingBadge avg={b.ratingAvg} count={b.ratingCount} /></div>
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold">Profile views (30 days)</dt><dd className="font-display text-3xl font-extrabold">{views}</dd></div>
              <div className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold">Profile completeness</dt><dd className="font-display text-3xl font-extrabold">{c.pct}%</dd></div>
              <div className="rounded-xl bg-mist p-4"><dt className="text-sm font-bold">Reviews awaiting your reply</dt><dd className="font-display text-3xl font-extrabold">{unanswered}<span className="ml-1 text-base font-normal text-grey">of {published}</span></dd></div>
            </dl>
            {c.pct < 100 && <p className="mt-4 text-sm"><strong>Next to add:</strong> {c.items.filter(([, ok]) => !ok).map(([n]) => n).slice(0, 3).join(" · ")}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/owner/business/${b.id}`} className="inline-flex min-h-11 items-center rounded-full bg-yellow px-5 font-bold hover:bg-yellow-hover">Edit profile</Link>
              <Link href={`/owner/business/${b.id}/reviews`} className="inline-flex min-h-11 items-center rounded-full border-2 border-ink px-5 font-bold">Reviews</Link>
              <Link href={`/owner/business/${b.id}/coverage`} className="inline-flex min-h-11 items-center rounded-full border-2 border-ink px-5 font-bold">Tell us your story</Link>
              <Link href={bizPath(b)} className="inline-flex min-h-11 items-center px-3 font-bold underline">View public page</Link>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
