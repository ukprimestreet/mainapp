# Podcast & video

One interview → **episode** (audio and/or video) + **written interview** + **business profile** appearance + **quote cards** + **clips** + **newsletter/social copy**. Everything lives in one `PodcastEpisode` record, so nothing is retyped.

## Episode model
Number/season/type (full, trailer, bonus), title, description (plain text, ≤ 400 — RSS summary + search snippet), show notes and **transcript** (markdown-lite; label speakers as `Sarah: …`), **chapters**, audio URL + size + type + duration, video URL, cover image, explicit flag, guest name/role, featured business, linked article, status/schedule (same London-time scheduling as articles).

**Hosting:** audio is *linked*, not stored (use your podcast host / R2 / S3). File upload is blocked on a storage decision. "Check file" does a `HEAD` request to fill in size and type (see SSRF notes).

## Admin workflow (Admin → Podcast & video)
1. **Show settings** (once): title, description, author, owner email (Apple verification, never shown), category, language, cover art, Spotify/Apple/YouTube links.
2. **New episode** → fill the form → *Save draft* → *Publish now* / *Schedule*. A "Ready to publish?" checklist covers title, description, media, duration + size (for podcast apps), cover, transcript/notes (for indexing), business.
3. **Repurpose this interview** (on the episode page):
   1. **Written interview** — one click creates an INTERVIEW article *draft* from the transcript (host turns → `##` questions, guest turns → answers), linked to the episode and business. Edit and publish in the normal editor.
   2. **Quote cards** — add a quote (≤ 280 chars) → a branded 1200×630 PNG card is generated (`/podcast/{slug}/quote/{id}`), downloadable, public once the episode is live.
   3. **Clips** — a to-do list of time ranges to cut for social/video, with notes, a done tick and an optional link to the produced clip.
   4. **Ready-to-post copy** — newsletter blurb + 3 social captions (templated from the episode, ≤ 280 chars, with the link).
   5. **Business profile** — the episode appears on the featured business's profile automatically once live.

## Public experience
- `/podcast`: show header, listen links, RSS button, All / Video / Audio filter, pagination. RSS autodiscovery `<link>`.
- `/podcast/{slug}`: player (native `<audio controls>` + ±15/30 s, speed 0.75–2×, download, **chapter buttons**), video, description, show notes, **highlights** (pull quotes + share image), link to the written interview, featured business card, collapsible **transcript**, more episodes.
- **Video is click-to-load.** Nothing from YouTube/Vimeo (no iframe, no thumbnail, no cookies) is requested until the visitor presses play; YouTube uses `youtube-nocookie.com`, Vimeo `dnt=1`. Only YouTube, Vimeo and direct https `.mp4/.webm` are accepted.
- Drafts, scheduled and sample episodes never appear in lists, the feed, the sitemap, business profiles or articles.

## RSS feed (`/podcast/feed.xml`)
RSS 2.0 + `itunes:` + Podcasting 2.0 tags: channel title/description/language/author/owner/category/image/explicit/type; per episode `enclosure` (url, **length**, type), `guid` (stable, non-permalink), `pubDate`, `itunes:duration/episode/season/episodeType/explicit/image`, `podcast:transcript` (→ `/podcast/{slug}/transcript.txt`), `podcast:chapters` (→ `/podcast/{slug}/chapters.json`, Podcasting 2.0 JSON). Only **real, published episodes with audio + file size** are listed. `ETag` + conditional GET (304) and 5-minute cache. Submit this URL to Apple Podcasts Connect, Spotify for Creators, etc.

## SEO
- **Episode gate** (`decideEpisode`): indexed only if real, published, and it has a transcript or show notes ≥ 200 characters (audio alone is invisible to search). Thin audio-only episodes are live but `noindex` and out of the sitemap. Admin SEO overrides apply.
- JSON-LD: `PodcastEpisode` (series, number, ISO duration, `AudioObject`, chapter `Clip`s via `hasPart`), `VideoObject` (embed URL, duration, thumbnail, upload date), `PodcastSeries` on the index, breadcrumbs. Everything emitted is visible on the page.
- Branded Open Graph image per episode; slug changes on live episodes create a 308 redirect.

## Analytics
- **Views**: server-side daily counter per episode (bots and admins excluded).
- **Plays**: the player sends a beacon on first play; stored as one row per (anonymous visitor hash, episode, day) so repeated plays are **deduplicated** and no raw IPs or cookies are kept. Same-origin only; bots ignored. Admin list shows views and plays for the last 30 days.

## Security notes
- "Check file" is admin-only and SSRF-hardened: https only, private/loopback/link-local hosts refused (re-checked on every redirect hop), HEAD only, 8 s timeout, no body read. Loopback is allowed *only* outside production (for local testing).
- Transcript/show notes render through the same safe markdown-lite renderer (no raw HTML).
- Play beacon and feed are public but write only an anonymous hashed row / nothing.

## Not done / blocked
- **Audio/video upload** (storage decision) — link to externally hosted files for now.
- **Real episodes**: record, host, and enter them. The seeded episode is fictional sample data (hidden from search and the feed).
- **Automatic transcription** (Whisper etc.) and **auto-cutting clips**: not built; clips are an editing to-do list and transcripts are pasted in.
- Submitting the feed to Apple/Spotify (needs your accounts) and validating with their tools after launch.
- Video sitemap, podcast-specific analytics beyond plays/views (e.g. listener geography) come from the podcast host.
