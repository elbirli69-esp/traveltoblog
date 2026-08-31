import type { NextRequest } from "next/server";

/** Public origin for redirects, share target and join links (never 127.0.0.1 behind Tailscale Serve). */
export function resolvePublicOrigin(request?: NextRequest): string {
  const https = process.env.NEXT_PUBLIC_HTTPS_APP_URL?.trim().replace(/\/$/, "");
  if (https) return https;

  const app = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (app && !isLocalOrigin(app)) return app;

  if (request) {
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (forwardedHost) {
      const proto = forwardedProto || (forwardedHost.includes("ts.net") ? "https" : "http");
      return `${proto}://${forwardedHost.split(",")[0].trim()}`;
    }

    const host = request.headers.get("host");
    if (host && !isLocalOrigin(`http://${host}`)) {
      const proto =
        request.nextUrl.protocol.replace(":", "") ||
        (host.includes("ts.net") ? "https" : "http");
      return `${proto}://${host}`;
    }
  }

  if (app) return app;
  return "http://localhost:3000";
}

function isLocalOrigin(url: string): boolean {
  try {
    const { hostname } = new URL(url.startsWith("http") ? url : `http://${url}`);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function publicUrl(path: string, request?: NextRequest): string {
  const base = resolvePublicOrigin(request);
  return new URL(path.startsWith("/") ? path : `/${path}`, `${base}/`).toString();
}
