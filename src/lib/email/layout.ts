import { SITE } from "../constants";
import { SUPPORT_EMAIL, type MailPurpose } from "../mail";

/**
 * One branded layout for every PrimeStreet email.
 *
 * Email clients are not browsers: no external stylesheets, no web fonts, no flexbox or grid, and Outlook
 * still renders through Word. So this is table-based with inline styles, 600px wide, and the wordmark is
 * TEXT rather than an image — it shows even when a client blocks images, which many do by default.
 *
 * Brand: one yellow (#FFD400), near-black ink, white, restrained greys. The wordmark sits very bold at the
 * top of every message, on black, over the yellow rule.
 */
export const C = {
  yellow: "#FFD400",
  yellowSoft: "#FFF6C2",
  ink: "#0A0A0A",
  white: "#FFFFFF",
  grey: "#6B6B70",
  mist: "#F4F4F5",
  line: "#E4E4E7",
  red: "#B91C1C",
} as const;

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// ---------------------------------------------------------------- blocks
export type Block =
  | { t: "h"; text: string }
  | { t: "p"; text: string; muted?: boolean; small?: boolean }
  | { t: "lead"; text: string }
  | { t: "button"; label: string; href: string }
  | { t: "secondary"; label: string; href: string }
  | { t: "list"; items: string[]; numbered?: boolean }
  | { t: "steps"; items: { title: string; text: string }[] }
  | { t: "facts"; rows: [string, string][] }
  | { t: "quote"; text: string; cite?: string }
  | { t: "note"; tone?: "info" | "good" | "bad" | "warn"; title?: string; text: string }
  | { t: "code"; text: string }
  | { t: "stat"; value: string; label: string }
  | { t: "divider" }
  | { t: "spacer" };

const pStyle = (muted?: boolean, small?: boolean) =>
  `margin:0 0 16px;font-family:${SANS};font-size:${small ? 14 : 16}px;line-height:1.6;color:${muted ? C.grey : "#2A2A2E"};`;

