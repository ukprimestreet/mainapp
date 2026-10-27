"use client";

import { useActionState, useState } from "react";
import { register, type RegisterState } from "./actions";

const field = "min-h-12 w-full rounded-xl border-2 border-line bg-white px-3 text-[15px] transition focus-visible:border-ink focus-visible:outline-none";
const label = "mb-1.5 block font-bold";
const btn = "min-h-12 rounded-full bg-ink px-6 font-bold text-yellow transition hover:bg-charcoal disabled:opacity-60";
const ghost = "min-h-12 rounded-full border-2 border-ink px-6 font-bold transition hover:bg-mist disabled:opacity-60";

export type Option = { id: string; name: string };
export type Borough = { id: string; name: string; localities: Option[] };
type Address = { id: string; udprn: string; summary: string; line1: string; postTown: string; postcode: string };
type PlaceRef = { id: string; name: string; label: string; kind: string };
type Lookup = {
  ok: boolean; reason?: string; message?: string;
  postcode?: string; addresses?: Address[];
  place?: { chain: PlaceRef[]; authority: PlaceRef | null; ward: PlaceRef | null; localityCandidates: (PlaceRef & { distanceKm: number })[]; via: string; warnings: string[] };
};

/**
 * Business registration.
 *
 * The location step is the one that matters and the one that can go wrong, so it is explicit: the postcode
 * gives a list of real addresses to pick from, the address gives a resolved council area, and the person
 * then **confirms** which local area they are in from a short list of nearby ones. Nothing is auto-selected,
 * because the data cannot tell us a locality reliably — it returns a ward, not a neighbourhood.
 *
 * Manual selection is always available, not only as a fallback. Some people know their area better than a
 * postcode does, and the lookup costs money per call.
 */
