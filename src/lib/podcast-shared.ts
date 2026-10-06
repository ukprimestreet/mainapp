// Pure helpers shared by server code and the browser editor (no DB / no Node-only imports).

// ---------------------------------------------------------------- durations
export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || sec < 0) return "";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
/** "1:02:03", "45:10" or "1800" → seconds. null when invalid. */
export function parseDuration(input: string): number | null {
  const v = input.trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const m = v.match(/^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
export function isoDuration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `PT${h ? h + "H" : ""}${m ? m + "M" : ""}${s || (!h && !m) ? s + "S" : ""}`;
}

// ---------------------------------------------------------------- chapters
export type Chapter = { t: number; title: string };
/** Lines like "00:00 Intro" / "12:30 How it started" / "1:05:00 Wrap-up". Must ascend. */
export function parseChapters(text: string): { ok: true; chapters: Chapter[] } | { ok: false; error: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 60) return { ok: false, error: "At most 60 chapters" };
  const out: Chapter[] = [];
  for (const [i, l] of lines.entries()) {
    const m = l.match(/^(\d{1,2}(?::\d{2}){1,2})\s+(.{1,80})$/);
    if (!m) return { ok: false, error: `Chapter line ${i + 1} should look like “12:30 Title” (title up to 80 characters)` };
    const t = parseDuration(m[1]);
    if (t === null) return { ok: false, error: `Chapter line ${i + 1}: invalid time` };
    if (out.length && t <= out[out.length - 1].t) return { ok: false, error: `Chapter line ${i + 1}: times must increase` };
    out.push({ t, title: m[2].trim() });
  }
  return { ok: true, chapters: out };
}
export const chaptersToText = (c: Chapter[]) => c.map((x) => `${fmtDuration(x.t).padStart(4, "0")} ${x.title}`).join("\n");
export function readChapters(json: string | null | undefined): Chapter[] {
  try { const v = JSON.parse(json ?? "[]"); return Array.isArray(v) ? v.filter((c) => typeof c?.t === "number" && typeof c?.title === "string") : []; } catch { return []; }
}

// ---------------------------------------------------------------- video
export type VideoInfo = { provider: "youtube" | "vimeo" | "file"; id?: string; embedUrl?: string; fileUrl?: string; watchUrl: string; thumbUrl?: string };
/** Only YouTube, Vimeo and direct https video files are accepted. YouTube uses the privacy-enhanced domain. */
export function parseVideoUrl(input: string | null | undefined): VideoInfo | null {
  if (!input) return null;
  let u: URL;
  try { u = new URL(input.trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "").toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v") ?? (u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/)?.[1] ?? null);
  }
  if (id && /^[\w-]{11}$/.test(id)) return { provider: "youtube", id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, watchUrl: `https://www.youtube.com/watch?v=${id}`, thumbUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const vid = u.pathname.match(/(?:video\/)?(\d{6,12})/)?.[1];
    if (vid) return { provider: "vimeo", id: vid, embedUrl: `https://player.vimeo.com/video/${vid}?dnt=1`, watchUrl: `https://vimeo.com/${vid}` };
  }
  if (/\.(mp4|webm)$/i.test(u.pathname) && !isPrivateHost(u.hostname)) return { provider: "file", fileUrl: u.toString(), watchUrl: u.toString() };
  return null;
}

// ---------------------------------------------------------------- audio URLs + SSRF-safe probing
export const AUDIO_MIMES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/wav"] as const;
export function isPrivateHost(hostRaw: string): boolean {
  const h = hostRaw.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}
/** https only, never a private/loopback host. */
export function validAudioUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === "https:" && !isPrivateHost(u.hostname) && u.pathname.length > 1; } catch { return false; }
}

