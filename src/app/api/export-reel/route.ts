import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildReelManifest,
  parseReelDuration,
  type ReelDurationPreset,
} from "@/lib/export-reel";
import { isoToDateKey } from "@/lib/travel-dates";

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
            place: {
              select: {
                name: true,
                comment: true,
                notes: {
                  where: { type: "PLACE" },
                  select: { text: true },
                  orderBy: { createdAt: "asc" },
                  take: 3,
                },
              },
            },
            notes: {
              where: { type: "PHOTO" },
              select: { text: true },
              orderBy: { createdAt: "asc" },
              take: 5,
            },
          },
        },
        places: {
          select: {
            name: true,
            latitude: true,
            longitude: true,
            comment: true,
            visitedAt: true,
            createdAt: true,
            notes: {
              where: { type: "PLACE" },
              select: { text: true },
              orderBy: { createdAt: "asc" },
              take: 3,
            },
          },
        },
        notes: {
          where: { type: "DAY" },
          select: {
            text: true,
            dayDate: true,
            user: { select: { alias: true } },
          },
          orderBy: { createdAt: "asc" },
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
      photos: travel.photos.map((p) => {
        const placeNotes =
          p.place?.notes?.map((n) => n.text.trim()).filter(Boolean) ?? [];
        const placeComment =
          placeNotes.length > 0
            ? placeNotes.join(" · ")
            : p.place?.comment?.trim() || null;
        return {
          id: p.id,
          mediaType: p.mediaType,
          posterFilename: p.posterFilename,
          exifDateTime: p.exifDateTime,
          isTransportStart: p.isTransportStart,
          isTransportEnd: p.isTransportEnd,
          selected: p.selected,
          placeName: p.place?.name ?? null,
          placeComment,
          latitude: p.latitude,
          longitude: p.longitude,
          comments: p.notes.map((n) => n.text).filter((t) => t.trim()),
        };
      }),
      places: travel.places.map((place) => {
        const fromNotes = place.notes.map((n) => n.text.trim()).filter(Boolean);
        return {
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          comment:
            fromNotes.length > 0
              ? fromNotes.join(" · ")
              : place.comment?.trim() || null,
          visitedAt: place.visitedAt,
          createdAt: place.createdAt,
        };
      }),
      dayNotes: travel.notes
        .filter((n) => n.dayDate)
        .map((n) => ({
          dayKey: isoToDateKey(n.dayDate!.toISOString()),
          text: n.text,
          author: n.user.alias,
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

    // Prefer same-origin basemap proxy (avoids canvas CORS taint)
    if (manifest.map) {
      const { center, zoom } = manifest.map;
      manifest.map = {
        ...manifest.map,
        staticUrl: `/api/export-reel/basemap?lat=${center.lat}&lng=${center.lng}&zoom=${zoom}`,
      };
    }

    return NextResponse.json(manifest);
  } catch (error) {
    console.error("POST /api/export-reel", error);
    return NextResponse.json({ error: "Error al preparar el reel" }, { status: 500 });
  }
}
