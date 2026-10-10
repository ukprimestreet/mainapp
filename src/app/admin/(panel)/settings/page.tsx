import { Card, Chip, Notice, PageHead, area, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { adminConfigured } from "@/lib/auth";
import { SENDERS, SUPPORT_EMAIL, mailConfigured, senderAddress } from "@/lib/mail";
import { storageConfigured } from "@/lib/storage";
import { billingConfigured } from "@/lib/billing";
import { db } from "@/lib/db";
import { saveSetting } from "../../ops-actions";

export const dynamic = "force-dynamic";

/** Things an editor may reasonably change without a deploy. Secrets are never editable here. */
const EDITABLE = [
  { key: "site.tagline", label: "Site tagline", help: "Shown under the wordmark and in search results.", multiline: false },
  { key: "editorial.standards_note", label: "Standards note", help: "The short line shown in the footer of every email and page.", multiline: true },
  { key: "claims.auto_approve_domain_match", label: "Auto-approve matching email domains", help: "Type yes or no. When yes, a claim from an address on the company's own domain skips manual review.", multiline: false },
  { key: "reviews.min_chars", label: "Minimum review length", help: "How many characters a review must be before it can be submitted.", multiline: false },
  { key: "support.reply_hours", label: "Reply time we promise", help: "Used in the sales acknowledgement email. For example: two working days.", multiline: false },
] as const;

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const rows = await db.setting.findMany();
  const value = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
  const meta = (k: string) => rows.find((r) => r.key === k);

  const env = [
    { label: "Admin sign-in", ok: adminConfigured(), note: adminConfigured() ? process.env.ADMIN_EMAIL ?? "" : "ADMIN_EMAIL, ADMIN_PASSWORD and SESSION_SECRET needed" },
    { label: "Email delivery", ok: mailConfigured(), note: mailConfigured() ? `sending as ${senderAddress("accounts")}` : "RESEND_API_KEY and MAIL_DOMAIN needed — mail is recorded but not sent" },
    { label: "File storage", ok: storageConfigured(), note: storageConfigured() ? "portraits and CVs can be uploaded" : "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY needed" },
    { label: "Payments", ok: billingConfigured(), note: billingConfigured() ? "Stripe checkout is live" : "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET needed — owners see “Request this” instead" },
  ];

  return (
    <>
      <PageHead
        title="Settings"
        subtitle="What the site is configured to do, and the handful of things you can change here. Secrets live in the environment and are never editable from a web page."
      />
      {msg && <Notice tone="info" title="Done">{msg}</Notice>}

      <Card title="Configuration" description="Set in the environment. Change these where the site is hosted, then redeploy.">
        <ul className="space-y-3">
          {env.map((e) => (
            <li key={e.label} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="font-semibold">{e.label}</p>
                <p className="text-[13px] text-grey [overflow-wrap:anywhere]">{e.note}</p>
              </div>
              <Chip tone={e.ok ? "live" : "bad"}>{e.ok ? "Ready" : "Not set up"}</Chip>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Email senders" description="One address per purpose. Only the support address is a real inbox.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(SENDERS) as (keyof typeof SENDERS)[]).map((k) => (
            <li key={k} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
              <code className="text-[13px] [overflow-wrap:anywhere]">{senderAddress(k)}</code>
              <Chip tone={SENDERS[k].monitored ? "live" : "quiet"}>{SENDERS[k].monitored ? "Monitored" : "Send only"}</Chip>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-grey">Everything points replies at <strong>{SUPPORT_EMAIL()}</strong>.</p>
      </Card>

      <Card title="Editable settings" description="Changed here, applied immediately, and written to the audit log.">
        <div className="space-y-6">
          {EDITABLE.map((s) => {
            const m = meta(s.key);
            return (
              <form key={s.key} action={saveSetting} className="border-b border-line pb-6 last:border-0 last:pb-0">
                <input type="hidden" name="key" value={s.key} />
                <label className={labelCls} htmlFor={s.key}>{s.label}</label>
                {s.multiline
                  ? <textarea id={s.key} name="value" rows={2} defaultValue={value(s.key)} className={area} />
                  : <input id={s.key} name="value" defaultValue={value(s.key)} className={field} />}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[13px] text-grey">{s.help}</p>
                  <button className={btn("quiet")}>Save</button>
                </div>
                {m && <p className="mt-1 text-[12px] text-grey">Last changed {fmtDate(m.updatedAt)}{m.updatedBy ? ` by ${m.updatedBy}` : ""}.</p>}
              </form>
            );
          })}
        </div>
      </Card>
    </>
  );
}
