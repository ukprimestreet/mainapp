import Link from "next/link";
import { Card, Cell, Chip, Empty, Notice, PageHead, Row, Table, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requireBusiness } from "@/lib/owner";
import { DAYS } from "@/lib/constants";
import { parseJson } from "@/lib/queries";
import { db } from "@/lib/db";
import { removeSpecialHours, saveSpecialHours } from "../../../../business-actions";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};

export default async function Hours({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params; const { msg } = await searchParams;
  const { business } = await requireBusiness(id);
  const special = await db.specialHours.findMany({
    where: { businessId: id, day: { gte: new Date().toISOString().slice(0, 10) } },
    orderBy: { day: "asc" },
  });
  const regular = parseJson<Record<string, string>>(business.openingHours, {});
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHead
        title="Opening hours"
        subtitle="The most-changed thing on any listing, and the one people get most annoyed about when it is wrong."
        back={{ href: `/owner/business/${id}`, label: business.name }}
      />
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      <Card title="Normal week" action={<Link href={`/owner/business/${id}`} className="font-bold underline">Edit on the profile</Link>}>
        {Object.keys(regular).length === 0 ? (
          <Empty title="No opening hours set" icon="map" action={<Link href={`/owner/business/${id}`} className={btn()}>Add your hours</Link>}>
            People searching now want somewhere open now. A listing with no hours gets skipped.
          </Empty>
        ) : (
          <Table head={["Day", "Hours"]}>
            {DAYS.map((d) => (
              <Row key={d}>
                <Cell className="font-semibold">{LABEL[d]}</Cell>
                <Cell className={regular[d] ? "" : "text-grey"}>{regular[d] ? regular[d].replace("-", " to ") : "Closed"}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Holidays and one-offs" description="Bank holidays, closures, staff training. These override the normal week on that date.">
        <form action={saveSpecialHours} className="mb-6 grid max-w-3xl gap-4 sm:grid-cols-[auto_auto_auto_1fr_auto] sm:items-end">
          <input type="hidden" name="businessId" value={id} />
          <div>
            <label className={labelCls} htmlFor="day">Date</label>
            <input id="day" name="day" type="date" min={today} required className={field} />
          </div>
          <div>
            <label className={labelCls} htmlFor="opens">Opens</label>
            <input id="opens" name="opens" type="time" className={field} />
          </div>
          <div>
            <label className={labelCls} htmlFor="closes">Closes</label>
            <input id="closes" name="closes" type="time" className={field} />
          </div>
          <div>
            <label className={labelCls} htmlFor="note">Why (optional)</label>
            <input id="note" name="note" className={field} placeholder="Christmas Day" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" name="closed" value="1" className="h-5 w-5" /> Closed
            </label>
            <button className={btn()}>Save</button>
          </div>
        </form>

        {special.length === 0 ? (
          <Empty title="Nothing scheduled" icon="map">
            Worth adding the next bank holiday now, while you are thinking about it.
          </Empty>
        ) : (
          <Table head={["Date", "Hours", "Why", ""]}>
            {special.map((s) => (
              <Row key={s.id}>
                <Cell className="whitespace-nowrap font-semibold">{fmtDate(new Date(s.day + "T00:00:00Z"))}</Cell>
                <Cell>{s.closed ? <Chip tone="bad">Closed</Chip> : <span className="font-semibold">{s.opens} to {s.closes}</span>}</Cell>
                <Cell className="text-grey">{s.note ?? "—"}</Cell>
                <Cell>
                  <form action={removeSpecialHours}>
                    <input type="hidden" name="businessId" value={id} />
                    <input type="hidden" name="id" value={s.id} />
                    <button className="text-[13px] font-bold text-red-800 underline">Remove</button>
                  </form>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
