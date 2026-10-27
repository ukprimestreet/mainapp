import Link from "next/link";
import { Card, Chip, Notice, PageHead, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requireAdmin } from "@/lib/auth";
import { PERMISSIONS, ROLES, permissionsFor, type Role } from "@/lib/admin-users";
import { auditByActor } from "@/lib/audit";
import { decryptField, encryptionReady } from "@/lib/secretbox";
import { formatSecret, provisioningUri } from "@/lib/totp";
import { db } from "@/lib/db";
import { adminSignOutEverywhere, confirmTotp, disableTotp, startTotp } from "../../admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your admin account", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Account({ searchParams }: { searchParams: Promise<{ msg?: string; totp?: string; recovery?: string }> }) {
  const session = await requireAdmin();
  const { msg, totp, recovery } = await searchParams;

  if (session.kind === "LEGACY") {
    return (
      <>
        <PageHead title="Your admin account" subtitle="You are signed in with the shared password." />
        <Notice tone="warn" title="This session has no identity">
          The shared password cannot have an account, a role or a second factor, and nothing you do with it can
          be attributed to a person. <Link href="/admin/admins" className="font-bold underline">Create your own
          account</Link>, set its password from the emailed link, and sign in with it. The shared password stops
          working by itself once a real account can sign in.
        </Notice>
      </>
    );
  }

  const me = session.admin;
  const row = await db.adminUser.findUnique({ where: { id: me.id } });
  const recent = await auditByActor(me.id, 20);
  const granted = permissionsFor(me.role);

  // Only read back during setup, and only to show the provisioning details once.
  const pendingSecret = totp === "new" && !row?.totpConfirmedAt ? decryptField(row?.totpSecretEnc ?? null) : null;
  const codes = recovery ? recovery.split(",").filter(Boolean) : [];
  const remainingCodes = (() => {
    try { return row?.recoveryCodeHashes ? (JSON.parse(row.recoveryCodeHashes) as string[]).length : 0; } catch { return 0; }
  })();

  return (
    <>
      <PageHead title="Your admin account" subtitle={`${me.name} · ${me.email}`} />

      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      {codes.length > 0 && (
        <Notice tone="warn" title="Save these recovery codes now — this is the only time they are shown">
          <p>Each one works once, in place of a code from your authenticator. Keep them somewhere other than your phone.</p>
          <ul className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-[15px] sm:grid-cols-4">
            {codes.map((c) => <li key={c} className="rounded-lg border-2 border-ink bg-white px-2 py-1 text-center">{c}</li>)}
          </ul>
          <p className="mt-3 text-[13px]">We store only a hash of each. If you lose them, a super admin can reset your account — we cannot recover them.</p>
        </Notice>
      )}

      <Card title="Who you are here">
        <dl className="grid gap-4 text-[15px] sm:grid-cols-2">
          <div><dt className="font-bold">Role</dt><dd>{ROLES[me.role as Role]?.label ?? me.role} — {ROLES[me.role as Role]?.blurb}</dd></div>
          <div><dt className="font-bold">Last signed in</dt><dd>{row?.lastLoginAt ? fmtDate(row.lastLoginAt) : "this is your first session"}</dd></div>
        </dl>
        <p className="mt-5 text-[14px] font-bold">What you may do</p>
        <ul className="mt-2 space-y-1 text-[14px]">
          {(Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).map((p) => (
            <li key={p} className={granted.includes(p) ? "font-semibold" : "text-grey"}>
              <span aria-hidden className="mr-2">{granted.includes(p) ? "✓" : "—"}</span>
              <span className="sr-only">{granted.includes(p) ? "Allowed: " : "Not allowed: "}</span>
              {PERMISSIONS[p]}
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Two-factor authentication"
        description="A six-digit code from an app on your phone, as well as your password. Worth having on an account that can move money."
      >
        {!encryptionReady() ? (
          <Notice tone="bad" title="Not available on this server">
            The encryption key is not configured, and the second-factor secret is never stored unencrypted.
          </Notice>
        ) : row?.totpConfirmedAt ? (
          <>
            <p className="text-[15px]">
              <Chip tone="good">on</Chip> Enabled {fmtDate(row.totpConfirmedAt)}. {remainingCodes} recovery{" "}
              {remainingCodes === 1 ? "code" : "codes"} left.
            </p>
            <form action={disableTotp} className="mt-5 flex max-w-sm flex-wrap items-end gap-3">
              <div className="min-w-[10rem] flex-1">
                <label htmlFor="code" className={labelCls}>Current code, to turn it off</label>
                <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" className={`${field} font-mono`} />
              </div>
              <button className={btn("danger")}>Turn off</button>
            </form>
            <p className="mt-2 text-[13px] text-grey">A current code is required, so a stolen session cannot remove it.</p>
          </>
        ) : pendingSecret ? (
          <>
            <p className="text-[15px]">Add this to your authenticator app, then enter a code to confirm it works.</p>
            <div className="mt-4 rounded-2xl border-2 border-ink p-4">
              <p className="text-[13px] font-bold uppercase tracking-wide text-grey">Secret, typed in by hand</p>
              <p className="mt-1 break-all font-mono text-[17px]">{formatSecret(pendingSecret)}</p>
              <p className="mt-3 text-[13px] font-bold uppercase tracking-wide text-grey">Or paste this link into the app</p>
              <p className="mt-1 break-all font-mono text-[12px] text-grey">{provisioningUri(pendingSecret, me.email)}</p>
            </div>
            <form action={confirmTotp} className="mt-4 flex max-w-sm flex-wrap items-end gap-3">
              <div className="min-w-[10rem] flex-1">
                <label htmlFor="code" className={labelCls}>Code from the app</label>
                <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className={`${field} font-mono`} />
              </div>
              <button className={btn()}>Confirm</button>
            </form>
            <p className="mt-2 text-[13px] text-grey">Nothing changes until a correct code proves the app has the same secret.</p>
          </>
        ) : (
          <form action={startTotp}>
            <p className="text-[15px] text-grey">Not set up. <Chip tone="quiet">off</Chip></p>
            <button className={`${btn()} mt-4`}>Set up two-factor</button>
          </form>
        )}
      </Card>

      <Card title="Sessions">
        <form action={adminSignOutEverywhere}>
          <button className={btn("ghost")}>Sign out of every device</button>
        </form>
        <p className="mt-2 text-[13px] text-grey">
          Use this if you have signed in somewhere you no longer trust. It also happens automatically whenever
          you set a new password.
        </p>
      </Card>

      <Card title="What you have done" description="The last 20 entries recorded against your account.">
        {recent.length === 0 ? (
          <p className="text-[15px] text-grey">Nothing recorded yet.</p>
        ) : (
          <ul className="space-y-2 text-[14px]">
            {recent.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b border-line pb-2 last:border-0">
                <span><strong>{e.action}</strong>{e.detail ? <span className="text-grey"> — {e.detail}</span> : null}</span>
                <span className="whitespace-nowrap text-grey">{fmtDate(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
