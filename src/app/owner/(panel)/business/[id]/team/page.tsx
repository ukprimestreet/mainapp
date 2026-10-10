import { Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requireBusiness } from "@/lib/owner";
import { db } from "@/lib/db";
import { cancelInvite, inviteTeammate, removeTeammate } from "../../../../business-actions";

export const dynamic = "force-dynamic";

export default async function Team({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params; const { msg } = await searchParams;
  const { business, owner } = await requireBusiness(id);
  const [managers, invites] = await Promise.all([
    db.businessOwner.findMany({ where: { businessId: id }, include: { owner: true } }),
    db.teamInvite.findMany({ where: { businessId: id, acceptedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  const live = invites.filter((i) => i.expiresAt > new Date());

  return (
    <>
      <PageHead
        title="Who can manage this"
        subtitle="Add a colleague so the listing does not depend on one person. There are no part-permissions yet: everyone here can edit the profile, reply to reviews, see enquiries and view billing. Only invite people you would trust with all of that."
        back={{ href: `/owner/business/${id}`, label: business.name }}
      />
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      <MetricRow cols={2}>
        <Metric label="Managers" value={managers.length} icon="users" tone={managers.length === 1 ? "warn" : "plain"} hint={managers.length === 1 ? "Only you — add a second" : undefined} />
        <Metric label="Invitations outstanding" value={live.length} icon="mail" />
      </MetricRow>

      {managers.length === 1 && (
        <Notice tone="warn" title="Only one person can manage this">
          If you leave the business or lose access to your email, nobody can update the listing. Adding a colleague takes a minute.
        </Notice>
      )}

      <Card title="Invite someone" description="They get an email with a link that works once and lasts seven days.">
        <form action={inviteTeammate} className="flex max-w-xl flex-wrap items-end gap-3">
          <input type="hidden" name="businessId" value={id} />
          <div className="min-w-[220px] flex-1">
            <label className={labelCls} htmlFor="email">Their email address</label>
            <input id="email" name="email" type="email" required className={field} placeholder="colleague@yourbusiness.co.uk" />
          </div>
          <button className={btn()}>Send invitation</button>
        </form>
      </Card>

      <Card title="Managers">
        <Table head={["Name", "Email", "Added", "Last signed in", ""]}>
          {managers.map((m) => (
            <Row key={m.ownerId}>
              <Cell className="font-semibold">
                {m.owner.name}
                {m.ownerId === owner.id && <span className="ml-2 align-middle"><Chip tone="live">You</Chip></span>}
              </Cell>
              <Cell className="text-grey [overflow-wrap:anywhere]">{m.owner.email}</Cell>
              <Cell className="whitespace-nowrap text-grey">{fmtDate(m.grantedAt)}</Cell>
              <Cell className="whitespace-nowrap text-grey">{m.owner.lastLoginAt ? fmtDate(m.owner.lastLoginAt) : "not yet"}</Cell>
              <Cell>
                {m.ownerId !== owner.id && managers.length > 1 && (
                  <form action={removeTeammate}>
                    <input type="hidden" name="businessId" value={id} />
                    <input type="hidden" name="ownerId" value={m.ownerId} />
                    <button className="text-[13px] font-bold text-red-800 underline">Remove</button>
                  </form>
                )}
              </Cell>
            </Row>
          ))}
        </Table>
      </Card>

      <Card title="Outstanding invitations">
        {live.length === 0 ? (
          <Empty title="None waiting" icon="mail">Invitations you send appear here until they are accepted.</Empty>
        ) : (
          <Table head={["Email", "Sent", "Expires", ""]}>
            {live.map((i) => (
              <Row key={i.id}>
                <Cell className="font-semibold [overflow-wrap:anywhere]">{i.email}</Cell>
                <Cell className="whitespace-nowrap text-grey">{fmtDate(i.createdAt)}</Cell>
                <Cell className="whitespace-nowrap text-grey">{fmtDate(i.expiresAt)}</Cell>
                <Cell>
                  <form action={cancelInvite}>
                    <input type="hidden" name="businessId" value={id} />
                    <input type="hidden" name="id" value={i.id} />
                    <button className="text-[13px] font-bold text-red-800 underline">Cancel</button>
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
