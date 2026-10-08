import { NextResponse, type NextRequest } from "next/server";

/**
 * Passes the current path to server components in a header, so the root layout can leave off the public
 * header and footer on the signed-in dashboards. Nothing else: no auth decisions are made here, because
 * every protected page already checks its own session server-side.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-ps-path", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/).*)"],
};
