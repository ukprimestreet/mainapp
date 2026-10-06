// Pure text helpers for search (no DB access) — shared by the engine, suggestions, tests.

const STOP = new Set(["a", "an", "the", "in", "on", "at", "near", "nearby", "for", "of", "to", "and", "or", "with", "me", "my", "best", "top", "good", "great", "cheap", "local", "london", "uk", "company", "companies", "service", "services", "business", "businesses", "shop", "shops"]);

/** Domain synonyms: searching one word also finds the others. Keys and values are lower-case. */
export const SYNONYMS: Record<string, string[]> = {
  cleaner: ["cleaning", "cleaners"], cleaners: ["cleaning", "cleaner"], maid: ["cleaning", "maids"], maids: ["cleaning", "maid"],
  removal: ["removals", "movers", "moving"], removals: ["movers", "moving", "van"], mover: ["removals", "movers"], movers: ["removals", "moving"], moving: ["removals", "movers"], van: ["removals", "courier"],
  courier: ["logistics", "delivery", "parcel"], delivery: ["logistics", "courier"], freight: ["logistics", "shipping"], shipping: ["logistics", "freight"],
  restaurant: ["restaurants", "dining", "kitchen"], dining: ["restaurants"], food: ["restaurants", "cafes", "bakery"], eat: ["restaurants", "cafes"],
  cafe: ["cafes", "coffee", "bakery"], coffee: ["cafes", "cafe", "roaster"], bakery: ["cafes", "bakers"], brunch: ["cafes", "restaurants"],
  hairdresser: ["beauty", "salon", "hair"], salon: ["beauty", "hair", "nails"], barber: ["beauty", "barbers", "hair"], barbers: ["beauty", "barber"], nails: ["beauty", "salon"], lashes: ["beauty"],
  gym: ["fitness", "gyms", "training"], yoga: ["fitness", "pilates", "studio"], pilates: ["fitness", "yoga"], trainer: ["fitness", "training"],
  "estate": ["property", "lettings", "agent"], agent: ["property", "estate", "lettings"], landlord: ["property", "lettings"], letting: ["lettings", "property"], lettings: ["property", "letting"], house: ["property"],
  builder: ["construction", "building", "renovation"], builders: ["construction", "building"], plumber: ["plumbing", "construction", "heating"], plumbers: ["plumbing", "heating"], electrician: ["electrical", "construction"], electricians: ["electrical"], tradesman: ["construction"], loft: ["construction", "conversions"],
  accountant: ["accountants", "accounting", "tax", "bookkeeping"], accountants: ["accounting", "tax"], solicitor: ["solicitors", "law", "legal"], solicitors: ["law", "legal"], lawyer: ["solicitors", "legal"], tax: ["accounting", "accountants"],
  startup: ["technology", "software", "startups"], software: ["technology", "startup"], web: ["technology", "design"], developer: ["technology", "software"],
  shop: ["retail"], store: ["retail"], tailor: ["retail", "alterations"], stationery: ["retail"],
};

export function tokenize(q: string): string[] {
  return (q.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 12);
}
export const contentTokens = (q: string) => { const t = tokenize(q); const c = t.filter((x) => !STOP.has(x) && x.length > 0); return (c.length ? c : t).slice(0, 8); };

/**
 * Builds a SAFE FTS5 MATCH expression from free text. Every token is double-quoted (so operators like AND/OR/NEAR/-/*
 * typed by a user are just words and syntax errors are impossible); the last token is a prefix match ("clea" → cleaning);
 * synonyms are OR-ed in. mode "all": every term must match; "any": at least one (the relaxed fallback).
 */
export function buildMatch(q: string, mode: "all" | "any" = "all"): string | null {
  const toks = contentTokens(q);
  if (!toks.length) return null;
  const parts = toks.map((t, i) => {
    const alts = [t, ...(SYNONYMS[t] ?? [])].filter((v, j, a) => a.indexOf(v) === j);
    const quoted = alts.map((a, j) => `"${a}"${i === toks.length - 1 && j === 0 && t.length >= 2 ? "*" : ""}`);
    return quoted.length > 1 ? `(${quoted.join(" OR ")})` : quoted[0];
  });
  return parts.join(mode === "all" ? " AND " : " OR ");
}

/** Normalised form stored in the (anonymous) query log. Returns null for things that look like personal data. */
export function loggableQuery(q: string): string | null {
  const v = q.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
  if (v.length < 2) return null;
  if (/@/.test(v) || /\d{7,}/.test(v.replace(/[\s-]/g, "")) || /https?:|www\./.test(v)) return null; // emails, phone numbers, URLs
  return v;
}

/** Optimal-string-alignment (Damerau-Levenshtein) distance: transpositions count as one edit. */
export function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}

/** Suggest a corrected query using words that actually exist on the site. Returns null if nothing needs fixing/no good fix. */
export function spellSuggest(q: string, vocab: Map<string, number>): string | null {
  const toks = tokenize(q);
  if (!toks.length || !vocab.size) return null;
  let changed = false;
  const out = toks.map((t) => {
    if (t.length < 4 || STOP.has(t) || vocab.has(t) || SYNONYMS[t] || [...vocab.keys()].some((w) => w.startsWith(t))) return t;
    const max = t.length >= 8 ? 2 : 1;
    let best: string | null = null, bestD = 99, bestF = 0;
    for (const [w, f] of vocab) {
      if (Math.abs(w.length - t.length) > max) continue;
      const d = editDistance(t, w);
      if (d <= max && (d < bestD || (d === bestD && f > bestF))) { best = w; bestD = d; bestF = f; }
    }
    if (best) { changed = true; return best; }
    return t;
  });
  return changed ? out.join(" ") : null;
}

/** Plain text from markdown-lite for indexing. */
export const stripMarkdown = (s: string) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#>*_`~-]+/g, " ").replace(/\s+/g, " ").trim();
