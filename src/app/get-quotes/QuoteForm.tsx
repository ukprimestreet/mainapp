"use client";

import { useActionState, useEffect, useState } from "react";
import { requestQuotes, type QuoteState } from "./actions";

const field = "min-h-12 w-full rounded-xl border-2 border-line bg-white px-3 text-[15px] transition focus-visible:border-ink focus-visible:outline-none";
const label = "mb-1.5 block font-bold";
const btn = "min-h-12 rounded-full bg-ink px-6 font-bold text-yellow transition hover:bg-charcoal disabled:opacity-60";

export type Option = { id: string; name: string };
export type Borough = { id: string; name: string; localities: Option[] };
type Supply = { ok: boolean; message?: string; category?: string; place?: string; providers?: number; max?: number; state?: "none" | "thin" | "good" };

const URGENCIES = [
  ["EMERGENCY", "It is an emergency"],
  ["WITHIN_A_WEEK", "Within a week"],
  ["FLEXIBLE", "I am flexible"],
  ["PLANNING", "Just planning for now"],
] as const;

/**
 * The customer's job request.
 *
 * Two things shape this form. First, **no full address**: a postcode is enough to route a job, and asking
 * somebody for their street before they have a quote is asking for more than the task needs. Second, the
 * supply check runs as soon as the trade and the area are chosen, **before** any contact details are asked
 * for, so that nobody hands over a phone number for work we cannot get done.
 */
