import { NextResponse } from "next/server";
import { ipHash } from "@/lib/antispam";
import { lookupAddresses } from "@/lib/address";
import { resolvePostcode } from "@/lib/place-resolve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Address lookup for the onboarding form.
 *
 * This route exists so the Ideal Postcodes key stays on the server. It is not URL-restricted, so putting it
 * in client JavaScript would hand anyone the ability to spend against the account.
 *
 * It returns the addresses AND the resolved place chain together, because the form needs both and two
 * round-trips would double the latency on a mobile connection.
 *
 * Spend control lives in lib/address.ts: postcode shape is checked locally before any paid call, free test
 * postcodes bypass the caps, and per-IP and site-wide daily caps are enforced before spending rather than
 * after. A 429 here means a cap was reached, not that the postcode was wrong.
 */
export async function POST(req: Request) {
  let postcode = "";
  try {
    const body = (await req.json()) as { postcode?: unknown };
    postcode = typeof body.postcode === "string" ? body.postcode.slice(0, 16) : "";
  } catch {
    return NextResponse.json({ ok: false, message: "Send a JSON body with a postcode." }, { status: 400 });
  }
  if (!postcode.trim()) return NextResponse.json({ ok: false, message: "Enter a postcode." }, { status: 400 });

  const ip = await ipHash();
  const result = await lookupAddresses(postcode, ip);

  if (!result.ok) {
    const status = result.reason === "capped" ? 429 : result.reason === "invalid" || result.reason === "not-found" ? 404 : 503;
    // `reason` lets the form decide whether to offer manual selection, so it is part of the contract.
    return NextResponse.json({ ok: false, reason: result.reason, message: result.message }, { status });
  }

  // The place chain comes from postcodes.io and our own tree: free, and keyed on GSS codes.
  const place = await resolvePostcode(result.postcode, result.addresses[0] ?? null);

  return NextResponse.json({
    ok: true,
    postcode: result.postcode,
    addresses: result.addresses,
    place: place && {
      chain: place.chain,
      authority: place.authority,
      ward: place.ward,
      localityCandidates: place.localityCandidates,
      via: place.via,
      warnings: place.warnings,
    },
  });
}
