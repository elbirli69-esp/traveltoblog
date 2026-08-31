import { NextRequest, NextResponse } from "next/server";
import { importSharedPhotosToTravel } from "@/lib/share-import";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: travelId } = await params;
    const body = await request.json();
    const { bundleId, userId, photos } = body as {
      bundleId?: string;
      userId?: string;
      photos?: Array<{
        sourceName: string;
        localId: string;
        selected: boolean;
        isTransportStart: boolean;
        isTransportEnd: boolean;
      }>;
    };

    if (!bundleId || !userId || !photos?.length) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const created = await importSharedPhotosToTravel(travelId, userId, bundleId, photos);

    return NextResponse.json({ photos: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "shared-bundle-not-found") {
      return NextResponse.json({ error: "Compartido expirado o no encontrado" }, { status: 404 });
    }
    if (message === "no-photos-imported") {
      return NextResponse.json({ error: "No se importó ninguna foto" }, { status: 400 });
    }
    console.error("POST /api/travels/[id]/photos/import-shared", error);
    return NextResponse.json({ error: "Error al importar fotos compartidas" }, { status: 500 });
  }
}