export function QuoteForm({ categories, boroughs, formToken }: { categories: Option[]; boroughs: Borough[]; formToken: string }) {
  const [state, action, pending] = useActionState<QuoteState, FormData>(requestQuotes, {});

  const [categoryId, setCategoryId] = useState("");
  const [boroughId, setBoroughId] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [supply, setSupply] = useState<Supply | null>(null);
  const [checking, setChecking] = useState(false);
  /** Set only by the customer, after being told nobody covers their area. */
  const [anyway, setAnyway] = useState(false);

  const borough = boroughs.find((b) => b.id === boroughId);
  const err = state.errors ?? {};

  // Checked whenever the pair changes, so the answer on screen always matches the current choice.
  useEffect(() => {
    if (!categoryId || !placeId) { setSupply(null); return; }
    let cancelled = false;
    setChecking(true);
    setAnyway(false); // a new trade or area is a new question; the last answer does not carry over
    fetch("/api/jobs/supply", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId, placeId }),
    })
      .then((r) => r.json() as Promise<Supply>)
      .then((r) => { if (!cancelled) setSupply(r); })
      .catch(() => { if (!cancelled) setSupply(null); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [categoryId, placeId]);

  // Ready means: we have answered the supply question, and the customer has accepted the answer. A bad
  // answer they have not seen yet is not a reason to start collecting their details.
  const ready = !!categoryId && !!placeId && !checking && !!supply?.ok && (supply.state !== "none" || anyway);

  return (
    <form action={action} className="space-y-10">
      <input type="hidden" name="ft" value={formToken} />
      <input type="hidden" name="company_site" value="" tabIndex={-1} aria-hidden className="hidden" />

      {state.message && !state.errors && <p role="alert" className="rounded-xl border-2 border-ink bg-yellow-soft p-3 font-bold">{state.message}</p>}
      {err.form && <p role="alert" className="rounded-xl border-2 border-red-700 p-3 font-bold text-red-800">{err.form}</p>}

      {/* ---------------------------------------------------------------- 1. what and where */}
      <section>
        <h2 className="font-display text-xl font-extrabold">1. What do you need doing?</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field id="categoryId" label="Kind of work" error={err.categoryId}>
            <select id="categoryId" name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required className={field}>
              <option value="">Choose…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field id="borough" label="Borough">
            <select id="borough" value={boroughId} onChange={(e) => { setBoroughId(e.target.value); setPlaceId(e.target.value); }} required className={field}>
              <option value="">Choose…</option>
              {boroughs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field id="placeId" label="Local area" hint="Optional — the borough is enough." error={err.placeId}>
            <select id="placeId" name="placeId" value={placeId} onChange={(e) => setPlaceId(e.target.value)} disabled={!borough} required className={field}>
              {borough
                ? <option value={borough.id}>Anywhere in {borough.name}</option>
                : <option value="">Pick a borough first</option>}
              {borough?.localities.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        </div>

        <div aria-live="polite" className="mt-4">
          {checking && <p className="text-[15px] text-grey">Checking who covers that area…</p>}
          {!checking && supply?.ok && supply.state === "good" && (
            <p className="rounded-xl border-2 border-ink bg-yellow-soft p-3 text-[15px]">
              <strong>{supply.providers} businesses</strong> cover {supply.place} for this kind of work. Your
              request goes to a maximum of {supply.max}.
            </p>
          )}
          {!checking && supply?.ok && supply.state === "thin" && (
            <p className="rounded-xl border-2 border-ink p-3 text-[15px]">
              We have <strong>one business</strong> covering {supply.place} for this. You will get one quote
              rather than a choice of two — worth knowing before you spend time on the rest of this form.
            </p>
          )}
          {!checking && supply?.ok && supply.state === "none" && (
            <div role="alert" className="rounded-xl border-2 border-red-700 p-4 text-[15px]">
              <p>
                <strong>We do not have anyone listed for this in {supply.place} yet.</strong> You can still
                send it — it tells us where to look for businesses, and a person will read it — but we cannot
                promise you a quote, and if the job is urgent you should not wait on us.
              </p>
              {/* Nobody hands over a phone number before being told this. The rest of the form stays shut
                  until they have said they want to send it anyway. */}
              {!anyway && (
                <button type="button" onClick={() => setAnyway(true)} className="mt-4 min-h-11 rounded-full border-2 border-ink px-5 font-bold transition hover:bg-mist">
                  Send it anyway
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* The rest of the form appears once there is something true to say about it, so nobody fills in their
          phone number and only then learns we cannot help. */}
      {ready && (
        <>
          <section>
            <h2 className="font-display text-xl font-extrabold">2. The job</h2>
            <div className="mt-4 grid gap-4">
              <Field id="description" label="What needs doing?" hint="The more a trade knows, the more useful the quote. At least 20 characters." error={err.description}>
                <textarea id="description" name="description" rows={5} required className={field.replace("min-h-12", "min-h-28")} defaultValue={state.values?.description} />
              </Field>

              <fieldset>
                <legend className={label}>How soon?</legend>
                {err.urgency && <p role="alert" className="mb-2 font-bold text-red-800">{err.urgency}</p>}
                <div className="grid gap-2 sm:grid-cols-2">
                  {URGENCIES.map(([value, text], i) => (
                    <label key={value} className="flex items-center gap-2.5 rounded-xl border-2 border-line bg-white px-3 py-2.5 text-[15px] hover:border-ink">
                      <input type="radio" name="urgency" value={value} defaultChecked={i === 2} className="size-4" />
                      {text}
                    </label>
                  ))}
                </div>
              </fieldset>

              <Field id="postcode" label="Postcode" hint="Optional. It helps a trade work out travel, and we never ask for your full address." error={err.postcode}>
                <input id="postcode" name="postcode" autoComplete="postal-code" placeholder="E8 3AA" className={`${field} max-w-[12rem]`} defaultValue={state.values?.postcode} />
              </Field>
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl font-extrabold">3. How they reach you</h2>
            <p className="mt-1 text-[15px] text-grey">
              Seen only by the businesses we pass this to — a maximum of {supply?.max ?? 2}. Never sold on,
              never published.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="name" label="Your name" error={err.name}>
                <input id="name" name="name" required autoComplete="name" className={field} defaultValue={state.values?.name} />
              </Field>
              <Field id="phone" label="Phone number" hint="Trades ring people. This is how you will hear back." error={err.phone}>
                <input id="phone" name="phone" required inputMode="tel" autoComplete="tel" className={field} defaultValue={state.values?.phone} />
              </Field>
              <Field id="email" label="Email" error={err.email}>
                <input id="email" name="email" type="email" required autoComplete="email" className={field} defaultValue={state.values?.email} />
              </Field>
              <Field id="contactTime" label="Best time to call" hint="Optional." error={err.contactTime}>
                <input id="contactTime" name="contactTime" placeholder="Weekday afternoons" className={field} defaultValue={state.values?.contactTime} />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border-2 border-ink p-6">
            <h2 className="font-display text-lg font-extrabold">Before you send it</h2>
            <label className="mt-4 flex items-start gap-2.5 text-[15px]">
              <input type="checkbox" name="consent" value="yes" required className="mt-1 size-4" />
              <span>
                Pass my request and contact details to a maximum of {supply?.max ?? 2} local businesses who
                cover my area, so they can quote for this job.
              </span>
            </label>
            {/* Separate, unticked, and nothing depends on it. A bundled opt-in is not a choice. */}
            <label className="mt-4 flex items-start gap-2.5 text-[15px]">
              <input type="checkbox" name="marketingOptIn" value="yes" className="mt-1 size-4" />
              <span>Also email me occasionally about PrimeStreet. Optional, and it changes nothing about this request.</span>
            </label>

            <button disabled={pending} className={`${btn} mt-6`}>{pending ? "Sending…" : "Send my request"}</button>
            <p className="mt-3 text-[13px] text-grey">
              We pass your details to those businesses and nobody else. You can ask us to delete them at any
              time. See our <a href="/privacy" className="underline">privacy notice</a>.
            </p>
          </section>
        </>
      )}
    </form>
  );
}

function Field({ id, label: text, hint, error, children, className = "" }: {
  id: string; label: string; hint?: string; error?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className={label}>{text}</label>
      {children}
      {hint && !error && <p className="mt-1.5 text-[13px] text-grey">{hint}</p>}
      {error && <p role="alert" className="mt-1.5 text-[13px] font-bold text-red-800">{error}</p>}
    </div>
  );
}
