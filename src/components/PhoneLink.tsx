"use client";

/** A normal tel: link that also sends a click beacon (so owners can see phone interest). Works without JS. */
export function PhoneLink({ id, phone }: { id: string; phone: string }) {
  return (
    <a className="underline" href={`tel:${phone.replace(/\s/g, "")}`}
      onClick={() => { try { navigator.sendBeacon?.("/api/track/click", new Blob([JSON.stringify({ id, kind: "phone" })], { type: "application/json" })); } catch { /* ignore */ } }}>{phone}</a>
  );
}
