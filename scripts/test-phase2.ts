import { db } from "../src/lib/db";
import { parseCsv, runImport, CSV_COLUMNS } from "../src/lib/importer";
import { findDuplicate, normName, normPhone, safeUrl, websiteHost } from "../src/lib/business";
import { makeToken, verifyToken, passwordOk, throttled, recordFail } from "../src/lib/auth";
import { submitBusiness } from "../src/app/businesses/submit/actions";

let fail = 0;
const t = (n: string, c: boolean) => { console.log(c ? "PASS" : "FAIL", n); if (!c) fail++; };
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const row = (o: Record<string, string>) => CSV_COLUMNS.map((c) => q(o[c] ?? "")).join(",");
const head = CSV_COLUMNS.join(",");
const good = { name: "Zed Test Plumbing", category: "Construction", area: "Hackney", summary: "Test plumbing business for importer tests.", description: "A test description that is deliberately long enough to pass the sixty character minimum.", website: "https://www.zedtest.example/", phone: "020 7946 0001", source: "Unit test", services: "Boilers|Taps" };

(async () => {
  // helpers
  t("normName strips suffixes", normName("The Zed Plumbing Ltd") === normName("Zed Plumbing"));
  t("websiteHost", websiteHost("HTTPS://www.Foo.com/x") === "foo.com" && websiteHost("foo.com") === "foo.com");
  t("normPhone +44", normPhone("+44 20 7946 0001") === normPhone("020 7946 0001"));
  t("safeUrl blocks javascript:", safeUrl("javascript:alert(1)") === null && safeUrl("example.com") === "https://example.com/");
  // csv parser
  const parsed = parseCsv(`a,b\r\n"x, y","he said ""hi"""\r\n\r\n1,2\n`);
  t("csv quotes/CRLF/blank lines", parsed.length === 2 && parsed[0].a === "x, y" && parsed[0].b === 'he said "hi"' && parsed[1].b === "2");

  const before = await db.business.count();
  // dry run: good + invalid + unknown area + duplicate in-file
  const csv = [head, row(good), row({ ...good, name: "Zed Test Plumbing Ltd" }), row({ ...good, name: "Short", description: "too short" }), row({ ...good, name: "Nowhere Co", area: "Atlantis", website: "", phone: "" }), row({ ...good, name: "Bad Cat", category: "Spaceships", website: "", phone: "" }), row({ ...good, name: "No Source", source: "", website: "", phone: "" })].join("\n");
  const dry = await runImport(csv, { dryRun: true });
  t("dry run: 1 create, 1 dupe, 4 errors", dry.created === 1 && dry.duplicates === 1 && dry.errors === 4);
  t("dry run writes nothing", (await db.business.count()) === before);
  // real import
  const real = await runImport(csv, { dryRun: false });
  const b = await db.business.findFirst({ where: { name: "Zed Test Plumbing" } });
  t("import creates unclaimed, non-sample, with provenance", real.created === 1 && b?.claimStatus === "UNCLAIMED" && b.isSample === false && b.source === "Unit test" && b.websiteHost === "zedtest.example");
  t("services parsed", b?.services === JSON.stringify(["Boilers", "Taps"]));
  // re-import = all duplicates
  const again = await runImport([head, row(good)].join("\n"), { dryRun: false });
  t("re-import is idempotent (duplicate)", again.created === 0 && again.duplicates === 1);
  // dupe by website / phone in different name
  const loc = await db.location.findFirst({ where: { slug: "camden" } });
  t("dupe by website", (await findDuplicate({ name: "Other Name", locationId: loc!.id, website: "http://zedtest.example" }))?.reason.includes("website") === true);
  t("dupe by phone", (await findDuplicate({ name: "Other Name", locationId: loc!.id, phone: "+442079460001" }))?.reason === "same phone number");
  t("no false positive", (await findDuplicate({ name: "Totally New Biz", locationId: loc!.id, phone: "07000000000", website: "https://new.example" })) === null);

  // submissions
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const sub = { name: "Sub Biz", category: "cafes", area: "camden", description: "A lovely little cafe doing great flat whites in Camden.", submitterName: "Sam", submitterEmail: "sam@example.com" };
  t("submission invalid → errors + values echoed", await submitBusiness({ ok: false }, fd({ ...sub, description: "short", submitterEmail: "x" })).then((r) => !r.ok && !!r.errors?.description && !!r.errors?.submitterEmail && r.values?.name === "Sub Biz"));
  t("submission bad website rejected", await submitBusiness({ ok: false }, fd({ ...sub, website: "javascript:alert(1)" })).then((r) => !r.ok && !!r.errors?.website));
  t("submission honeypot stores nothing", await submitBusiness({ ok: false }, fd({ ...sub, company_url: "x" })).then(async (r) => r.ok && (await db.businessSubmission.count()) === 0));
  t("submission ok", await submitBusiness({ ok: false }, fd(sub)).then((r) => r.ok));
  for (let i = 0; i < 3; i++) await submitBusiness({ ok: false }, fd(sub));
  t("submission rate-limited after 3/day", (await db.businessSubmission.count()) === 3);

  // auth
  process.env.ADMIN_PASSWORD ??= "x"; 
  const tok = makeToken();
  t("token valid", verifyToken(tok));
  t("token tampered rejected", !verifyToken(tok.slice(0, -2) + "xx") && !verifyToken("garbage") && !verifyToken(undefined));
  t("token expired rejected", !verifyToken(makeToken(Date.now() - 9 * 3600_000)));
  t("wrong password", !passwordOk("nope") && passwordOk(process.env.ADMIN_PASSWORD!));
  for (let i = 0; i < 5; i++) recordFail("k");
  t("throttle after 5 fails", throttled("k") && !throttled("other"));

  // cleanup
  await db.business.deleteMany({ where: { source: "Unit test" } });
  await db.businessSubmission.deleteMany(); await db.auditLog.deleteMany();
  console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exitCode = fail ? 1 : 0;
})().finally(() => db.$disconnect());
