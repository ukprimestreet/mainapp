import { domainMatches } from "../src/lib/business";
import { makeOwnerToken, readOwnerToken, normaliseHours, completeness, claimEvidence, isBotUA } from "../src/lib/owner";
import { makeToken, verifyToken } from "../src/lib/auth";

let fail = 0;
const t = (n: string, c: boolean) => { console.log(c ? "PASS" : "FAIL", n); if (!c) fail++; };

// owner session tokens
const now = Date.now();
const tok = makeOwnerToken("owner1", 3, now);
t("owner token round-trips", JSON.stringify(readOwnerToken(tok, now + 1000)) === JSON.stringify({ o: "owner1", v: 3 }));
t("owner token expires after 14 days", readOwnerToken(tok, now + 15 * 86400_000) === null);
t("owner token tamper/garbage rejected", readOwnerToken(tok.slice(0, -2) + "xx", now) === null && readOwnerToken("a.b", now) === null && readOwnerToken("", now) === null && readOwnerToken(undefined, now) === null);
const [payload] = tok.split(".");
t("payload swap with another signature rejected", readOwnerToken(`${Buffer.from(JSON.stringify({ o: "attacker", v: 0, exp: now + 1e9 })).toString("base64url")}.${tok.split(".")[1]}`, now) === null);
t("admin token can't be used as an owner token (and vice versa)", readOwnerToken(makeToken(now), now) === null && !verifyToken(tok, now));
void payload;

// domain match
t("domainMatches: own domain / subdomain", domainMatches("a@alpha.example", "alpha.example") && domainMatches("a@mail.alpha.example", "alpha.example"));
t("domainMatches: free mail never counts", !domainMatches("a@gmail.com", "gmail.com") && !domainMatches("a@gmail.com", "alpha.example"));
t("domainMatches: look-alike domain rejected", !domainMatches("a@evilalpha.example", "alpha.example") && !domainMatches("a@alpha.example.evil.com", "alpha.example") && !domainMatches("a@alpha.example", null));

// opening hours
const ok = normaliseHours({ mon: "09:00-17:30", sun: "10:00-16:00" });
t("hours: valid normalised", ok.ok && JSON.parse((ok as { json: string }).json).mon === "09:00-17:30");
t("hours: empty → null (closed all week)", normaliseHours({}).ok && (normaliseHours({}) as { json: string | null }).json === null);
t("hours: bad times / order / key / type rejected", ["25:00-26:00", "17:00-09:00", "09:00-09:00", "9-5", "09:00–17:00"].every((v) => !normaliseHours({ mon: v }).ok) && !normaliseHours({ funday: "09:00-10:00" }).ok && !normaliseHours({ mon: 5 }).ok && !normaliseHours([]).ok && !normaliseHours("x").ok);

// completeness
const empty = completeness({ summary: "", description: "", phone: null, website: null, address: null, postcode: null, openingHours: null, services: null, imageUrl: null, instagram: null, facebook: null, linkedin: null });
const full = completeness({ summary: "s".repeat(40), description: "d".repeat(200), phone: "1", website: "w", address: "a", postcode: "p", openingHours: '{"mon":"09:00-10:00"}', services: '["a","b","c"]', imageUrl: "i", instagram: "x", facebook: null, linkedin: null });
t("completeness: 0% empty, 100% full, lists missing items", empty.pct === 0 && full.pct === 100 && empty.items.every(([, ok]) => !ok));
t("completeness: 2 services is not enough, junk JSON safe", !completeness({ ...{ summary: "", description: "", phone: null, website: null, address: null, postcode: null, openingHours: null, imageUrl: null, instagram: null, facebook: null, linkedin: null }, services: '["a","b"]' }).items.find(([n]) => n.includes("services"))![1] && !completeness({ summary: "", description: "", phone: null, website: null, address: null, postcode: null, openingHours: null, imageUrl: null, instagram: null, facebook: null, linkedin: null, services: "{not json" }).items.find(([n]) => n.includes("services"))![1]);

// claim evidence rules
const d = new Date();
t("evidence: email unconfirmed → can't approve or verify", !claimEvidence({ emailVerifiedAt: null, domainMatch: true, phoneVerifiedAt: d }).canApprove && !claimEvidence({ emailVerifiedAt: null, domainMatch: true, phoneVerifiedAt: d }).canVerify);
t("evidence: email only → approve (Claimed) but not Verified", claimEvidence({ emailVerifiedAt: d, domainMatch: false, phoneVerifiedAt: null }).canApprove && !claimEvidence({ emailVerifiedAt: d, domainMatch: false, phoneVerifiedAt: null }).canVerify);
t("evidence: email + domain OR phone → can Verify", claimEvidence({ emailVerifiedAt: d, domainMatch: true, phoneVerifiedAt: null }).canVerify && claimEvidence({ emailVerifiedAt: d, domainMatch: false, phoneVerifiedAt: d }).canVerify);

// bot filter
t("bot UA filter", isBotUA("Googlebot/2.1") && isBotUA("python-requests/2.31") && isBotUA("HeadlessChrome/120") && isBotUA("") && isBotUA(null) && !isBotUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1"));

console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exit(fail ? 1 : 0);
