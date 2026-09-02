import { NextRequest, NextResponse } from "next/server";
import { buildReelMapStaticUrl } from "@/lib/export-reel-map";

/** Proxies Mapbox Static basemap so the reel canvas is not CORS-tainted. */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    const zoom = Number(searchParams.get("zoom"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) {
      return NextResponse.json({ error: "lat, lng y zoom obligatorios" }, { status: 400 });
    }

    const url = buildReelMapStaticUrl({ lat, lng }, zoom);
    if (!url) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_MAPBOX_TOKEN no configurado" },
        { status: 503 }
      );
    }

    const upstream = await fetch(url, { next: { revalidate: 3600 } });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Mapbox static ${upstream.status}` },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get("content-type") || "image/png";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("GET /api/export-reel/basemap", error);
    return NextResponse.json({ error: "Error al cargar el mapa" }, { status: 500 });
  }
}
