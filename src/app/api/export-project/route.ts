import { NextRequest, NextResponse } from "next/server";
import { buildProjectBackup } from "@/lib/project-backup";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { travelId } = body as { travelId?: string };

    if (!travelId?.trim()) {
      return NextResponse.json(
        { error: "travelId es obligatorio" },
        { status: 400 }
      );
    }

    const { buffer, filename, manifest } = await buildProjectBackup(travelId);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "X-TravelToBlog-Photos": String(manifest.photos.length),
        "X-TravelToBlog-Media-Missing": String(manifest.media.missing.length),
      },
    });
  } catch (error) {
    console.error("POST /api/export-project", error);
    const message =
      error instanceof Error ? error.message : "Error al exportar la copia";
    const status = message.includes("no encontrado") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
