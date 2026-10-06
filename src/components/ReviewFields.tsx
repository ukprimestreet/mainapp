"use client";
import type { ReactNode } from "react";

export const fieldCls = "min-h-12 w-full rounded-xl border-2 border-line bg-white px-3 py-2 text-base";

export function RField({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-bold">{label}</label>
      {hint && <p className="mb-1 text-sm text-grey">{hint}</p>}
      {children}
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {error}</p>}
    </div>
  );
}

/** Accessible 1–5 star radio group (text + shape, never colour alone). */
export function StarInput({ value, onChange, error }: { value: number; onChange: (n: number) => void; error?: string }) {
  return (
    <fieldset>
      <legend className="mb-1 font-bold">Your rating</legend>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`flex min-h-12 cursor-pointer items-center gap-1 rounded-xl border-2 px-4 font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 ${value === n ? "border-ink bg-yellow" : "border-line hover:border-ink"}`}>
            <input type="radio" name="rating" value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
            <span aria-hidden>{"★".repeat(n)}</span><span className="sr-only">{n} out of 5 — </span><span className="text-sm">{["Poor", "Fair", "Good", "Very good", "Excellent"][n - 1]}</span>
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-1 text-sm font-bold text-red-700">⚠ {error}</p>}
    </fieldset>
  );
}