function block(b: Block): string {
  switch (b.t) {
    case "h":
      return `<h2 style="margin:28px 0 12px;font-family:${SANS};font-size:20px;line-height:1.3;font-weight:800;color:${C.ink};letter-spacing:-0.01em;">${esc(b.text)}</h2>`;

    case "lead":
      return `<p style="margin:0 0 20px;font-family:${SANS};font-size:19px;line-height:1.5;color:${C.ink};font-weight:600;">${esc(b.text)}</p>`;

    case "p":
      return `<p style="${pStyle(b.muted, b.small)}">${esc(b.text)}</p>`;

    case "button":
      // Table-wrapped so Outlook renders the block, with a real border radius elsewhere.
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr><td align="center" bgcolor="${C.ink}" style="border-radius:999px;">
    <a href="${esc(b.href)}" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:16px;font-weight:800;color:${C.yellow};text-decoration:none;border-radius:999px;">${esc(b.label)}</a>
  </td></tr>
</table>`;

    case "secondary":
      return `<p style="margin:0 0 20px;font-family:${SANS};font-size:15px;"><a href="${esc(b.href)}" style="color:${C.ink};font-weight:700;text-decoration:underline;">${esc(b.label)}</a></p>`;

    case "list":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
${b.items.map((i, n) => `  <tr>
    <td valign="top" style="width:26px;padding:0 0 10px;font-family:${SANS};font-size:16px;font-weight:800;color:${C.ink};">${b.numbered ? `${n + 1}.` : "&bull;"}</td>
    <td style="padding:0 0 10px;font-family:${SANS};font-size:16px;line-height:1.55;color:#2A2A2E;">${esc(i)}</td>
  </tr>`).join("\n")}
</table>`;

    case "steps":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
${b.items.map((s, n) => `  <tr>
    <td valign="top" style="width:38px;padding:0 0 18px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="${C.yellow}" width="28" height="28" style="border-radius:999px;font-family:${SANS};font-size:14px;font-weight:800;color:${C.ink};">${n + 1}</td>
      </tr></table>
    </td>
    <td style="padding:0 0 18px;font-family:${SANS};">
      <div style="font-size:16px;font-weight:800;color:${C.ink};margin-bottom:3px;">${esc(s.title)}</div>
      <div style="font-size:15px;line-height:1.55;color:${C.grey};">${esc(s.text)}</div>
    </td>
  </tr>`).join("\n")}
</table>`;

    case "facts":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;border:1px solid ${C.line};border-radius:12px;background:${C.mist};">
${b.rows.map(([k, v], i) => `  <tr>
    <td style="padding:12px 16px;font-family:${SANS};font-size:13px;font-weight:700;color:${C.grey};text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;${i ? `border-top:1px solid ${C.line};` : ""}">${esc(k)}</td>
    <td style="padding:12px 16px;font-family:${SANS};font-size:15px;color:${C.ink};font-weight:600;word-break:break-word;${i ? `border-top:1px solid ${C.line};` : ""}">${esc(v)}</td>
  </tr>`).join("\n")}
</table>`;

    case "quote":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
  <tr><td style="padding:4px 0 4px 18px;border-left:4px solid ${C.yellow};font-family:${SANS};">
    <div style="font-size:17px;line-height:1.55;color:${C.ink};">${esc(b.text)}</div>
    ${b.cite ? `<div style="margin-top:8px;font-size:14px;font-weight:700;color:${C.grey};">&mdash; ${esc(b.cite)}</div>` : ""}
  </td></tr>
</table>`;

    case "note": {
      const tone = b.tone ?? "info";
      const bg = tone === "good" ? C.yellowSoft : tone === "warn" ? C.yellow : C.white;
      const border = tone === "bad" ? C.red : C.ink;
      const title = b.title ?? { info: "Note", good: "Good news", bad: "Please read", warn: "Action needed" }[tone];
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
  <tr><td bgcolor="${bg}" style="padding:16px 18px;border:2px solid ${border};border-radius:12px;font-family:${SANS};">
    <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:${tone === "bad" ? C.red : C.ink};margin-bottom:5px;">${esc(title)}</div>
    <div style="font-size:15px;line-height:1.55;color:${C.ink};">${esc(b.text)}</div>
  </td></tr>
</table>`;
    }

    case "code":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
  <tr><td bgcolor="${C.ink}" style="padding:14px 16px;border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;color:${C.yellow};word-break:break-all;">${esc(b.text)}</td></tr>
</table>`;

    case "stat":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
  <tr><td style="font-family:${SANS};">
    <div style="font-size:40px;line-height:1;font-weight:800;color:${C.ink};letter-spacing:-0.02em;">${esc(b.value)}</div>
    <div style="margin-top:4px;font-size:14px;font-weight:700;color:${C.grey};">${esc(b.label)}</div>
  </td></tr>
</table>`;

    case "divider":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="padding:8px 0 24px;"><div style="height:1px;background:${C.line};line-height:1px;">&nbsp;</div></td></tr></table>`;

    case "spacer":
      return `<div style="height:12px;line-height:12px;">&nbsp;</div>`;
  }
}

// ---------------------------------------------------------------- plain text
function blockText(b: Block): string {
  switch (b.t) {
    case "h": return `\n${b.text.toUpperCase()}\n`;
    case "lead": case "p": return b.text;
    case "button": case "secondary": return `${b.label}: ${b.href}`;
    case "list": return b.items.map((i, n) => `${b.numbered ? `${n + 1}.` : "-"} ${i}`).join("\n");
    case "steps": return b.items.map((s, n) => `${n + 1}. ${s.title}\n   ${s.text}`).join("\n");
    case "facts": return b.rows.map(([k, v]) => `${k}: ${v}`).join("\n");
    case "quote": return `"${b.text}"${b.cite ? `\n— ${b.cite}` : ""}`;
    case "note": return `[${(b.title ?? b.tone ?? "note").toUpperCase()}] ${b.text}`;
    case "code": return b.text;
    case "stat": return `${b.value} ${b.label}`;
    case "divider": return "—";
    case "spacer": return "";
  }
}

export type EmailDoc = {
  /** Shown in the inbox preview line, after the subject. */
  preheader: string;
  blocks: Block[];
  purpose: MailPurpose;
  /** Set when the footer should invite a reply instead of warning against one. */
  monitored?: boolean;
  /** Unsubscribe URL, for the newsletter only. */
  unsubscribeUrl?: string;
};

/** The one place the wordmark, the footer and the no-reply line are defined. */
export function renderEmail(doc: EmailDoc): { html: string; text: string } {
  const support = SUPPORT_EMAIL();
  const body = doc.blocks.map(block).join("\n");

  const footerNote = doc.monitored
    ? `You can reply to this email &mdash; it reaches a person at PrimeStreet.`
    : `This email comes from an address nobody reads, so please don&rsquo;t reply to it: no one will see your message. If you need help, or something here looks wrong, email <a href="mailto:${support}" style="color:${C.ink};font-weight:700;">${support}</a> and a person will answer.`;

  const html = `<!doctype html>
<html lang="en-GB" style="margin:0;padding:0;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(doc.preheader)}</title>
<!--[if mso]><style>body,table,td,a{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
<style>
  @media only screen and (max-width:620px) {
    .ps-pad { padding-left:20px !important; padding-right:20px !important; }
    .ps-mark { font-size:28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.mist};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${C.mist};">${esc(doc.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.mist};">
  <tr><td align="center" style="padding:28px 12px;">

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:${C.white};border-radius:20px;overflow:hidden;">

      <!-- Wordmark: text, not an image, so it survives blocked images -->
      <tr><td bgcolor="${C.ink}" class="ps-pad" style="padding:30px 32px 26px;">
        <a href="${SITE.url}" style="text-decoration:none;">
          <span class="ps-mark" style="font-family:${SANS};font-size:34px;line-height:1;font-weight:800;letter-spacing:-0.025em;color:${C.white};">Prime</span><span class="ps-mark" style="font-family:${SANS};font-size:34px;line-height:1;font-weight:800;letter-spacing:-0.025em;color:${C.yellow};">Street</span>
        </a>
        <div style="margin-top:8px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#FFFFFF;opacity:0.65;">London&rsquo;s businesses &middot; stories &middot; people</div>
      </td></tr>
      <tr><td bgcolor="${C.yellow}" height="5" style="height:5px;line-height:5px;font-size:0;">&nbsp;</td></tr>

      <tr><td class="ps-pad" style="padding:32px 32px 8px;">
${body}
      </td></tr>

      <tr><td class="ps-pad" style="padding:8px 32px 30px;">
        <div style="height:1px;background:${C.line};line-height:1px;font-size:0;">&nbsp;</div>
        <p style="margin:18px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.grey};">${footerNote}</p>
        <p style="margin:12px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.grey};">
          <a href="${SITE.url}" style="color:${C.grey};">primestreet.uk</a>
          &nbsp;&middot;&nbsp; <a href="${SITE.url}/privacy" style="color:${C.grey};">Privacy</a>
          ${doc.unsubscribeUrl ? `&nbsp;&middot;&nbsp; <a href="${esc(doc.unsubscribeUrl)}" style="color:${C.grey};">Unsubscribe</a>` : ""}
        </p>
        <p style="margin:10px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.grey};">
          Sponsored, partner and advertorial content is always labelled. Unclaimed profiles have not been verified by the business.
        </p>
      </td></tr>
    </table>

  </td></tr>
</table>
</body>
</html>`;

  const text = [
    "PRIMESTREET",
    "London's businesses · stories · people",
    "",
    ...doc.blocks.map(blockText).filter((l) => l !== ""),
    "",
    "—",
    doc.monitored
      ? "You can reply to this email — it reaches a person at PrimeStreet."
      : `This email comes from an address nobody reads, so please don't reply to it: no one will see your message.\nIf you need help, email ${support} and a person will answer.`,
    SITE.url,
    ...(doc.unsubscribeUrl ? [`Unsubscribe: ${doc.unsubscribeUrl}`] : []),
  ].join("\n");

  return { html, text };
}
