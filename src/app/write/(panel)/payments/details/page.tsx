import { Card, Notice, PageHead, btn, field, labelCls } from "@/components/Dash";
import { fmtDate } from "@/components/Cards";
import { requireAuthor } from "@/lib/author-auth";
import { canStoreDetails, payeeState } from "@/lib/payee";
import { SUPPORT_EMAIL } from "@/lib/mail";
import { clearPayeeDetails, savePayeeDetails } from "../../../payee-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment details — PrimeStreet", robots: { index: false, follow: false } };

export default async function PaymentDetails({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireAuthor();
  const { msg, err } = await searchParams;
  const state = payeeState(me);
  const ready = canStoreDetails();
  // The account is never written back into this page. Rendering it would put the number in the page source
  // on every visit — in the browser cache, in a screen share, over someone's shoulder — for no benefit: the
  // masked last four is enough to recognise your own account, and changing it means typing it again.

  return (
    <>
      <PageHead
        title="Payment details"
        subtitle="Where your money goes. Only you and whoever runs our payment runs can see this."
        back={{ href: "/write/payments", label: "Payments" }}
      />

      {msg && <Notice tone="good" title="Saved">{msg}</Notice>}
      {err && <Notice tone="bad" title="Not saved">{err}</Notice>}

      {!ready && (
        <Notice tone="bad" title="We cannot store these securely right now">
          The encryption key is not configured on this server, so the form below is disabled. We will not keep bank
          details in plain text as a fallback. Tell us at <strong>{SUPPORT_EMAIL()}</strong> if you see this.
        </Notice>
      )}

      {ready && !state.payable && (
        <Notice tone="warn" title="We cannot pay you yet">
          Still needed: {state.missing.join(", ")}. Fill this in whenever you like — you do not need it to write or to be
          commissioned, only to be paid.
        </Notice>
      )}

      <Notice tone="info" title="How this is stored">
        Your account number and UTR are encrypted before they are written to our database, with a key held separately, so
        a copy of the database on its own does not give anyone your account. Nobody is emailed these details, they are
        never shown in any log, and we will never ask you for them by email or phone. If you get a message claiming to be
        us asking for your bank details, it is not us — forward it to <strong>{SUPPORT_EMAIL()}</strong>.
      </Notice>

      <Card title="Who we are paying" description="This goes on the invoice, so use the name and address you trade under.">
        <form action={savePayeeDetails} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="payeeName" className={labelCls}>Name money is paid to</label>
            <input id="payeeName" name="payeeName" className={field} defaultValue={me.payeeName ?? ""} placeholder="Your name, or your company" disabled={!ready} />
            <p className="mt-1.5 text-[13px] text-grey">Can differ from your byline — a limited company, for instance.</p>
          </div>
          <div>
            <label htmlFor="payeeAddress" className={labelCls}>Address for invoices</label>
            <textarea id="payeeAddress" name="payeeAddress" rows={3} className={field.replace("min-h-11", "min-h-20")} defaultValue={me.payeeAddress ?? ""} disabled={!ready} />
          </div>

          <div className="sm:col-span-2 border-t border-line pt-4">
            <p className="font-display text-[15px] font-extrabold">Bank account</p>
            <p className="mt-1 text-[13px] text-grey">
              {state.masked
                ? <>Currently on file: <strong>{state.masked}</strong>{me.bankUpdatedAt ? ` · updated ${fmtDate(me.bankUpdatedAt)}` : ""}. We do not show the full number back to you. Leave these blank to keep it, or type it again to replace it.</>
                : "Nothing on file yet."}
            </p>
          </div>
          <div>
            <label htmlFor="accountName" className={labelCls}>Name on the account</label>
            <input id="accountName" name="accountName" className={field} autoComplete="off" disabled={!ready} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sortCode" className={labelCls}>Sort code</label>
              <input id="sortCode" name="sortCode" className={field} inputMode="numeric" placeholder="04-00-04" autoComplete="off" disabled={!ready} />
            </div>
            <div>
              <label htmlFor="accountNumber" className={labelCls}>Account number</label>
              <input id="accountNumber" name="accountNumber" className={field} inputMode="numeric" placeholder="12345678" autoComplete="off" disabled={!ready} />
            </div>
          </div>
          <div>
            <label htmlFor="iban" className={labelCls}>IBAN <span className="font-normal text-grey">(only if you are paid outside the UK)</span></label>
            <input id="iban" name="iban" className={field} autoComplete="off" disabled={!ready} />
          </div>
          <div>
            <label htmlFor="swift" className={labelCls}>SWIFT/BIC <span className="font-normal text-grey">(optional)</span></label>
            <input id="swift" name="swift" className={field} autoComplete="off" disabled={!ready} />
          </div>

          <div className="sm:col-span-2 border-t border-line pt-4">
            <p className="font-display text-[15px] font-extrabold">Tax</p>
            <p className="mt-1 text-[13px] text-grey">We do not deduct tax. You are responsible for your own, and these are for our records and your invoices.</p>
          </div>
          <div>
            <label className={labelCls}>
              <input type="checkbox" name="vatRegistered" value="1" defaultChecked={me.vatRegistered} className="mr-2 size-4" disabled={!ready} />
              I am VAT registered
            </label>
            <label htmlFor="vatNumber" className={`${labelCls} mt-3`}>VAT number</label>
            <input id="vatNumber" name="vatNumber" className={field} defaultValue={me.vatNumber ?? ""} placeholder="GB123456789" disabled={!ready} />
          </div>
          <div>
            <label htmlFor="utr" className={labelCls}>UTR <span className="font-normal text-grey">(optional)</span></label>
            <input id="utr" name="utr" className={field} inputMode="numeric" placeholder="Ten digits" autoComplete="off" disabled={!ready} />
            <p className="mt-1.5 text-[13px] text-grey">
              {me.utrEnc ? "One is on file. Leave this blank to keep it, or type a new one to replace it." : "Your Unique Taxpayer Reference, if you want it on our records."}
            </p>
          </div>

          <div className="sm:col-span-2">
            <button className={btn()} disabled={!ready}>Save payment details</button>
          </div>
        </form>
      </Card>

      {(state.hasBank || me.utrEnc) && (
        <Card title="Remove what we hold" description="Your choice, at any time. Anything already paid stays in our records for accounting, but the account itself goes.">
          <form action={clearPayeeDetails}>
            <button className={btn("danger")}>Delete my bank details and UTR</button>
          </form>
        </Card>
      )}

      <Card title="What you can expect from us">
        <ul className="space-y-2 text-[14px] text-grey">
          <li><strong className="text-ink">A fee is agreed before you start</strong> and does not change afterwards, whatever the piece goes on to do.</li>
          <li><strong className="text-ink">We aim to approve or query an invoice within a week.</strong> If we are sitting on one, chase us — freelancers are not a credit line.</li>
          <li><strong className="text-ink">If we cancel commissioned work you have started, we pay for what you did.</strong> Our mistake, not yours.</li>
          <li><strong className="text-ink">You can remove these details at any time</strong> by clearing the fields and saving, or by asking us to delete them.</li>
        </ul>
      </Card>
    </>
  );
}
