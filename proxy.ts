import { NextResponse, type NextRequest } from "next/server";

const EDIT_TOKEN_PATTERN = /^e_[A-Za-z0-9_-]{43}$/;

/**
 * New editor links use URL fragments, which browsers never send to the
 * server. Keep this query-to-fragment redirect only for legacy links issued
 * by older releases; the response is private and must never be cached.
 */
export function proxy(request: NextRequest): NextResponse | Response {
  const token = request.nextUrl.searchParams.get("token");
  if (token === null) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.searchParams.delete("token");
  destination.hash = EDIT_TOKEN_PATTERN.test(token)
    ? `token=${encodeURIComponent(token)}`
    : "";

  return new Response(null, {
    status: 307,
    headers: {
      Location: destination.toString(),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export const config = {
  matcher: "/project/:path*",
};
