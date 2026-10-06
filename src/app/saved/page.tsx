import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BusinessCard } from "@/components/Cards";
import { ClearSaved } from "@/components/ClearSaved";
import { Container, EmptyState, PageHeader, SectionHead } from "@/components/ui";
import { db } from "@/lib/db";
import { businessInclude } from "@/lib/queries";
import { recommendFor } from "@/lib/related";
import { MAX_RECENT, MAX_SAVED, RECENT_COOKIE, SAVED_COOKIE, parseIds } from "@/lib/saved";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saved businesses", robots: { index: false, follow: false } };

async function byIds(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.business.findMany({ where: { id: { in: ids }, published: true }, include: businessInclude });
  return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as typeof rows; // keep the visitor's order
}

export default async function SavedPage() {
  const jar = await cookies();
  const savedIds = parseIds(jar.get(SAVED_COOKIE)?.value, MAX_SAVED), recentIds = parseIds(jar.get(RECENT_COOKIE)?.value, MAX_RECENT);
  const [saved, recent, recs] = await Promise.all([byIds(savedIds), byIds(recentIds.filter((i) => !savedIds.includes(i)).slice(0, 6)), recommendFor(savedIds, recentIds, 6)]);
  return (
    <>
      <PageHeader kicker="Your list" title="Saved businesses" intro="Your saved list lives in this browser only. There's no account and nothing is tracked." crumbs={[{ name: "Home", href: "/" }, { name: "Saved" }]} />
      <Container className="space-y-14 py-10">
        <section aria-labelledby="saved-h">
          <div className="mb-4 flex items-end justify-between gap-3 border-b-4 border-ink pb-2"><h2 id="saved-h" className="text-2xl font-extrabold">Saved <span className="text-base font-bold text-grey">({saved.length})</span></h2>{saved.length > 0 && <ClearSaved which="saved" />}</div>
          {saved.length === 0 ? <EmptyState title="Nothing saved yet" action={<Link href="/businesses" className="font-bold underline">Browse businesses</Link>}>Press “Save” on any business to keep it here. We store the list in a small cookie on your device so you don&apos;t need an account.</EmptyState>
            : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{saved.map((b) => <BusinessCard key={b.id} b={b} refreshOnSave />)}</div>}
        </section>
        {recs.items.length > 0 && <section aria-labelledby="recs"><SectionHead title={`You might like${recs.because ? ` — because ${recs.because}` : ""}`} /><h2 id="recs" className="sr-only">Recommendations</h2><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{recs.items.map((b) => <BusinessCard key={b.id} b={b} />)}</div></section>}
        {recent.length > 0 && <section aria-labelledby="recent"><div className="mb-4 flex items-end justify-between gap-3 border-b-4 border-ink pb-2"><h2 id="recent" className="text-2xl font-extrabold">Recently viewed</h2><ClearSaved which="recent" /></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{recent.map((b) => <BusinessCard key={b.id} b={b} />)}</div></section>}
        <p className="max-w-2xl text-sm text-grey">How this works: “Saved” and “Recently viewed” are stored as first-party functional cookies containing business IDs, so these pages can be built on our server. Recommendations are computed from those lists on the fly; we don&apos;t keep a profile of you. Clear them any time with the links above.</p>
      </Container>
    </>
  );
}
