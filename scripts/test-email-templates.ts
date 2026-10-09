// Every email template: brand, the bold wordmark, safety, and the do-not-reply rule.
import { TEMPLATES } from "../src/lib/email/templates";
import { previewTemplate } from "../src/lib/email/send";
import { C, renderEmail } from "../src/lib/email/layout";
import { SENDERS } from "../src/lib/mail";

let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

process.env.MAIL_DOMAIN = "primestreet.uk";
process.env.MAIL_SUPPORT = "hello@primestreet.uk";

const all = TEMPLATES.map((x) => ({ ...previewTemplate(x.id)!, tpl: x }));

t(`catalogue has templates (${TEMPLATES.length})`, TEMPLATES.length >= 20);
t("template ids are unique", new Set(TEMPLATES.map((x) => x.id)).size === TEMPLATES.length);
t("every template names a real sender", TEMPLATES.every((x) => x.purpose in SENDERS));
t("every template has a non-empty subject", all.every((a) => a.subject.trim().length > 5));
t("every template has a preheader for the inbox preview line", all.every((a) => a.html.includes("max-height:0")));

// --- branding ---
t("PrimeStreet is at the top of EVERY email, very bold",
  all.every((a) => /font-size:34px[^"]*font-weight:800[^"]*">Prime<\/span>/.test(a.html) && a.html.includes(">Street</span>")));
t("the wordmark is text, never an image (survives blocked images)",
  all.every((a) => !/<img[^>]+logo/i.test(a.html)));
t("every email uses the one brand yellow and the brand ink",
  all.every((a) => a.html.includes(C.yellow) && a.html.includes(C.ink)));
t("no off-brand colours sneak in", (() => {
  const allowed = new Set([C.yellow, C.yellowSoft, C.ink, C.white, C.grey, C.mist, C.line, C.red, "#2A2A2E", "#FFFFFF"].map((x) => x.toUpperCase()));
  const bad = new Set<string>();
  for (const a of all) for (const m of a.html.matchAll(/#[0-9a-fA-F]{6}/g)) if (!allowed.has(m[0].toUpperCase())) bad.add(m[0]);
  return bad.size === 0;
})());
t("the yellow rule sits under the wordmark on every email",
  all.every((a) => a.html.includes(`bgcolor="${C.yellow}" height="5"`)));

// --- email-client safety ---
t("table-based layout, 600px, responsive on a phone",
  all.every((a) => a.html.includes('width="600"') && a.html.includes("max-width:600px") && a.html.includes("@media only screen and (max-width:620px)")));
t("no external stylesheets, scripts or web fonts",
  all.every((a) => !/<link[^>]+stylesheet/i.test(a.html) && !/<script/i.test(a.html) && !/fonts\.googleapis/i.test(a.html)));
t("every email declares a charset and a viewport",
  all.every((a) => a.html.includes('charset="utf-8"') && a.html.includes("viewport")));

// --- content safety ---
t("user-supplied text is HTML-escaped, so an email cannot be injected into", (() => {
  const p = previewTemplate("article-changes")!;
  const doc = p.tpl.build({ name: "<script>x</script>", title: 'Bad " title', url: "https://x.test", note: "<img src=x onerror=alert(1)>" } as never);
  const { html } = renderEmail({ ...doc, purpose: "editorial" });
  // The payload may appear as escaped TEXT; what matters is that no live tag or attribute is produced.
  return !/<script/i.test(html.replace(/&lt;/g, "")) && !/<img[^>]*onerror/i.test(html) && html.includes("&lt;script&gt;") && html.includes("&lt;img");
})());

// --- the reply rule ---
const monitored = all.filter((a) => a.tpl.purpose === "hello" || /New enquiry/.test(a.subject));
t("send-only emails tell the reader not to reply and name hello@",
  all.filter((a) => !monitored.includes(a)).every((a) => /don&rsquo;t reply to it/.test(a.html) && a.html.includes("hello@primestreet.uk")));
t("the enquiry email invites a reply instead, because replying is the point",
  all.find((a) => a.tpl.id === "new-enquiry")!.html.includes("You can reply to this email"));
t("an editor's message invites a reply too",
  all.find((a) => a.tpl.id === "editor-message")!.html.includes("You can reply to this email"));
t("only the newsletter carries an unsubscribe link",
  all.filter((a) => a.html.includes(">Unsubscribe<")).every((a) => a.tpl.id === "newsletter-digest"));

// --- plain text ---
t("every email has a readable plain-text alternative",
  all.every((a) => a.text.startsWith("PRIMESTREET") && a.text.length > 120 && !a.text.includes("<")));
t("links survive into the plain-text version",
  all.filter((a) => a.html.includes("border-radius:999px")).every((a) => /https?:\/\//.test(a.text)));

// --- every audience is covered ---
for (const who of ["writer", "owner", "reviewer", "reader", "team"] as const) {
  t(`there are templates for ${who}s`, TEMPLATES.some((x) => x.to === who));
}

console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
