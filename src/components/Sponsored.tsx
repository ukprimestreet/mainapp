import Link from "next/link";
import { headers } from "next/headers";
import { pickAd, pickFeatured, recordImpressions, type Slot } from "@/lib/commerce";
import { Thumb } from "./ui";

/**
 * Paid placements. Rules enforced here: always visibly labelled, visually distinct from organic results, links marked
 * rel="sponsored", never mixed into (or reordering) organic lists, founder-owned businesses carry a disclosure.
 */
export async function FeaturedSlot(slot: Slot & { heading?: string }) {
  const picks = await pickFeatured(slot, 2);
  if (!picks.length) return null;
  await recordImpressions(picks.map((p) => p.id), (await headers()).get("user-agent"));
  return (
    <aside aria-label="Sponsored businesses" data-sponsored="featured" className="rounded-2xl border-2 border-dashed border-ink/40 bg-yellow-soft p-5">
      <p className="mb-3 flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-wider"><span className="rounded bg-ink px-2 py-0.5 text-yellow">Sponsored</span><span>{slot.heading ?? "Featured businesses"} · paid placement, not a recommendation</span></p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {picks.map((c) => {
          const b = c.business!;
          return (
            <li key={c.id} className="relative flex gap-4 rounded-xl border border-line bg-white p-3">
              <Thumb text={b.name} src={b.imageUrl} className="h-20 w-20 shrink-0 rounded-lg" />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-grey">{b.category.name} · {b.location.name}</p>
                <h3 className="font-extrabold leading-snug"><Link href={`/go/campaign/${c.id}`} rel="sponsored nofollow" prefetch={false} className="after:absolute after:inset-0">{b.name}</Link></h3>
                <p className="text-sm text-grey [overflow-wrap:anywhere]">{b.summary}</p>
                {b.ownedByFounder && <p className="mt-1 text-xs font-bold">Disclosure: owned by PrimeStreet&apos;s founder</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export async function AdSlot({ placement, ...slot }: Slot & { placement: "HOME" | "ARTICLE" | "PODCAST" }) {
  const ad = await pickAd(placement, slot);
  if (!ad || !ad.headline) return null;
  await recordImpressions([ad.id], (await headers()).get("user-agent"));
  return (
    <aside aria-label="Advertisement" data-sponsored="ad" className="rounded-2xl border-2 border-dashed border-ink/40 bg-mist p-5">
      <p className="mb-3 text-xs font-extrabold uppercase tracking-wider"><span className="rounded bg-ink px-2 py-0.5 text-yellow">Advertisement</span> {ad.advertiser && <span className="ml-2">from {ad.advertiser}</span>}</p>
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        {ad.imageUrl && <img src={ad.imageUrl} alt="" loading="lazy" className="h-24 w-full rounded-lg object-cover sm:w-40" />}
        <div className="min-w-0"><h3 className="text-lg font-extrabold [overflow-wrap:anywhere]"><a href={`/go/campaign/${ad.id}`} rel="sponsored nofollow noopener" className="after:absolute after:inset-0">{ad.headline}</a></h3>
          {ad.body && <p className="text-sm text-grey [overflow-wrap:anywhere]">{ad.body}</p>}</div>
      </div>
    </aside>
  );
}
