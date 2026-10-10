import Link from "next/link";
import type { ReactNode } from "react";
import type { Series } from "@/lib/analytics";
import { Sparkline } from "./Chart";
import { Icon, type IconName } from "./Icon";

/** Buttons, fields and labels, shared by every dashboard so the three never drift apart. */
export const btn = (kind: "primary" | "ghost" | "danger" | "quiet" = "primary") =>
  ({
    primary: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[15px] font-bold text-yellow transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
    ghost: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-ink px-5 text-[15px] font-bold text-ink transition hover:bg-yellow",
    danger: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-red-700 px-5 text-[15px] font-bold text-red-800 transition hover:bg-red-700 hover:text-white",
    quiet: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-bold text-ink transition hover:border-ink",
  })[kind];

export const field = "min-h-11 w-full rounded-xl border-2 border-line bg-white px-3 text-[15px] transition focus-visible:border-ink focus-visible:outline-none";
export const area = "w-full rounded-xl border-2 border-line bg-white p-3 text-[15px] transition focus-visible:border-ink focus-visible:outline-none";
export const labelCls = "mb-1.5 block text-sm font-bold";

/** A metric tile: the number, how it moved, and the shape of the last 30 days. */
export function Metric({
  label, value, series, hint, href, tone = "plain", icon, unit,
}: {
  label: string; value: ReactNode; series?: Series; hint?: string; href?: string;
  tone?: "plain" | "accent" | "dark" | "warn"; icon?: IconName; unit?: string;
}) {
  const tones = {
    plain: "bg-white border-line",
    accent: "bg-yellow border-ink",
    dark: "bg-ink text-white border-ink",
    warn: "bg-white border-red-700",
  } as const;
  const dark = tone === "dark";
  // On the yellow tile, grey text fails contrast — use ink for the supporting copy instead.
  const muted = dark ? "text-white/70" : tone === "accent" ? "text-ink/75" : "text-grey";
  const delta = series?.deltaPct ?? null;
  const up = (delta ?? 0) >= 0;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-[13px] font-bold uppercase tracking-wide ${muted}`}>{label}</p>
        {icon && <Icon name={icon} size={18} className={dark ? "text-white/70" : tone === "accent" ? "text-ink/70" : "text-grey"} />}
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="font-display text-[34px] font-extrabold leading-none tracking-tight tabular-nums">{value}</span>
        {unit && <span className={`text-sm font-bold ${muted}`}>{unit}</span>}
      </p>
      {delta !== null && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] font-bold">
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 ${
            dark ? "bg-white/15 text-white" : up ? "bg-yellow-soft text-ink" : "bg-mist text-grey"}`}>
            <span aria-hidden>{up ? "↑" : "↓"}</span>{Math.abs(delta)}%
          </span>
          <span className={muted}>vs previous period</span>
        </p>
      )}
      {hint && !delta && <p className={`mt-2 text-[13px] ${muted}`}>{hint}</p>}
      {series && <div className="mt-3 -mb-1"><Sparkline series={series} label={label} tone={dark ? "white" : tone === "accent" ? "ink" : "ink"} /></div>}
    </>
  );

  const cls = `block rounded-2xl border-2 p-5 ${tones[tone]} ${href ? "transition hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(10,10,10,.35)]" : ""}`;
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function MetricRow({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 xl:grid-cols-4" }[cols];
  return <div className={`mb-7 grid gap-4 ${c}`}>{children}</div>;
}

export function Card({
  title, description, action, children, className = "", pad = true,
}: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`mb-7 overflow-hidden rounded-2xl border border-line bg-white ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="font-display text-[17px] font-extrabold tracking-tight">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-grey">{description}</p>}
          </div>
          {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={`min-w-0 ${pad ? "p-5" : ""}`}>{children}</div>
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
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${CHIPS[tone]}`}>{children}</span>;
}

export function Progress({ percent, label, target }: { percent: number; label?: string; target?: number }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const met = target == null || p >= target;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        {label !== "" && <span className="text-sm font-bold">{label ?? "Complete"}</span>}
        <span className="font-display text-lg font-extrabold tabular-nums">
          {p}%{target != null && <span className="ml-1 text-xs font-bold text-grey">of {target}% needed</span>}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-mist" role="img" aria-label={`${p} per cent complete${target != null ? `, ${target} per cent needed` : ""}`}>
        <div className={`h-full rounded-full transition-all ${met ? "bg-ink" : "bg-yellow"}`} style={{ width: `${Math.max(p, 2)}%` }} />
      </div>
    </div>
  );
}

export function Table({ head, children }: { head: readonly string[]; children: ReactNode }) {
  return (
    <div className="w-full max-w-full overflow-x-auto" tabIndex={0} role="group" aria-label="Table, scrolls sideways">
      <table className="w-full min-w-[520px] text-left text-[14px]">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap pb-2.5 pr-4 text-[11px] font-extrabold uppercase tracking-wider text-grey">
                {h || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export const Row = ({ children }: { children: ReactNode }) => <tr className="border-b border-line align-middle last:border-0 hover:bg-mist/60">{children}</tr>;
export const Cell = ({ children, className = "" }: { children?: ReactNode; className?: string }) => <td className={`py-3 pr-4 ${className}`}>{children}</td>;

/** Recent events, newest first. Gives a dashboard a pulse instead of a set of frozen totals. */
export function Activity({ items }: { items: { icon: IconName; title: ReactNode; meta: string; href?: string }[] }) {
  if (!items.length) return <p className="text-sm text-grey">Nothing has happened yet.</p>;
  return (
    <ol className="space-y-1">
      {items.map((i, n) => (
        <li key={n}>
          <div className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-mist">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist text-ink"><Icon name={i.icon} size={16} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold [overflow-wrap:anywhere]">
                {i.href ? <Link href={i.href} className="hover:underline">{i.title}</Link> : i.title}
              </p>
              <p className="text-[12px] text-grey">{i.meta}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Empty({ title, children, action, icon = "bolt" }: { title: string; children?: ReactNode; action?: ReactNode; icon?: IconName }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-mist text-grey"><Icon name={icon} size={22} /></span>
      <p className="font-display text-lg font-extrabold">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-md text-[15px] text-grey">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** A notice that carries a decision or a blocker. Never colour alone: each one is prefixed with a word. */
export function Notice({ tone = "info", title, children }: { tone?: "info" | "good" | "bad" | "warn"; title?: string; children: ReactNode }) {
  const map = {
    info: { cls: "border-line bg-white", word: "Note" },
    good: { cls: "border-ink bg-yellow-soft", word: "Done" },
    bad: { cls: "border-red-700 bg-white", word: "Changes requested" },
    warn: { cls: "border-ink bg-yellow", word: "Action needed" },
  } as const;
  const m = map[tone];
  return (
    <div className={`mb-7 rounded-2xl border-2 p-5 ${m.cls}`}>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.1em]">{title ?? m.word}</p>
      <div className="mt-1.5 text-[15px] leading-relaxed [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

/** The signed-in block at the foot of the rail. */
export function AccountBlock({ name, sub, avatar, children }: { name: string; sub?: string; avatar?: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        {avatar}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{name}</p>
          {sub && <p className="truncate text-[12px] text-white/50">{sub}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-[13px] font-bold text-white/60">{children}</div>
    </div>
  );
}
