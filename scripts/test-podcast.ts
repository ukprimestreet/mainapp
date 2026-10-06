import http from "http";
import { db } from "../src/lib/db";
import { chaptersToText, copyKit, fmtDuration, isPrivateHost, isoDuration, parseChapters, parseDuration, parseTranscript, parseVideoUrl, probeAudio, rssXml, transcriptToInterview, validAudioUrl, validateEpisode, type EpisodeInput } from "../src/lib/podcast";
import { decideEpisode } from "../src/lib/seo-engine";

let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

/** Minimal well-formedness check: balanced, properly nested tags; attributes quoted. */
function wellFormed(xml: string): boolean {
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|<\?[^?]*\?>|<!--[\s\S]*?-->/g;
  let m: RegExpExecArray | null, last = 0;
  while ((m = re.exec(xml))) {
    const between = xml.slice(last, m.index);
    if (/[<>]/.test(between.replace(/&(lt|gt|amp|apos|quot);/g, ""))) return false; // stray angle bracket / bad text
    if (/&(?!(lt|gt|amp|apos|quot|#\d+);)/.test(between)) return false; // unescaped ampersand
    last = re.lastIndex;
    if (!m[2]) continue;
    if (m[4]) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
  }
  return stack.length === 0;
}

const show = { title: "The PrimeStreet Podcast", description: "Conversations & stories <with> founders", author: "PrimeStreet", ownerEmail: "ukprimestreet@gmail.com", imageUrl: "https://cdn.example/cover.jpg?a=1&b=2", language: "en-gb", category: "Business", explicit: false, copyright: "© PrimeStreet" };
const ep = (o: Record<string, unknown> = {}) => ({ slug: "ep-1", number: 1, season: null, episodeType: "full", title: "Cleaning up: a founder's story", description: "How Sarah built a 20-person cleaning company & kept it independent.", audioUrl: "https://cdn.example/ep1.mp3", audioBytes: 12345678, audioMime: "audio/mpeg", durationSec: 1800, explicit: false, imageUrl: null, publishedAt: new Date("2026-03-01T09:00:00Z"), transcript: "Sarah: hello", chapters: JSON.stringify([{ t: 0, title: "Intro" }]), guestName: "Sarah", ...o });

(async () => {
  // durations
  t("fmtDuration", fmtDuration(0) === "0:00" && fmtDuration(65) === "1:05" && fmtDuration(3725) === "1:02:05" && fmtDuration(null) === "");
  t("parseDuration accepts mm:ss, h:mm:ss, seconds; rejects junk", parseDuration("45:10") === 2710 && parseDuration("1:02:03") === 3723 && parseDuration("1800") === 1800 && ["", "abc", "12:75", "1:2", "-5", "99:99:99"].every((x) => parseDuration(x) === null));
  t("isoDuration", isoDuration(3725) === "PT1H2M5S" && isoDuration(60) === "PT1M" && isoDuration(0) === "PT0S" && isoDuration(45) === "PT45S");
  // chapters
  const ch = parseChapters("00:00 Intro\n12:30 How it started\n1:05:00 Wrap-up");
  t("chapters parse + ascend", ch.ok && ch.chapters.length === 3 && ch.chapters[2].t === 3900);
  t("chapters: non-increasing / bad line / too many / long title rejected", !parseChapters("05:00 A\n04:00 B").ok && !parseChapters("Intro").ok && !parseChapters("05:00 A\n05:00 B").ok && !parseChapters(Array.from({ length: 61 }, (_, i) => `${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")} X`).join("\n")).ok && !parseChapters("00:00 " + "x".repeat(81)).ok);
  t("chapters round-trip to text", ch.ok && chaptersToText(ch.chapters).split("\n")[1] === "12:30 How it started");
  // video
  const yt = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10");
  t("video: YouTube variants → privacy-enhanced embed", yt?.provider === "youtube" && yt.embedUrl?.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ") === true && parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")?.id === "dQw4w9WgXcQ" && parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.id === "dQw4w9WgXcQ" && parseVideoUrl("https://m.youtube.com/embed/dQw4w9WgXcQ")?.id === "dQw4w9WgXcQ");
  t("video: Vimeo + direct file accepted", parseVideoUrl("https://vimeo.com/123456789")?.embedUrl === "https://player.vimeo.com/video/123456789?dnt=1" && parseVideoUrl("https://cdn.example/v.mp4")?.provider === "file");
  t("video: http, other hosts, javascript:, private files, bad ids rejected", ["http://youtube.com/watch?v=dQw4w9WgXcQ", "https://evil.example/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "https://localhost/v.mp4", "https://youtube.com/watch?v=short", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "not a url", ""].every((u) => parseVideoUrl(u) === null));
  // hosts
  t("private hosts detected", ["localhost", "127.0.0.1", "10.1.2.3", "192.168.0.1", "172.16.5.5", "172.31.0.1", "169.254.169.254", "[::1]", "foo.internal", "x.local", "100.64.0.1"].every(isPrivateHost) && !["cdn.example", "8.8.8.8", "172.32.0.1", "172.15.0.1"].some(isPrivateHost));
  t("validAudioUrl: https + public only", validAudioUrl("https://cdn.example/a.mp3") && !validAudioUrl("http://cdn.example/a.mp3") && !validAudioUrl("https://127.0.0.1/a.mp3") && !validAudioUrl("ftp://x/a.mp3") && !validAudioUrl("https://cdn.example") && !validAudioUrl("nope"));

  // RSS
  const xml = rssXml(show, [ep() as never, ep({ slug: "ep-2", number: 2, audioBytes: null }) as never, ep({ slug: "ep-3", number: 3, audioUrl: null }) as never, ep({ slug: "ep-4", number: 4, season: 2, explicit: true, imageUrl: "https://cdn.example/e4.jpg", transcript: null, chapters: null, title: "Q&A <live>" }) as never], "https://primestreet.uk");
  t("RSS: well-formed XML (escaping of & < > in titles, urls)", wellFormed(xml));
  t("RSS: channel has required + iTunes tags", ["<title>The PrimeStreet Podcast</title>", "<language>en-gb</language>", "<itunes:author>PrimeStreet</itunes:author>", '<itunes:category text="Business"/>', '<itunes:image href="https://cdn.example/cover.jpg?a=1&amp;b=2"/>', "<itunes:explicit>false</itunes:explicit>", "<itunes:owner>", 'rel="self"'].every((x) => xml.includes(x)));
  t("RSS: only complete episodes (audio + size) listed", (xml.match(/<item>/g) ?? []).length === 2 && !xml.includes("ep-2") && !xml.includes("ep-3"));
  t("RSS: enclosure url/length/type, guid, pubDate RFC-822, duration, episode number", xml.includes('<enclosure url="https://cdn.example/ep1.mp3" length="12345678" type="audio/mpeg"/>') && xml.includes('<guid isPermaLink="false">primestreet-ep-ep-1</guid>') && xml.includes("<pubDate>Sun, 01 Mar 2026 09:00:00 GMT</pubDate>") && xml.includes("<itunes:duration>1800</itunes:duration>") && xml.includes("<itunes:episode>1</itunes:episode>"));
  t("RSS: season, explicit, per-episode image for ep 4; transcript+chapters tags only where present", xml.includes("<itunes:season>2</itunes:season>") && xml.includes("<itunes:explicit>true</itunes:explicit>") && xml.includes('<itunes:image href="https://cdn.example/e4.jpg"/>') && (xml.match(/podcast:transcript/g) ?? []).length === 1 && (xml.match(/podcast:chapters/g) ?? []).length === 1);
  t("RSS: empty feed still valid", wellFormed(rssXml(show, [], "https://primestreet.uk")) && !rssXml(show, []).includes("<item>"));

  // transcript → interview
  const tr = "Sam: Welcome to the show. Tell us how you started?\nSarah Jones: I started with one van and a mop bucket.\nIt was hard at first.\nSam: What was the turning point?\nSarah Jones: Winning our first office contract.";
  t("parseTranscript: labelled turns + continuation lines merged", parseTranscript(tr).length === 4 && parseTranscript(tr)[1].text.includes("It was hard at first."));
  t("parseTranscript: speaker labels with bold/timestamps", parseTranscript("[00:01] **Sam:** hi\n**Sarah:** yo").map((x) => x.speaker).join() === "Sam,Sarah");
  const body = transcriptToInterview(tr, "Sarah Jones", "Intro paragraph.");
  t("interview draft: intro, host turns → ## questions, guest turns → answers", body.startsWith("Intro paragraph.") && body.includes("## Welcome to the show. Tell us how you started?") && body.includes("I started with one van") && body.includes("## What was the turning point?") && !body.includes("Sarah Jones:"));
  t("interview draft: very long question trimmed to a heading", transcriptToInterview("Host: " + "word ".repeat(80) + "\nSarah: ok", "Sarah", "i").split("\n").find((l) => l.startsWith("## "))!.length < 200);
  t("interview draft: no labels → plain paragraphs", !transcriptToInterview("Just a monologue without labels.", null, "intro").includes("## "));

  const kit = copyKit({ title: "Cleaning up", description: "First sentence here. Second one.", guestName: "Sarah", businessName: "Brightwell", url: "https://primestreet.uk/podcast/x", hasVideo: true });
  t("copy kit: newsletter + 3 captions ≤ 280 chars with the link", kit.newsletter.includes("https://primestreet.uk/podcast/x") && kit.captions.length === 3 && kit.captions.every((c) => c.length <= 280 && c.includes("https://primestreet.uk/podcast/x")) && kit.newsletter.includes("Watch or listen"));

  // episode gate
  const base = { isSample: false, status: "PUBLISHED", publishedAt: new Date(Date.now() - 1000), transcript: null as string | null, showNotes: null as string | null };
  t("episode gate: needs transcript/notes ≥200", !decideEpisode(base).index && decideEpisode({ ...base, transcript: "x".repeat(200) }).index && decideEpisode({ ...base, showNotes: "y".repeat(250) }).index && !decideEpisode({ ...base, transcript: "x".repeat(199) }).index);
  t("episode gate: sample / draft / scheduled never; overrides respected", !decideEpisode({ ...base, isSample: true, transcript: "x".repeat(300) }, { robots: "INDEX" }).index && !decideEpisode({ ...base, status: "DRAFT", transcript: "x".repeat(300) }).index && !decideEpisode({ ...base, publishedAt: new Date(Date.now() + 86400000), transcript: "x".repeat(300) }).index && decideEpisode(base, { robots: "INDEX" }).index && !decideEpisode({ ...base, transcript: "x".repeat(300) }, { robots: "NOINDEX" }).index);

  // validation (DB: slug/number uniqueness)
  await db.podcastEpisode.deleteMany({ where: { slug: { startsWith: "t-pod-" } } });
  const input = (o: Partial<EpisodeInput> = {}): EpisodeInput => ({ slug: "t-pod-1", number: 9001, season: null, episodeType: "full", title: "A valid episode title", description: "d".repeat(60), showNotes: "", transcript: "", chaptersText: "", audioUrl: "https://cdn.example/a.mp3", audioBytes: 1000, audioMime: "audio/mpeg", videoUrl: "", imageUrl: "", durationText: "10:00", explicit: false, guestName: "", guestRole: "", businessId: "", articleId: "", publishedAt: "", ...o });
  t("validate: good episode passes publish rules", Object.keys(await validateEpisode(input(), "publish")).length === 0);
  const bad = await validateEpisode(input({ title: "x", slug: "Bad Slug", number: 0, audioUrl: "http://x.example/a.mp3", videoUrl: "https://evil.example/v", imageUrl: "javascript:1", durationText: "xx", chaptersText: "oops", audioMime: "audio/evil" }), "save");
  t("validate: catches title, slug, number, audio, video, image, duration, chapters, mime", ["title", "slug", "number", "audioUrl", "videoUrl", "imageUrl", "durationText", "chaptersText", "audioMime"].every((k) => k in bad), JSON.stringify(Object.keys(bad)));
  const pub = await validateEpisode(input({ description: "short", audioUrl: "", videoUrl: "" }), "publish");
  t("validate: publish needs description 50+, and audio or video", "description" in pub && "audioUrl" in pub);
  const noSize = await validateEpisode(input({ audioBytes: null, durationText: "" }), "publish");
  t("validate: publish with audio needs duration + size for podcast apps", "durationText" in noSize && "audioBytes" in noSize);
  t("validate: video-only episode can publish without audio fields", Object.keys(await validateEpisode(input({ audioUrl: "", audioBytes: null, durationText: "", videoUrl: "https://youtu.be/dQw4w9WgXcQ" }), "publish")).length === 0);
  await db.podcastEpisode.create({ data: { slug: "t-pod-dup", number: 9002, title: "Existing", description: "d".repeat(60) } });
  t("validate: duplicate slug and episode number refused (self excluded)", "slug" in (await validateEpisode(input({ slug: "t-pod-dup" }), "save")) && "number" in (await validateEpisode(input({ number: 9002 }), "save")) && Object.keys(await validateEpisode(input({ slug: "t-pod-dup", number: 9002 }), "save", (await db.podcastEpisode.findUnique({ where: { slug: "t-pod-dup" } }))!.id)).length === 0);
  await db.podcastEpisode.deleteMany({ where: { slug: { startsWith: "t-pod-" } } });

  // probe (SSRF guards) with a local server
  const srv = http.createServer((req, res) => {
    if (req.url === "/ok.mp3") { res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": "4242" }); return res.end(); }
    if (req.url === "/html") { res.writeHead(200, { "Content-Type": "text/html", "Content-Length": "10" }); return res.end(); }
    if (req.url === "/nolen") { res.writeHead(200, { "Content-Type": "audio/mpeg", "Transfer-Encoding": "chunked" }); return res.end(); }
    if (req.url === "/redir") { res.writeHead(302, { Location: "/ok.mp3" }); return res.end(); }
    if (req.url === "/evil") { res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" }); return res.end(); }
    if (req.url === "/loop") { res.writeHead(302, { Location: "/loop" }); return res.end(); }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as { port: number }).port, o = `http://127.0.0.1:${port}`;
  const ok = await probeAudio(`${o}/ok.mp3`);
  t("probe: reads size + type via HEAD (dev loopback)", ok.ok && ok.bytes === 4242 && ok.mime === "audio/mpeg");
  t("probe: follows a safe redirect", (await probeAudio(`${o}/redir`)).ok);
  t("probe: refuses non-audio type, missing length, 404", !(await probeAudio(`${o}/html`)).ok && !(await probeAudio(`${o}/nolen`)).ok && !(await probeAudio(`${o}/missing`)).ok);
  const evil = await probeAudio(`${o}/evil`);
  t("probe: SSRF — redirect to cloud-metadata address refused", !evil.ok && evil.error.includes("public https"));
  t("probe: redirect loop stops", !(await probeAudio(`${o}/loop`)).ok);
  t("probe: direct private/http targets refused", !(await probeAudio("http://169.254.169.254/x.mp3")).ok && !(await probeAudio("http://10.0.0.5/x.mp3")).ok && !(await probeAudio("file:///etc/passwd")).ok && !(await probeAudio("not a url")).ok);
  (process.env as Record<string, string>).NODE_ENV = "production";
  t("probe: in production even loopback is refused", !(await probeAudio(`${o}/ok.mp3`)).ok);
  (process.env as Record<string, string>).NODE_ENV = "test";
  srv.close();

  console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exitCode = fail ? 1 : 0;
})().finally(() => db.$disconnect());