export function RegisterForm({ categories, boroughs, formToken }: { categories: Option[]; boroughs: Borough[]; formToken: string }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(register, {});

  const [postcode, setPostcode] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [address, setAddress] = useState<Address | null>(null);
  const [manual, setManual] = useState(false);
  const [placeId, setPlaceId] = useState("");
  const [placeLabel, setPlaceLabel] = useState("");
  const [boroughId, setBoroughId] = useState("");
  const [wholeBorough, setWholeBorough] = useState(true);
  const [areaIds, setAreaIds] = useState<string[]>([]);

  const err = state.errors ?? {};
  const borough = boroughs.find((b) => b.id === boroughId);

  async function findAddresses() {
    setLooking(true); setLookup(null); setAddress(null); setPlaceId(""); setPlaceLabel("");
    try {
      const r = await fetch("/api/address/lookup", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ postcode }),
      });
      setLookup((await r.json()) as Lookup);
    } catch {
      setLookup({ ok: false, message: "We could not reach the address service. You can choose your area by hand instead." });
    } finally { setLooking(false); }
  }

  const chooseAddress = (a: Address) => {
    setAddress(a);
    // Offer the nearest named areas; the person picks. The ward is not a neighbourhood.
    const first = lookup?.place?.localityCandidates?.[0];
    if (first) { setPlaceId(first.id); setPlaceLabel(first.label); }
  };

  const toggleArea = (id: string) =>
    setAreaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // If the business is already listed, the honest answer is "claim it", not "register a second copy".
  if (state.existing) {
    return (
      <div className="rounded-2xl border-2 border-ink bg-yellow-soft p-6">
        <h2 className="font-display text-xl font-extrabold">{state.existing.name} is already on PrimeStreet</h2>
        <p className="mt-2 text-[15px]">We matched it on {state.existing.reason}. If that is your business, claim the existing listing rather than creating a second one — you keep any reviews and search history it already has.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href={state.existing.href} className={btn}>Claim {state.existing.name}</a>
          <form action={action} className="contents">
            <HiddenState {...{ postcode, address, placeId, boroughId, wholeBorough, areaIds, formToken }} />
            <PreservedFields values={state.values} />
            <input type="hidden" name="confirmedNotDuplicate" value="yes" />
            <button className={ghost} disabled={pending}>{pending ? "Sending…" : "No, mine is a different business"}</button>
          </form>
        </div>
        <p className="mt-4 text-[13px] text-grey">Two listings for one business split its reviews and confuse customers, so we check before creating one.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-10">
      <input type="hidden" name="ft" value={formToken} />
      <input type="hidden" name="company_site" value="" tabIndex={-1} aria-hidden className="hidden" />

      {state.message && !state.errors && <p role="alert" className="rounded-xl border-2 border-ink bg-yellow-soft p-3 font-bold">{state.message}</p>}
      {err.form && <p role="alert" className="rounded-xl border-2 border-red-700 p-3 font-bold text-red-800">{err.form}</p>}

      {/* ---------------------------------------------------------------- 1. the business */}
      <section>
        <h2 className="font-display text-xl font-extrabold">1. Your business</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="businessName" label="Business name" error={err.businessName}>
            <input id="businessName" name="businessName" required className={field} defaultValue={state.values?.businessName} />
          </Field>
          <Field id="phone" label="Phone number" hint="Customers see this. Leave it blank if you would rather be emailed." error={err.phone}>
            <input id="phone" name="phone" inputMode="tel" className={field} defaultValue={state.values?.phone} />
          </Field>
          <Field id="website" label="Website" hint="Optional, and it helps us verify you own the business." error={err.website} className="sm:col-span-2">
            <input id="website" name="website" inputMode="url" placeholder="https://" className={field} defaultValue={state.values?.website} />
          </Field>
          <Field id="description" label="What do you do?" hint="At least 60 characters, in your own words. This is what customers read." error={err.description} className="sm:col-span-2">
            <textarea id="description" name="description" rows={5} required className={field.replace("min-h-12", "min-h-28")} defaultValue={state.values?.description} />
          </Field>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 2. where you are */}
      <section>
        <h2 className="font-display text-xl font-extrabold">2. Where you are based</h2>
        <p className="mt-1 text-[15px] text-grey">This decides which job enquiries can reach you, so it is worth getting right.</p>

        {!manual && (
          <div className="mt-4">
            <Field id="postcode" label="Postcode" error={err.postcode}>
              <div className="flex flex-wrap gap-3">
                <input id="postcode" name="postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)}
                  autoComplete="postal-code" className={`${field} max-w-[12rem]`} placeholder="E8 3AA" />
                <button type="button" onClick={findAddresses} disabled={looking || postcode.trim().length < 5} className={ghost}>
                  {looking ? "Looking…" : "Find my address"}
                </button>
              </div>
            </Field>

            {lookup && !lookup.ok && (
              <p role="alert" className="mt-3 rounded-xl border-2 border-red-700 p-3 text-[15px]">
                {lookup.message} <button type="button" onClick={() => setManual(true)} className="font-bold underline">Choose my area by hand</button>
              </p>
            )}

            {lookup?.ok && !address && (
              <fieldset className="mt-4">
                <legend className="font-bold">Pick your address</legend>
                <ul className="mt-2 divide-y divide-line rounded-2xl border-2 border-line">
                  {(lookup.addresses ?? []).map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => chooseAddress(a)} className="w-full px-4 py-3 text-left text-[15px] hover:bg-mist">
                        {a.summary}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[13px] text-grey">
                  Not there? <button type="button" onClick={() => setManual(true)} className="font-bold underline">Choose your area by hand</button>.
                </p>
              </fieldset>
            )}

            {address && (
              <div className="mt-4 rounded-2xl border-2 border-ink p-5">
                <p className="text-[15px]"><strong>{address.summary}</strong></p>
                {lookup?.place?.authority && (
                  <p className="mt-1 text-[14px] text-grey">
                    Council area: <strong className="text-ink">{lookup.place.authority.name}</strong>
                    {lookup.place.via === "name" && " (please check this is right)"}
                  </p>
                )}

                <fieldset className="mt-4">
                  <legend className="font-bold">Which local area are you in?</legend>
                  <p className="mb-2 text-[13px] text-grey">
                    We cannot tell this from a postcode reliably, so please confirm it.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(lookup?.place?.localityCandidates ?? []).map((c) => (
                      <button type="button" key={c.id}
                        onClick={() => { setPlaceId(c.id); setPlaceLabel(c.label); }}
                        aria-pressed={placeId === c.id}
                        className={`rounded-xl border-2 px-3.5 py-1.5 text-sm font-bold ${placeId === c.id ? "border-ink bg-yellow" : "border-line bg-white hover:border-ink"}`}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {(lookup?.place?.localityCandidates ?? []).length === 0 && (
                    <p className="text-[15px]">
                      No nearby areas to suggest. <button type="button" onClick={() => setManual(true)} className="font-bold underline">Choose by hand</button>.
                    </p>
                  )}
                </fieldset>
                <button type="button" onClick={() => { setAddress(null); setPlaceId(""); }} className="mt-4 text-sm font-bold underline">
                  Use a different address
                </button>
              </div>
            )}
          </div>
        )}

        {manual && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="mb" label="Borough">
              <select id="mb" value={boroughId} onChange={(e) => { setBoroughId(e.target.value); setPlaceId(""); setPlaceLabel(""); }} className={field}>
                <option value="">Choose…</option>
                {boroughs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field id="ml" label="Local area" error={err.placeId}>
              <select id="ml" value={placeId} onChange={(e) => { setPlaceId(e.target.value); setPlaceLabel(e.target.selectedOptions[0]?.text ?? ""); }} className={field} disabled={!borough}>
                <option value="">{borough ? "Choose…" : "Pick a borough first"}</option>
                {borough?.localities.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field id="postcode2" label="Postcode" hint="So customers and we can find you." error={err.postcode} className="sm:col-span-2">
              <input id="postcode2" name="postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} autoComplete="postal-code" className={`${field} max-w-[12rem]`} />
            </Field>
            <p className="sm:col-span-2 text-[13px] text-grey">
              <button type="button" onClick={() => setManual(false)} className="font-bold underline">Use my postcode to find my address instead</button>
            </p>
          </div>
        )}

        {placeId && <p className="mt-3 text-[15px]">Based in <strong>{placeLabel}</strong>.</p>}
      </section>

      {/* ---------------------------------------------------------------- 3. what you do */}
      <section>
        <h2 className="font-display text-xl font-extrabold">3. What you offer</h2>
        <p className="mt-1 text-[15px] text-grey">Pick everything that applies. It decides which enquiries reach you.</p>
        <fieldset className="mt-4">
          <legend className="sr-only">Services</legend>
          {err.categoryIds && <p role="alert" className="mb-2 font-bold text-red-800">{err.categoryIds}</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2.5 rounded-xl border-2 border-line bg-white px-3 py-2.5 text-[15px] hover:border-ink">
                <input type="checkbox" name="categoryIds" value={c.id} className="size-4" />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {/* ---------------------------------------------------------------- 4. where you work */}
      <section>
        <h2 className="font-display text-xl font-extrabold">4. Where you will travel to</h2>
        <p className="mt-1 text-[15px] text-grey">
          Only areas you would genuinely go to. We will not send you work you do not want, and we will not
          send a customer a business that was never going to turn up.
        </p>
        {err.serviceAreaIds && <p role="alert" className="mt-2 font-bold text-red-800">{err.serviceAreaIds}</p>}

        <label className="mt-4 flex items-start gap-2.5 text-[15px]">
          <input type="checkbox" checked={wholeBorough} onChange={(e) => { setWholeBorough(e.target.checked); setAreaIds([]); }} className="mt-1 size-4" />
          <span>
            <strong>Whole boroughs</strong> — simpler, and you can change it later.
          </span>
        </label>
        <input type="hidden" name="serviceAreaMode" value={wholeBorough ? "INCLUDES_CHILDREN" : "EXACT"} />

        <fieldset className="mt-4">
          <legend className="sr-only">Areas you cover</legend>
          {wholeBorough ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {boroughs.map((b) => (
                <label key={b.id} className="flex items-center gap-2.5 rounded-xl border-2 border-line bg-white px-3 py-2.5 text-[15px] hover:border-ink">
                  <input type="checkbox" name="serviceAreaIds" value={b.id} checked={areaIds.includes(b.id)} onChange={() => toggleArea(b.id)} className="size-4" />
                  {b.name}
                </label>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {boroughs.map((b) => (
                <details key={b.id} className="rounded-2xl border-2 border-line p-4">
                  <summary className="cursor-pointer font-bold">{b.name}</summary>
                  <div className="mt-3 grid gap-1.5 sm:grid-cols-3">
                    {b.localities.map((l) => (
                      <label key={l.id} className="flex items-center gap-2 text-[14px]">
                        <input type="checkbox" name="serviceAreaIds" value={l.id} checked={areaIds.includes(l.id)} onChange={() => toggleArea(l.id)} className="size-4" />
                        {l.name}
                      </label>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </fieldset>
        <p className="mt-3 text-[13px] text-grey">{areaIds.length} selected.</p>
      </section>

      {/* ---------------------------------------------------------------- 5. you */}
      <section>
        <h2 className="font-display text-xl font-extrabold">5. You</h2>
        <p className="mt-1 text-[15px] text-grey">
          So we can confirm you are connected to the business. Your name and role are not shown publicly.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field id="contactName" label="Your name" error={err.contactName}>
            <input id="contactName" name="contactName" required className={field} defaultValue={state.values?.contactName} />
          </Field>
          <Field id="contactRole" label="Your role" hint="Owner, director, manager…" error={err.contactRole}>
            <input id="contactRole" name="contactRole" required className={field} defaultValue={state.values?.contactRole} />
          </Field>
          <Field id="contactEmail" label="Your email" hint="We send a link here to confirm it." error={err.contactEmail}>
            <input id="contactEmail" name="contactEmail" type="email" required autoComplete="email" className={field} defaultValue={state.values?.contactEmail} />
          </Field>
        </div>
      </section>

      <HiddenState {...{ postcode, address, placeId, boroughId, wholeBorough, areaIds, formToken }} />

      <section className="rounded-2xl border-2 border-ink p-6">
        <h2 className="font-display text-lg font-extrabold">What happens next</h2>
        <ol className="mt-3 space-y-2 text-[15px]">
          <li><strong>1.</strong> We email you a link to confirm your address.</li>
          <li><strong>2.</strong> A person checks the listing before it goes live, usually within a working day. We check because a directory nobody checks is not worth reading.</li>
          <li><strong>3.</strong> Your listing goes live, you get your dashboard, and <strong>five lead credits</strong> are added so customer enquiries can reach you.</li>
        </ol>
        <p className="mt-4 text-[14px] text-grey">
          Listing is free and stays free. Lead credits are £1 each after the first five, and you never have to
          buy any to keep your listing. Nothing you pay for changes your rating, your reviews or where you
          appear in search.
        </p>
        <button disabled={pending} className={`${btn} mt-5`}>{pending ? "Sending…" : "Register my business"}</button>
        <p className="mt-3 text-[13px] text-grey">
          By registering you agree we may contact you about enquiries and your account. See our{" "}
          <a href="/privacy" className="underline">privacy notice</a>.
        </p>
      </section>
    </form>
  );
}

/** The location choices, carried as hidden inputs so the server sees exactly what the person confirmed. */
/**
 * The choices that have no visible input of their own. Service areas and the mode are NOT here: they are
 * real fields in the form already, and mirroring them sent every id twice, which made validation reject
 * them as unrecognised. Found by the end-to-end suite.
 */
function HiddenState({ postcode, address, placeId }: {
  postcode: string; address: Address | null; placeId: string; boroughId: string; wholeBorough: boolean; areaIds: string[]; formToken: string;
}) {
  return (
    <>
      <input type="hidden" name="placeId" value={placeId} />
      <input type="hidden" name="address" value={address ? [address.line1, address.postTown].filter(Boolean).join(", ") : ""} />
      <input type="hidden" name="udprn" value={address?.udprn ?? ""} />
      {!address && <input type="hidden" name="postcode" value={postcode} />}
    </>
  );
}

/** Re-sends what the person typed when the duplicate check interrupts them, so nothing is retyped. */
function PreservedFields({ values }: { values?: Record<string, string> }) {
  if (!values) return null;
  return <>{Object.entries(values).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>;
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
