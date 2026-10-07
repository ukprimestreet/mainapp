// Phase 11 unit tests: author profiles, social links, the link audit and the review pipeline.
import { PrismaClient } from "@prisma/client";
import { SOCIAL_KEYS, activeSocials, freeSlug, normaliseSocial, slugifyName, validEmail, validateProfile } from "../src/lib/authors";
import { classify, extractLinks, linkSummary } from "../src/lib/links";
import { SITE } from "../src/lib/constants";
import { ARTICLE_STATUS, DECISIONS, readyToSubmit } from "../src/lib/editorial-flow";
import { makeAuthorToken, readAuthorToken } from "../src/lib/author-auth";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

async function main() {
  // ---------------- social links ----------------
  t("full https link accepted for the matching network",
    (normaliseSocial("facebook", "https://facebook.com/primestreetuk") as { url: string }).url === "https://facebook.com/primestreetuk");
  t("bare handle expands to a full URL",
    (normaliseSocial("x", "@primestreet") as { url: string }).url === "https://x.com/primestreet"
    && (normaliseSocial("instagram", "primestreet") as { url: string }).url === "https://instagram.com/primestreet");
  t("a link for the wrong network is refused", "error" in normaliseSocial("linkedin", "https://facebook.com/someone"));
  t("http, javascript: and data: links are all refused",
    "error" in normaliseSocial("facebook", "http://facebook.com/x")
    && "error" in normaliseSocial("website", "javascript:alert(1)")
    && "error" in normaliseSocial("website", "data:text/html,hi"));
  t("empty clears the field rather than erroring",
    (normaliseSocial("facebook", "") as { url: null }).url === null && (normaliseSocial("x", "   ") as { url: null }).url === null);
  t("x.com and twitter.com are both accepted for X",
    !("error" in normaliseSocial("x", "https://twitter.com/a")) && !("error" in normaliseSocial("x", "https://x.com/a")));
  t("subdomains of the network are accepted", !("error" in normaliseSocial("linkedin", "https://uk.linkedin.com/in/someone")));
  t("website takes any https link but needs a full URL",
    !("error" in normaliseSocial("website", "https://example.com/x")) && "error" in normaliseSocial("website", "justahandle"));
  t("a hostile handle is refused", "error" in normaliseSocial("x", "a/../../evil") && "error" in normaliseSocial("x", "a b"));

  // ---------------- only the links given are shown ----------------
  t("ONLY the networks with links appear", (() => {
    const got = activeSocials({ facebook: "https://facebook.com/a" });
    return got.length === 1 && got[0].key === "facebook" && got[0].icon === "facebook";
  })());
  t("no links means no icons at all", activeSocials({}).length === 0 && activeSocials({ x: "", facebook: "   " }).length === 0);
  t("several links all appear", activeSocials({ x: "https://x.com/a", linkedin: "https://linkedin.com/in/a", website: "https://a.com" }).length === 3);
  t("every network has an icon", SOCIAL_KEYS.every((k) => activeSocials({ [k]: "https://example.com" } as never).length === 1));

  // ---------------- profile validation ----------------
  const base = { name: "Ada Writer", role: "Reporter", bio: "Writes about London business.", imageUrl: "" };
  t("valid profile accepted", validateProfile(base).ok);
  t("name is required and bounded", !validateProfile({ ...base, name: "A" }).ok && !validateProfile({ ...base, name: "x".repeat(81) }).ok);
  t("HTML in the biography is refused", !validateProfile({ ...base, bio: "<b>hi</b>" }).ok);
  t("over-long biography refused", !validateProfile({ ...base, bio: "x".repeat(1201) }).ok);
  t("portrait must be an https URL",
    !validateProfile({ ...base, imageUrl: "http://img/x.jpg" }).ok && validateProfile({ ...base, imageUrl: "https://img/x.jpg" }).ok);
  t("a bad social field fails the profile and names the field", (() => {
    const v = validateProfile({ ...base, linkedin: "https://facebook.com/x" } as never);
    return !v.ok && !!v.errors.linkedin;
  })());
  t("slugify handles punctuation and spacing", slugifyName("  Chinedu  Chimezie! ") === "chinedu-chimezie");
  t("email check", validEmail("a@b.co") && !validEmail("nope") && !validEmail("a@b"));

  // ---------------- link audit ----------------
  const body = [
    "Read [our guide](/guides/thing) and [the rules](https://www.gov.uk/vat-registration).",
    "![A shopfront](https://img.example/shop.jpg)",
    "[![Clickable banner](https://img.example/banner.png)](https://sponsor.example/offer)",
    "Watch [the interview](https://www.youtube.com/watch?v=abc12345678).",
    "Bare link: https://example.com/page and a dodgy one [here](javascript:alert(1)).",
  ].join("\n\n");
  const links = extractLinks(body);
  const find = (u: string) => links.find((l) => l.url === u);
  t("internal link found and classified", find("/guides/thing")?.scope === "internal" && find("/guides/thing")?.anchor === "our guide");
  t("external link found with its host",
    find("https://www.gov.uk/vat-registration")?.scope === "external" && find("https://www.gov.uk/vat-registration")?.host === "gov.uk");
  t("plain image reported with its alt text",
    find("https://img.example/shop.jpg")?.kind === "image" && /A shopfront/.test(find("https://img.example/shop.jpg")!.anchor));
  t("a LINKED image reports both the destination and the image file, naming the image", (() => {
    const dest = find("https://sponsor.example/offer"), img = find("https://img.example/banner.png");
    return dest?.kind === "image" && /Clickable banner/.test(dest!.anchor) && !!img;
  })());
  t("YouTube links are flagged as video", find("https://www.youtube.com/watch?v=abc12345678")?.kind === "video");
  t("bare URLs left in prose are still caught", find("https://example.com/page")?.kind === "bare");
  // markdown stops a URL at the first ")", so the captured value is "javascript:alert(1" — what matters is the verdict
  t("javascript: link is flagged unsafe rather than treated as a link",
    links.some((l) => l.url.startsWith("javascript:") && l.scope === "unsafe"));
  t("summary counts what a reviewer scans for", (() => {
    const s = linkSummary(links);
    return s.total === links.length && s.unsafe === 1 && s.videos === 1 && s.external >= 3 && s.internal >= 1 && s.hosts.includes("gov.uk");
  })(), JSON.stringify(linkSummary(links)));
  t("empty body yields no links and does not crash", extractLinks("").length === 0 && linkSummary([]).total === 0);
  t("our own domain and root paths count as internal (whatever SITE.url is set to here)",
    classify(SITE.url + "/x").scope === "internal" && classify("/x").scope === "internal");
  t("protocol-relative //evil.example is not treated as internal", classify("//evil.example/x").scope === "unsafe");

  // ---------------- submit rules ----------------
  const good = { title: "A proper headline here", standfirst: "s".repeat(45), body: "b".repeat(400), type: "GUIDE", disclosure: "EDITORIAL", sponsorName: null };
  t("a complete draft may be submitted", readyToSubmit(good).ok);
  t("short headline, standfirst or body each block submission",
    !readyToSubmit({ ...good, title: "Hi" }).ok && !readyToSubmit({ ...good, standfirst: "short" }).ok && !readyToSubmit({ ...good, body: "tiny" }).ok);
  t("sponsored pieces cannot be submitted without naming the sponsor",
    !readyToSubmit({ ...good, disclosure: "SPONSORED", sponsorName: null }).ok
    && readyToSubmit({ ...good, disclosure: "SPONSORED", sponsorName: "A Sponsor" }).ok);
  t("statuses and decisions are closed sets",
    Object.keys(ARTICLE_STATUS).length === 3 && "SUBMITTED" in ARTICLE_STATUS && Object.keys(DECISIONS).length === 2);

  // ---------------- session tokens ----------------
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "x".repeat(40);
  const tok = makeAuthorToken("author-1", 3);
  t("author session round-trips", readAuthorToken(tok)?.a === "author-1" && readAuthorToken(tok)?.v === 3);
  t("a tampered author cookie is rejected",
    readAuthorToken(tok.slice(0, -2) + "xx") === null && readAuthorToken("nonsense") === null && readAuthorToken(undefined) === null);
  t("an expired author cookie is rejected", readAuthorToken(makeAuthorToken("a", 1, Date.now() - 40 * 86400_000)) === null);

  // ---------------- real data ----------------
  const owner = await db.author.findUnique({ where: { email: "cc@primestreet.uk" } });
  t("the owner's author account exists with a name and slug", !!owner && owner.name === "Chinedu Chimezie" && owner.slug === "chinedu-chimezie");
  t("the launch articles are filed under it", (await db.article.count({ where: { authorId: owner!.id, status: "PUBLISHED" } })) >= 6);
  const slug = await freeSlug("Chinedu Chimezie");
  t("a duplicate name gets a free slug rather than colliding", slug !== "chinedu-chimezie" && /^chinedu-chimezie-\d+$/.test(slug));
  t("the same author keeps its own slug when editing", (await freeSlug("Chinedu Chimezie", owner!.id)) === "chinedu-chimezie");
}

main().then(async () => { await db.$disconnect(); console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exit(fail ? 1 : 0); })
  .catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
