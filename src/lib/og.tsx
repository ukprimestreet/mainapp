import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/** Brand social card: black field, yellow accents, big title. Same tokens as the site (#FFD400 / #0A0A0A). */
export function ogCard(o: { kicker?: string; title: string; sub?: string; badge?: string; max?: number }) {
  const max = o.max ?? 90;
  const title = o.title.length > max ? o.title.slice(0, max - 3) + "…" : o.title;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0A0A0A", color: "#fff", padding: 64, borderLeft: "24px solid #FFD400" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: "#FFD400", letterSpacing: -1 }}>PrimeStreet</div>
          {o.badge && <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#0A0A0A", background: "#FFD400", padding: "8px 20px", borderRadius: 999 }}>{o.badge}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {o.kicker && <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#FFD400", textTransform: "uppercase", letterSpacing: 4, marginBottom: 20 }}>{o.kicker}</div>}
          <div style={{ display: "flex", fontSize: title.length > 120 ? 46 : title.length > 80 ? 54 : title.length > 50 ? 62 : 78, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{title}</div>
          {o.sub && <div style={{ display: "flex", fontSize: 32, color: "#d4d4d8", marginTop: 24 }}>{o.sub}</div>}
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#a1a1aa" }}>London&apos;s Businesses. Stories. People.</div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
