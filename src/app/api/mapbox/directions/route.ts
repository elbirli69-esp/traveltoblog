import { NextRequest, NextResponse } from "next/server";
import {
  fetchMapboxDirectionsPolylineDirect,
  type MapRouteWaypoint,
} from "@/lib/mapbox-route";

/**
 * Same-origin Directions proxy for the in-app map.
 * Keeps the Mapbox token server-side and avoids browser CORS / URL allowlist issues.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      waypoints?: MapRouteWaypoint[];
      profile?: "driving" | "walking";
    };

    const waypoints = Array.isArray(body.waypoints) ? body.waypoints : [];
    const valid = waypoints.filter(
      (p) =>
        typeof p?.lng === "number" &&
        typeof p?.lat === "number" &&
        Number.isFinite(p.lng) &&
        Number.isFinite(p.lat)
    );

    if (valid.length < 2) {
      return NextResponse.json(
        { error: "Se necesitan al menos 2 waypoints" },
        { status: 400 }
      );
    }

    if (valid.length > 25) {
      return NextResponse.json(
        { error: "Máximo 25 waypoints por petición" },
        { status: 400 }
      );
    }

    const profile = body.profile === "walking" ? "walking" : "driving";
    const polyline = await fetchMapboxDirectionsPolylineDirect(valid, profile);

    if (!polyline) {
      return NextResponse.json({ polyline: null, mode: "unavailable" });
    }

    return NextResponse.json({ polyline, mode: "directions" });
  } catch (error) {
    console.error("POST /api/mapbox/directions", error);
    return NextResponse.json({ error: "Error al calcular la ruta" }, { status: 500 });
  }
}
