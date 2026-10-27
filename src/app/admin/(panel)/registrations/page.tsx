import Link from "next/link";
import { Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requirePermission } from "@/lib/auth";
import { registrationEvidence } from "@/lib/registration";
import { db } from "@/lib/db";
import { approveRegistrationAction, rejectRegistrationAction } from "../../registration-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registrations — Admin", robots: { index: false, follow: false } };

/**
 * Business registrations awaiting review.
 *
 * Approving one does three things in a single step: creates the listing, grants ownership through
 * `grantOwnership()`, and grants the five welcome credits. That is deliberate — one approval, one queue, one
 * primitive. There is no second screen to keep in step.
 */
export default async function Registrations({ searchParams }: { searchParams: Promise<{ msg?: string; show?: string }> }) {
  await requirePermission("moderation.handle");
  const { msg, show } = await searchParams;
  const all = show === "all";

  const rows = await db.businessSubmission.findMany({
    where: { kind: "REGISTRATION", ...(all ? {} : { status: "PENDING" }) },
    orderBy: { createdAt: "asc" }, // oldest first: a queue sorted newest-first abandons its oldest items
    include: { place: { include: { parent: true } } },
    take: 100,
  });

  const pending = rows.filter((r) => r.status === "PENDING");
  const unverified = pending.filter((r) => !r.emailVerifiedAt).length;
  const duplicates = pending.filter((r) => r.duplicateOfId).length;
  const oldest = pending[0];
  const waitingDays = oldest ? Math.floor((Date.now() - oldest.createdAt.getTime()) / 86400_000) : 0;

  const categoryNames = new Map((await db.category.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const placeNames = new Map((await db.place.findMany({ where: { id: { in: rows.flatMap((r) => safeIds(r.serviceAreaIds)) } }, select: { id: true, label: true } })).map((p) => [p.id, p.label]));

  return (
    <>
      <PageHead
        title="Registrations"
        subtitle="Businesses that signed themselves up. Approving one creates the listing, makes them the owner and grants their five lead credits — in one step."
        actions={<Link href={all ? "/admin/registrations" : "/admin/registrations?show=all"} className={btn("ghost")}>{all ? "Pending only" : "Show all"}</Link>}
      />

      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      <MetricRow>
        <Metric label="Waiting" value={pending.length} icon="inbox" tone={pending.length ? "accent" : "plain"} />
        <Metric label="Email not yet confirmed" value={unverified} icon="mail" hint={unverified ? "Cannot be approved until it is" : "All confirmed"} />
        <Metric label="Possible duplicates" value={duplicates} icon="shield" tone={duplicates ? "warn" : "plain"} />
        <Metric label="Oldest has waited" value={oldest ? `${waitingDays}d` : "—"} icon="chart" tone={waitingDays >= 2 ? "warn" : "plain"} />
      </MetricRow>

      {waitingDays >= 2 && (
        <Notice tone="warn" title="Somebody has been waiting more than a day">
          They were told "usually within a working day" when they registered. That promise is on the site.
        </Notice>
      )}

      {pending.length === 0 && !all && (
        <Empty title="Nothing waiting" icon="check" action={<Link href="/admin/registrations?show=all" className="font-bold underline">See handled ones</Link>}>
          Every registration has been dealt with.
        </Empty>
      )}

      <div className="space-y-6">
        {rows.map((r) => {
          const evidence = registrationEvidence(r);
          const cats = safeIds(r.categoryIds).map((id) => categoryNames.get(id) ?? id);
          const areas = safeIds(r.serviceAreaIds).map((id) => placeNames.get(id) ?? id);
          return (
            <Card key={r.id} title={r.name} description={`Registered ${fmtDate(r.createdAt)} by ${r.submitterName} (${r.ownerRole ?? "role not given"})`}>
              <div className="flex flex-wrap gap-2">
                {r.status === "PENDING" ? <Chip tone="review">waiting</Chip> : r.status === "APPROVED" ? <Chip tone="good">approved</Chip> : <Chip tone="bad">rejected</Chip>}
                {r.emailVerifiedAt ? <Chip tone="good">email confirmed</Chip> : <Chip tone="bad">email not confirmed</Chip>}
                {evidence.domainMatch && <Chip tone="live">business-domain email</Chip>}
                {r.duplicateOfId && <Chip tone="bad">possible duplicate</Chip>}
              </div>

              <dl className="mt-5 grid gap-4 text-[15px] sm:grid-cols-2">
                <div><dt className="font-bold">Where</dt><dd>{r.place?.label ?? "—"}{r.place?.parent ? `, ${r.place.parent.name}` : ""}{r.postcode ? ` · ${r.postcode}` : ""}</dd></div>
                <div><dt className="font-bold">Contact</dt><dd className="[overflow-wrap:anywhere]">{r.submitterEmail}{r.phone ? ` · ${r.phone}` : ""}</dd></div>
                <div><dt className="font-bold">Services</dt><dd>{cats.join(", ") || "—"}</dd></div>
                <div><dt className="font-bold">Covers</dt><dd>{areas.join(", ") || "—"}{r.serviceAreaMode === "INCLUDES_CHILDREN" ? " (and everywhere within them)" : ""}</dd></div>
                <div className="sm:col-span-2"><dt className="font-bold">Website</dt><dd className="[overflow-wrap:anywhere]">{r.website ? <a href={r.website} rel="noopener noreferrer nofollow" className="underline">{r.website}</a> : "none given"}</dd></div>
                <div className="sm:col-span-2"><dt className="font-bold">In their words</dt><dd className="whitespace-pre-line">{r.description}</dd></div>
              </dl>

              {r.duplicateOfId && (
                <Notice tone="warn" title="They may already be listed">
                  We matched this against an existing business and they told us it is a different one. Check before
                  approving: two listings for one business split its reviews and confuse customers.{" "}
                  <Link href={`/admin/businesses/${r.duplicateOfId}`} className="font-bold underline">See the existing listing</Link>.
                </Notice>
              )}

              {r.status === "PENDING" && (
                <div className="mt-5 space-y-4">
                  {!evidence.canApprove && (
                    <Notice tone="bad" title="Cannot approve yet">
                      The email address has not been confirmed, so there is nothing proving we can reach this person.
                    </Notice>
                  )}

                  {evidence.canApprove && (
                    <div className="flex flex-wrap gap-3">
                      <form action={approveRegistrationAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="verified" value="0" />
                        <button className={btn()}>Approve and publish</button>
                      </form>
                      {evidence.canVerify ? (
                        <form action={approveRegistrationAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="verified" value="1" />
                          <button className={btn("ghost")}>Approve and mark verified</button>
                        </form>
                      ) : (
                        <p className="self-center text-[13px] text-grey">
                          Verified needs a business-domain email or a phone call-back — the same bar as a claim.
                        </p>
                      )}
                    </div>
                  )}

                  <form action={rejectRegistrationAction} className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
                    <input type="hidden" name="id" value={r.id} />
                    <div className="min-w-[16rem] flex-1">
                      <label htmlFor={`r-${r.id}`} className={labelCls}>Reject, with a reason they will read</label>
                      <input id={`r-${r.id}`} name="reason" className={field} placeholder="Why this is not going live" />
                    </div>
                    <button className={btn("danger")}>Reject</button>
                  </form>
                </div>
              )}

              {r.status !== "PENDING" && r.reviewNote && (
                <p className="mt-4 rounded-xl bg-mist p-3 text-[14px]"><strong>{r.status === "APPROVED" ? "Note:" : "Rejected:"}</strong> {r.reviewNote}{r.reviewedBy ? ` — ${r.reviewedBy}` : ""}</p>
              )}
              {r.businessId && <p className="mt-3 text-[14px]"><Link href={`/admin/businesses/${r.businessId}`} className="font-bold underline">Open the listing</Link></p>}
            </Card>
          );
        })}
      </div>

      <Card title="What approving does">
        <ul className="space-y-2 text-[14px] text-grey">
          <li><strong className="text-ink">Creates the listing</strong> with the categories and service areas they chose, published immediately.</li>
          <li><strong className="text-ink">Makes them the owner</strong> through the same `grantOwnership()` a claim uses. There is no second route to becoming an owner.</li>
          <li><strong className="text-ink">Grants five lead credits</strong>, once per business, ever — guarded in the database as well as in the code.</li>
          <li><strong className="text-ink">Verified means evidence.</strong> A business-domain email or a phone call-back, exactly as a claim requires. Registering is not a softer route to the badge.</li>
        </ul>
      </Card>
    </>
  );
}

function safeIds(json: string | null): string[] {
  try { const v = JSON.parse(json ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}
