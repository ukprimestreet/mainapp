import type { Point, Series } from "@/lib/analytics";

/**
 * Charts drawn as inline SVG. No charting library and no third-party script — consistent with the rule that
 * nothing on a PrimeStreet page is loaded from someone else's server.
 *
 * Every chart carries role="img" and a sentence describing what it shows, because a shape alone is useless to
 * a screen reader, and the headline figure is always present as text beside it rather than only in the picture.
 */
const fmtDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function describe(points: Point[], label: string) {
  if (!points.length) return `No ${label} to show.`;
  const total = points.reduce((n, p) => n + p.value, 0);
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a));
  return `${label}: ${total} over ${points.length} days. Busiest day ${fmtDay(peak.day)} with ${peak.value}.`;
}

/** A compact trend line for a metric tile. */
export function Sparkline({
  series, label, height = 44, tone = "ink",
}: { series: Series; label: string; height?: number; tone?: "ink" | "yellow" | "white" }) {
  const pts = series.points;
  if (pts.length < 2 || series.peak === 0) {
    return <div className="h-11" aria-hidden />;
  }
  const w = 240, h = height, pad = 3;
  const max = series.peak;
  const x = (i: number) => (i / (pts.length - 1)) * (w - pad * 2) + pad;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`;
  const stroke = tone === "yellow" ? "#FFD400" : tone === "white" ? "#FFFFFF" : "#0A0A0A";
  const fill = tone === "yellow" ? "rgba(255,212,0,.22)" : tone === "white" ? "rgba(255,255,255,.18)" : "rgba(10,10,10,.08)";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label={describe(pts, label)} className="block">
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].value)} r="3" fill={stroke} />
    </svg>
  );
}

/** A full bar chart with a readable axis, for the main panel on a dashboard. */
export function BarChart({ series, label, height = 160 }: { series: Series; label: string; height?: number }) {
  const pts = series.points;
  if (!pts.length) return null;
  const max = Math.max(1, series.peak);
  const show = pts.length > 45 ? pts.filter((_, i) => i % 2 === 0) : pts;
  const gap = show.length > 30 ? 1 : 2;

  return (
    <figure className="m-0">
      <div className="flex h-[var(--h)] items-end gap-[1px]" style={{ ["--h" as string]: `${height}px` }}
        role="img" aria-label={describe(pts, label)}>
        {show.map((p) => (
          <div key={p.day} className="group relative flex-1" style={{ marginInline: gap / 2 }}>
            <div
              className={`w-full rounded-t-[3px] transition-colors ${p.value > 0 ? "bg-ink group-hover:bg-yellow" : "bg-line"}`}
              style={{ height: `${Math.max(p.value > 0 ? 3 : 1, (p.value / max) * height)}px` }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-xs font-bold text-white group-hover:block">
              {fmtDay(p.day)}: {p.value}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between text-xs font-semibold text-grey">
        <span>{fmtDay(pts[0].day)}</span>
        <span className="max-sm:hidden">Peak {series.peak}</span>
        <span>{fmtDay(pts[pts.length - 1].day)}</span>
      </figcaption>
    </figure>
  );
}

/** Horizontal breakdown — a proportion that should be read, not guessed at from colour. */
export function Breakdown({ rows, total }: { rows: { label: string; value: number; tone?: "ink" | "yellow" }[]; total?: number }) {
  const sum = total ?? rows.reduce((n, r) => n + r.value, 0);
  if (sum === 0) return <p className="text-sm text-grey">Nothing recorded yet.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = Math.round((r.value / sum) * 100);
        return (
          <li key={r.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold">{r.label}</span>
              <span className="font-display font-extrabold tabular-nums">{r.value}<span className="ml-1 text-xs font-bold text-grey">{pct}%</span></span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-mist">
              <div className={r.tone === "yellow" ? "h-full bg-yellow" : "h-full bg-ink"} style={{ width: `${Math.max(pct, 1)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
