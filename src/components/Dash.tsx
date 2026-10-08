import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Dashboard design system, shared by the admin, author and business-owner panels so all three feel like one product.
 * The look: a dark rail, generous white space, big legible numbers, one accent (PrimeStreet yellow) used sparingly
 * for the thing that matters on each screen. Brand rule holds — yellow, black, white and restrained greys only.
 */

export function DashShell({
  title, subtitle, nav, actions, children, footer,
}: {
  title: string; subtitle?: string;
  nav?: ReactNode; actions?: ReactNode; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-mist">
      {nav}
      <main className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-1 max-w-2xl text-grey">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        {children}
        {footer}
      </main>
    </div>
  );
}

/** The dark navigation rail. Horizontal and scrollable on small screens. */
export function DashNav({
  brand, items, active, right,
}: {
  brand: ReactNode;
  items: readonly { href: string; label: string; badge?: number }[];
  active: string;
  right?: ReactNode;
}) {
  return (
    <div className="on-dark sticky top-0 z-30 bg-ink text-white">
      <div className="mx-auto flex w-full max-w-[1280px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 shrink-0 items-center">{brand}</div>
        <nav aria-label="Dashboard" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-2">
          {items.map((i) => {
            const on = i.href === active || (i.href !== "/" && active.startsWith(i.href + "/"));
            return (
              <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${on ? "bg-yellow text-ink" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
                {i.label}
                {!!i.badge && (
                  <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-extrabold ${on ? "bg-ink text-yellow" : "bg-yellow text-ink"}`}>{i.badge}</span>
                )}
              </Link>
            );
          })}
        </nav>
        {right && <div className="flex shrink-0 items-center gap-3 text-sm">{right}</div>}
      </div>
      <div className="h-1 bg-yellow" />
    </div>
  );
}

/** A metric tile. `tone="accent"` marks the one number that matters most on the screen. */
export function Stat({
  label, value, hint, href, tone = "plain",
}: {
  label: string; value: ReactNode; hint?: string; href?: string; tone?: "plain" | "accent" | "dark" | "warn";
}) {
  const tones = {
    plain: "bg-white border-line",
    accent: "bg-yellow-soft border-ink",
    dark: "bg-ink text-white border-ink",
    warn: "bg-white border-red-700",
  } as const;
  const inner = (
    <>
      <p className={`text-sm font-bold ${tone === "dark" ? "text-white/70" : "text-grey"}`}>{label}</p>
      <p className="mt-1 font-display text-4xl font-extrabold leading-none tracking-tight">{value}</p>
      {hint && <p className={`mt-2 text-xs ${tone === "dark" ? "text-white/60" : "text-grey"}`}>{hint}</p>}
    </>
  );
  const cls = `block rounded-2xl border-2 p-5 ${tones[tone]} ${href ? "transition hover:-translate-y-0.5 hover:shadow-lg" : ""}`;
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function StatRow({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={`mb-8 grid gap-4 ${c}`}>{children}</div>;
}

/** A white panel with a title and optional action. The main building block for lists and forms. */
export function Panel({
  title, action, children, description, className = "",
}: {
  title?: string; action?: ReactNode; children: ReactNode; description?: string; className?: string;
}) {
  return (
    <section className={`mb-8 overflow-hidden rounded-2xl border-2 border-line bg-white ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="font-display text-lg font-extrabold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-grey">{description}</p>}
          </div>
          {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const CHIPS = {
  draft: "border-line bg-mist text-ink",
  review: "border-ink bg-yellow text-ink",
  live: "border-ink bg-ink text-white",
  good: "border-ink bg-yellow-soft text-ink",
  bad: "border-red-700 bg-white text-red-800",
  quiet: "border-line bg-white text-grey",
} as const;
export function Chip({ tone = "quiet", children }: { tone?: keyof typeof CHIPS; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border-2 px-3 py-0.5 text-xs font-extrabold uppercase tracking-wide ${CHIPS[tone]}`}>{children}</span>;
}

/** Progress bar with its value stated in text as well, so it is not colour-only. */
export function Progress({ percent, label, target }: { percent: number; label?: string; target?: number }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const met = target == null || p >= target;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold">{label ?? "Complete"}</span>
        <span className="font-display text-xl font-extrabold">{p}%{target != null && <span className="ml-1 text-xs font-bold text-grey">of {target}% needed</span>}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-mist" role="img" aria-label={`${p} per cent complete${target != null ? `, ${target} per cent needed` : ""}`}>
        <div className={`h-full rounded-full ${met ? "bg-ink" : "bg-yellow"}`} style={{ width: `${Math.max(p, 2)}%` }} />
      </div>
    </div>
  );
}

export function DashTable({ head, children }: { head: readonly string[]; children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b-2 border-ink">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap py-2 pr-4 font-extrabold">{h || <span className="sr-only">Actions</span>}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export const Row = ({ children }: { children: ReactNode }) => <tr className="border-b border-line align-top last:border-0">{children}</tr>;
export const Cell = ({ children, className = "" }: { children?: ReactNode; className?: string }) => <td className={`py-3 pr-4 ${className}`}>{children}</td>;

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line px-6 py-12 text-center">
      <p className="font-display text-xl font-extrabold">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-grey">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** A notice that carries a decision or a blocker. Never colour alone: each one is prefixed with a word. */
export function Notice({ tone = "info", title, children }: { tone?: "info" | "good" | "bad" | "warn"; title?: string; children: ReactNode }) {
  const map = {
    info: { cls: "border-ink bg-white", word: "Note" },
    good: { cls: "border-ink bg-yellow-soft", word: "Approved" },
    bad: { cls: "border-red-700 bg-white", word: "Changes requested" },
    warn: { cls: "border-ink bg-yellow", word: "Action needed" },
  } as const;
  const m = map[tone];
  return (
    <div className={`mb-6 rounded-2xl border-2 p-5 ${m.cls}`}>
      <p className="text-xs font-extrabold uppercase tracking-wider">{title ?? m.word}</p>
      <div className="mt-1 [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

export const btn = (kind: "primary" | "ghost" | "danger" = "primary") =>
  ({
    primary: "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 font-bold text-yellow transition hover:bg-black",
    ghost: "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink px-5 font-bold text-ink transition hover:bg-yellow",
    danger: "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-red-700 px-5 font-bold text-red-800 transition hover:bg-red-700 hover:text-white",
  })[kind];

export const field = "min-h-11 w-full rounded-xl border-2 border-line bg-white px-3 text-base focus-visible:border-ink";
export const area = "w-full rounded-xl border-2 border-line bg-white p-3 text-base focus-visible:border-ink";
export const labelCls = "mb-1 block text-sm font-bold";
