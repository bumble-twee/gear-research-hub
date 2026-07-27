import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Origin/Referer host, or null if the header is missing or unparseable.
function hostFrom(headerValue: string | null): string | null {
  if (!headerValue) return null;
  try {
    return new URL(headerValue).host;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  // Unset in local dev: skip the check entirely.
  if (!user || !password) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    // The enrich route's own server-side orchestrator calls its own
    // /api/tools/find-prices and /api/tools/aggregate-reviews — a
    // Node fetch with no browser, no Origin/Referer, and no way to
    // hold a Basic Auth credential. Those calls were hitting the 401
    // below and failing further upstream when the orchestrator tried
    // to parse the plain-text auth page as JSON. A caller presenting
    // this deployment's own secret can only be that same server
    // process, so let it through before anything else is checked.
    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (internalSecret && request.headers.get("x-internal-secret") === internalSecret) {
      return NextResponse.next();
    }

    // The frontend also calls its own /api/* routes directly from the
    // browser (e.g. the enrichment form's fetch to /api/enrich). Basic
    // Auth credentials aren't reliably reattached to those requests
    // either. A request whose Origin or Referer host matches this
    // deployment's own host can only have come from a page this proxy
    // already served — trust it without a Basic Auth header. Direct
    // external access to /api/* has no matching same-origin
    // Origin/Referer to present, so it still falls through to the
    // check below. Page routes are never given either bypass.
    const deploymentHost = request.nextUrl.host;
    const callerHost =
      hostFrom(request.headers.get("origin")) ??
      hostFrom(request.headers.get("referer"));
    if (callerHost && callerHost === deploymentHost) {
      return NextResponse.next();
    }
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    const providedUser = decoded.slice(0, separatorIndex);
    const providedPassword = decoded.slice(separatorIndex + 1);

    if (providedUser === user && providedPassword === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Gear Research Hub"',
    },
  });
}
