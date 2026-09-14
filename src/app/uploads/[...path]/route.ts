import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getMediaStore, urlToMediaKey } from "@/lib/media-store";
import { contentTypeForFilename } from "@/lib/media-store/types";

/**
 * Serves `/uploads/{travelId}/...` from the active media store (fs or blob).
 * Keeps Photo.url stable as `/uploads/...` on both hosts.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  if (!segments?.length || segments.some((s) => s === "." || s === "..")) {
    return NextResponse.json({ error: "Ruta no válida" }, { status: 400 });
  }

  const safe = segments.map((s) => path.basename(s));
  if (safe.some((s) => !s) || safe.length < 2) {
    return NextResponse.json({ error: "Ruta no válida" }, { status: 400 });
  }

  const key = urlToMediaKey(`uploads/${safe.join("/")}`);
  try {
    const buffer = await getMediaStore().get(key);
    if (!buffer) {
      return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    }
    const filename = safe[safe.length - 1]!;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentTypeForFilename(filename),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("GET /uploads/[...path]", error);
    return NextResponse.json({ error: "Error al leer archivo" }, { status: 500 });
  }
}
