import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildReelManifest,
  parseReelDuration,
  type ReelDurationPreset,
} from "@/lib/export-reel";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      travelId?: string;
      durationSeconds?: ReelDurationPreset;
    };

    if (!body.travelId) {
      return NextResponse.json({ error: "travelId es obligatorio" }, { status: 400 });
    }

    const durationSeconds = parseReelDuration(body.durationSeconds);

    const travel = await prisma.travel.findUnique({
      where: { id: body.travelId },
      include: {
        users: { select: { alias: true } },
        photos: {
          where: { selected: true },
          orderBy: { exifDateTime: "asc" },
          include: {
            place: { select: { name: true } },
          },
        },
      },
    });

    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    const manifest = buildReelManifest({
      title: travel.title,
      participants: travel.users.map((u) => u.alias),
      startDate: travel.startDate,
      endDate: travel.endDate,
      durationSeconds,
      photos: travel.photos.map((p) => ({
        id: p.id,
        mediaType: p.mediaType,
        posterFilename: p.posterFilename,
        exifDateTime: p.exifDateTime,
        isTransportStart: p.isTransportStart,
        isTransportEnd: p.isTransportEnd,
        selected: p.selected,
        placeName: p.place?.name ?? null,
      })),
    });

    if (manifest.frames.length === 0) {
      return NextResponse.json(
        {
          error:
            "No hay fotos seleccionadas con imagen usable. Marca fotos (o posters de vídeo) en el viaje.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(manifest);
  } catch (error) {
    console.error("POST /api/export-reel", error);
    return NextResponse.json({ error: "Error al preparar el reel" }, { status: 500 });
  }
}
