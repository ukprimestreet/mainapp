import { Card, Cell, Chip, Empty, Metric, MetricRow, Notice, PageHead, Row, Table, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS, ROLES, permissionsFor, type Role } from "@/lib/admin-users";
import { db } from "@/lib/db";
import { addAdmin, resendAdminSetup, setAdminActive, setAdminRole } from "../../admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administrators — Admin", robots: { index: false, follow: false } };

export default async function Admins({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  // Not just a hidden link: the permission is checked on the server, on every request.
  const session = await requirePermission("admins.manage");
  const { msg } = await searchParams;

  const admins = await db.adminUser.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { email: "asc" }] });
  const superAdmins = admins.filter((a) => a.role === "SUPER_ADMIN" && a.active).length;
  const pending = admins.filter((a) => !a.passwordHash).length;
  const withTotp = admins.filter((a) => a.totpConfirmedAt).length;
  const me = session.kind === "USER" ? session.admin.id : null;

  return (
    <>
      <PageHead
        title="Administrators"
        subtitle="Who can reach the admin, and what each of them may do. Every action one of them takes is recorded against their name."
      />

      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      {session.kind === "LEGACY" && (
        <Notice tone="warn" title="You are signed in with the shared password">
          That means nothing you do here can be attributed to a person. Create your own account below, set its
          password from the emailed link, and sign in with it — the shared password stops working by itself at
          that point.
        </Notice>
      )}

      {admins.length === 0 && (
        <Notice tone="warn" title="No individual accounts yet">
          Until one exists, the admin is protected by a single shared password and the audit log cannot say
          who did anything.
        </Notice>
      )}

      <MetricRow>
        <Metric label="Administrators" value={admins.filter((a) => a.active).length} icon="users" />
        <Metric label="Super admins" value={superAdmins} icon="shield" tone={superAdmins === 1 ? "warn" : "plain"} hint={superAdmins === 1 ? "Only one — add a second" : undefined} />
        <Metric label="Awaiting setup" value={pending} icon="mail" tone={pending ? "accent" : "plain"} />
        <Metric label="With two-factor" value={`${withTotp}/${admins.length}`} icon="check" tone={withTotp < admins.length ? "warn" : "plain"} />
      </MetricRow>

      {superAdmins === 1 && admins.length > 0 && (
        <Notice tone="warn" title="Only one super admin">
          If that person loses access, nobody can manage administrators or money. A second one costs nothing.
        </Notice>
      )}

      <Card title="Add an administrator" description="They get an email with a one-time link and choose their own password. You never see it.">
        <form action={addAdmin} className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="name" className={labelCls}>Name</label>
            <input id="name" name="name" required className={field} />
          </div>
          <div>
            <label htmlFor="email" className={labelCls}>Email</label>
            <input id="email" name="email" type="email" required className={field} />
          </div>
          <div>
            <label htmlFor="role" className={labelCls}>Role</label>
            <select id="role" name="role" className={field} defaultValue="ADMIN">
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-3">
            <button className={btn()}>Create and send the setup link</button>
          </div>
        </form>
      </Card>

      <Card title="Everyone with access">
        {admins.length === 0 ? (
          <Empty title="Nobody yet" icon="users">Add the first administrator above.</Empty>
        ) : (
          <Table head={["Person", "Role", "State", "Last signed in", "Two-factor", ""]}>
            {admins.map((a) => (
              <Row key={a.id}>
                <Cell className="[overflow-wrap:anywhere]">
                  <strong>{a.name}</strong>
                  {a.id === me && <span className="ml-2 align-middle"><Chip tone="live">you</Chip></span>}
                  <span className="block text-[13px] text-grey">{a.email}</span>
                </Cell>
                <Cell>
                  <form action={setAdminRole} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={a.id} />
                    <select name="role" defaultValue={a.role} className="min-h-9 rounded-lg border-2 border-line px-2 text-sm">
                      {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button className="text-sm font-bold underline">Set</button>
                  </form>
                </Cell>
                <Cell>
                  {!a.active ? <Chip tone="bad">deactivated</Chip>
                    : !a.passwordHash ? <Chip tone="review">awaiting setup</Chip>
                    : <Chip tone="good">active</Chip>}
                </Cell>
                <Cell className="whitespace-nowrap text-[13px] text-grey">{a.lastLoginAt ? fmtDate(a.lastLoginAt) : "never"}</Cell>
                <Cell>{a.totpConfirmedAt ? <Chip tone="good">on</Chip> : <Chip tone="quiet">off</Chip>}</Cell>
                <Cell>
                  <div className="flex flex-wrap gap-2">
                    <form action={resendAdminSetup}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="text-sm font-bold underline">{a.passwordHash ? "Send reset link" : "Resend link"}</button>
                    </form>
                    <form action={setAdminActive}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="active" value={a.active ? "0" : "1"} />
                      <button className={`text-sm font-bold underline ${a.active ? "text-red-800" : ""}`}>
                        {a.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </form>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Card title="What each role may do" description="Checked on the server for every protected operation. A hidden button is not an access control.">
        <div className="grid gap-6 sm:grid-cols-2">
          {(Object.keys(ROLES) as Role[]).map((role) => {
            const granted = permissionsFor(role);
            return (
              <div key={role} className="rounded-2xl border-2 border-line p-5">
                <p className="font-display text-[17px] font-extrabold">{ROLES[role].label}</p>
                <p className="mt-1 text-[14px] text-grey">{ROLES[role].blurb}</p>
                <ul className="mt-4 space-y-1.5 text-[14px]">
                  {(Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).map((p) => (
                    <li key={p} className={granted.includes(p) ? "" : "text-grey/70"}>
                      <span aria-hidden className="mr-2">{granted.includes(p) ? "✓" : "—"}</span>
                      <span className="sr-only">{granted.includes(p) ? "Allowed: " : "Not allowed: "}</span>
                      {PERMISSIONS[p]}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
