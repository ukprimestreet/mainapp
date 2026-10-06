"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** "Near me": the browser's Geolocation API (asked only when pressed) or a UK postcode. Coordinates go in the URL, are rounded to ~100 m, and are never stored. */
export function NearMe() {
  const router = useRouter();
  const sp = useSearchParams();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pc, setPc] = useState(sp.get("postcode") ?? "");

  const apply = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    p.delete("page");
    router.push(`/search?${p.toString()}`);
  };
  const locate = () => {
    if (!("geolocation" in navigator)) { setMsg("Your browser can't share its location. Enter a postcode instead."); return; }
    setBusy(true); setMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setBusy(false); apply({ near: `${pos.coords.latitude.toFixed(3)},${pos.coords.longitude.toFixed(3)}`, postcode: null, sort: "nearest" }); },
      (err) => { setBusy(false); setMsg(err.code === 1 ? "Location permission was denied. Enter a postcode instead." : "Couldn't get your location. Enter a postcode instead."); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  };
  return (
    <div className="rounded-2xl border border-line p-4">
      <h2 className="mb-2 font-display text-lg font-extrabold">Near you</h2>
      <button type="button" onClick={locate} disabled={busy} className="min-h-11 w-full rounded-full border-2 border-ink px-4 font-bold hover:bg-yellow disabled:opacity-60">{busy ? "Locating…" : "Use my location"}</button>
      <form onSubmit={(e) => { e.preventDefault(); apply({ postcode: pc.trim() || null, near: null, ...(pc.trim() ? { sort: "nearest" } : {}) }); }} className="mt-3 flex gap-2">
        <label htmlFor="postcode" className="sr-only">UK postcode</label>
        <input id="postcode" value={pc} onChange={(e) => setPc(e.target.value)} placeholder="Postcode, e.g. E8 3AA" autoComplete="postal-code" className="min-h-11 min-w-0 flex-1 rounded-lg border-2 border-line px-3" />
        <button className="min-h-11 rounded-full bg-ink px-4 font-bold text-yellow">Go</button>
      </form>
      {(sp.get("near") || sp.get("postcode")) && <button type="button" onClick={() => apply({ near: null, postcode: null, sort: null })} className="mt-3 text-sm font-bold underline">Clear location</button>}
      {msg && <p role="alert" className="mt-2 text-sm font-bold text-red-700">⚠ {msg}</p>}
      <p className="mt-2 text-xs text-grey">Your location is used only to sort this page. We don&apos;t store it.</p>
    </div>
  );
}
