// Renders every email template to out/emails/ so they can be opened and judged in a browser.
import { mkdirSync, writeFileSync } from "fs";
import { TEMPLATES } from "../src/lib/email/templates";
import { BUSINESS_TEMPLATES } from "../src/lib/email/business-templates";
import { previewBusinessTemplate, previewTemplate } from "../src/lib/email/send";
import { C } from "../src/lib/email/layout";

mkdirSync("out/emails", { recursive: true });
const rows: string[] = [];
for (const t of [...TEMPLATES.map((x) => ({ ...x, biz: false })), ...BUSINESS_TEMPLATES.map((x) => ({ ...x, biz: true }))]) {
  const p = (t.biz ? previewBusinessTemplate(t.id) : previewTemplate(t.id))!;
  writeFileSync(`out/emails/${t.id}.html`, p.html, "utf8");
  writeFileSync(`out/emails/${t.id}.txt`, p.text, "utf8");
  rows.push(`<tr><td><a href="${t.id}.html">${t.name}</a></td><td>${t.id}</td><td>${t.to}</td><td>${t.purpose}@</td><td>${p.subject}</td></tr>`);
  console.log(`${t.id.padEnd(22)} ${String(p.html.length).padStart(6)} bytes  ${p.subject}`);
}
writeFileSync("out/emails/index.html", `<!doctype html><meta charset="utf-8"><title>PrimeStreet email templates</title>
<body style="font-family:system-ui;margin:40px;background:${C.mist}">
<h1 style="font-weight:800">PrimeStreet email templates (${TEMPLATES.length + BUSINESS_TEMPLATES.length})</h1>
<table cellpadding="8" style="background:#fff;border-radius:12px"><tr><th align="left">Template</th><th align="left">id</th><th align="left">To</th><th align="left">Sender</th><th align="left">Subject</th></tr>${rows.join("")}</table>
</body>`, "utf8");
console.log(`\n${TEMPLATES.length} templates -> out/emails/index.html`);
