import Link from "next/link";
import { Card, Notice, PageHead, btn, field, labelCls } from "@/components/Dash";
import { OwnerTabs } from "@/components/OwnerTabs";
import { coverageOptions, currentCoverage, demandInCoverage } from "@/lib/coverage";
import { creditBalance } from "@/lib/credits";
import { db } from "@/lib/db";
import { requireBusiness } from "@/lib/owner";
import { saveCoverageAreas } from "../../../../business-actions";

export const dynamic = "force-dynamic";

/**
 * Where a business works and what it does.
 *
 * Everything on this page decides which job requests reach this business, which is why it says so at the
 * top rather than burying it. Before this existed, all of it was set once at registration and could only be
 * changed by emailing us — so the matcher was routing on data the business itself could not correct.
 *
 * Ticking a borough means the whole borough; ticking a locality means that locality only. The mode is
 * derived from that choice rather than being a separate switch that can disagree with it.
 */
export default async function Areas({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { id } = await params;
  const { msg } = await searchParams;
  const { business } = await requireBusiness(id);

  const [boroughs, categories, current, demand, credits] = await Promise.all([
    coverageOptions(),
    db.category.findMany({ where: { parentId: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    currentCoverage(id),
    demandInCoverage(id),
    creditBalance(id),
  ]);

  const chosen = new Set(current.areaIds);
  const chosenCats = new Set(current.categoryIds);

  return (
    <>
      <OwnerTabs id={business.id} name={business.name} active="areas" />

      <PageHead
        title="Where you work"
        subtitle="This decides which job requests reach you. Nothing else on your listing matters more for getting work."
      />

      {msg && <Notice tone="good" title="Saved">{msg}</Notice>}

      {current.areaIds.length === 0 && (
        <Notice tone="warn" title="You cover no areas, so no job can reach you">
          Pick at least one area below. Until you do, every request in your trade goes to somebody else.
        </Notice>
      )}

      <Card title="What this has been worth" description="Real requests, counted — not a projection.">
        <dl className="grid gap-4 text-[15px] sm:grid-cols-3">
          <div>
            <dt className="font-bold">Requests in your areas</dt>
            <dd className="font-display text-2xl font-extrabold">{demand.requests}</dd>
            <dd className="text-[13px] text-grey">last {demand.days} days, in the trades you offer</dd>
          </div>
          <div>
            <dt className="font-bold">Sent to you</dt>
            <dd className="font-display text-2xl font-extrabold">{demand.assignedToYou}</dd>
            <dd className="text-[13px] text-grey">
              {demand.requests > demand.assignedToYou
                ? "Each job goes to a maximum of two businesses, so not every request can reach you."
                : "Everything we could send you, we sent."}
            </dd>
          </div>
          <div>
            <dt className="font-bold">Credits left</dt>
            <dd className="font-display text-2xl font-extrabold">{credits}</dd>
            <dd className="text-[13px] text-grey">
              {credits === 0
                ? "At zero, new requests go to somebody else."
                : <>One per job. <Link href={`/owner/business/${id}/billing`} className="underline">Top up</Link></>}
            </dd>
          </div>
        </dl>
      </Card>

      <form action={saveCoverageAreas}>
        <input type="hidden" name="businessId" value={business.id} />

        <Card title="Areas you will travel to" description="Only places you would genuinely go. We will not send you work you do not want, and we will not send a customer a business that was never going to turn up.">
          <fieldset>
            <legend className="sr-only">Areas you cover</legend>
            <div className="space-y-4">
              {boroughs.map((b) => (
                <details key={b.id} open={chosen.has(b.id) || b.localities.some((l) => chosen.has(l.id))} className="rounded-2xl border border-line p-4">
                  <summary className="cursor-pointer font-bold">
                    {b.name}
                    {chosen.has(b.id) && <span className="ml-2 text-[12px] font-extrabold uppercase tracking-wide text-grey">whole borough</span>}
                  </summary>
                  <label className="mt-3 flex items-start gap-2.5 text-[15px]">
                    <input type="checkbox" name="areaIds" value={b.id} defaultChecked={chosen.has(b.id)} className="mt-1 size-4" />
                    <span><strong>The whole of {b.name}</strong> — simpler, and it covers every area in it.</span>
                  </label>
                  <p className="mt-3 text-[13px] font-bold text-grey">Or pick the parts you cover:</p>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                    {b.localities.map((l) => (
                      <label key={l.id} className="flex items-center gap-2 text-[14px]">
                        <input type="checkbox" name="areaIds" value={l.id} defaultChecked={chosen.has(l.id)} className="size-4" />
                        {l.name}
                      </label>
                    ))}
                  </div>
                  {b.localities.length === 0 && <p className="mt-2 text-[13px] text-grey">We have no smaller areas listed for {b.name} yet.</p>}
                </details>
              ))}
            </div>
          </fieldset>
          <p className="mt-4 text-[13px] text-grey">
            Currently covering <strong>{current.areaIds.length}</strong> {current.areaIds.length === 1 ? "area" : "areas"}.
            Keep at least one: there is no hidden pause switch, and with none selected nothing can reach you.
          </p>
        </Card>

        <Card title="Work you do" description="Pick everything that applies. A job only reaches you if it matches one of these.">
          <fieldset>
            <legend className="sr-only">Kinds of work</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] hover:border-ink">
                  <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={chosenCats.has(c.id)} className="size-4" />
                  {c.name}
                  {current.primaryCategoryId === c.id && <span className="ml-auto text-[11px] font-extrabold uppercase tracking-wide text-grey">main</span>}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-4 text-[13px] text-grey">
            Your main trade decides where your listing appears in the directory. It stays as it is while you
            keep offering it.
          </p>
        </Card>

        <Card title="Work just outside your areas" description="Only if you want it. Off unless you say otherwise.">
          <label className="flex items-start gap-2.5 text-[15px]">
            <input type="checkbox" name="acceptsNearby" value="yes" defaultChecked={current.acceptsNearby} className="mt-1 size-4" />
            <span>
              <strong>Send me jobs from areas next to the ones I cover</strong>, when nobody closer can take
              them. You will see where the job is before you ring anyone, and you are never charged for a job
              you were not sent.
            </span>
          </label>
          <p className="mt-4 text-[13px] text-grey">
            We ask rather than assume. Sending somebody work they never asked for is how a directory earns a
            reputation for wasting people&apos;s time.
          </p>
        </Card>

        <div className="mb-10 flex flex-wrap items-center gap-4">
          <button className={btn()}>Save what I cover</button>
          <p className="text-[13px] text-grey">New job requests use this straight away. Jobs already sent to you are not affected.</p>
        </div>
      </form>
    </>
  );
}
