import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LIVE_HOST = "patelafarms.vercel.app";
const LEGACY_HOSTS = new Set(["patelafarm.vercel.app", "www.patelafarm.vercel.app"]);

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (!LEGACY_HOSTS.has(host)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = LIVE_HOST;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: "/:path*",
};
