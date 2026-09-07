import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiSuggestionsEnabled } from "@/lib/ai-suggestions-enabled";
import {
  buildPhotoNoteSuggestContext,
  parsePhotoNoteTone,
  pickNearbyPlaceNames,
  suggestPhotoNote,
} from "@/lib/ai-suggest-photo-note";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    if (!aiSuggestionsEnabled()) {
      return NextResponse.json(
        { error: "Las sugerencias de IA están desactivadas" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const {
      travelId,
      photoId,
      tone: toneRaw,
      forceAi,
      authorAlias,
    } = body as {
      travelId?: string;
      photoId?: string;
      tone?: string;
      forceAi?: boolean;
      authorAlias?: string;
    };

    if (!travelId?.trim() || !photoId?.trim()) {
      return NextResponse.json(
        { error: "travelId y photoId son obligatorios" },
        { status: 400 }
      );
    }

    const photo = await prisma.photo.findFirst({
      where: { id: photoId, travelId },
      include: {
        user: { select: { alias: true } },
        place: { select: { id: true, name: true, type: true } },
        notes: {
          where: { type: "PHOTO" },
          orderBy: { createdAt: "asc" },
          select: { text: true },
        },
        travel: {
          select: {
            title: true,
            places: {
              select: {
                id: true,
                name: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
      },
    });

    if (!photo) {
      return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
    }

    const tone = parsePhotoNoteTone(toneRaw);
    const nearbyPlaceNames = pickNearbyPlaceNames({
      latitude: photo.latitude,
      longitude: photo.longitude,
      linkedPlaceId: photo.placeId,
      places: photo.travel.places,
    });

    const context = buildPhotoNoteSuggestContext({
      travelTitle: photo.travel.title,
      authorAlias:
        (typeof authorAlias === "string" && authorAlias.trim()) ||
        photo.user.alias,
      exifDateTime: photo.exifDateTime?.toISOString() ?? null,
      place: photo.place
        ? { name: photo.place.name, type: photo.place.type }
        : null,
      existingNotes: photo.notes.map((n) => n.text),
      nearbyPlaceNames,
      tone,
    });

    const result = await suggestPhotoNote({
      photoId: photo.id,
      context,
      forceAi: Boolean(forceAi),
    });

    return NextResponse.json({
      suggestion: result.suggestion,
      fromAi: result.fromAi,
      cached: result.cached,
      sparse: result.sparse,
      interpretation: result.interpretation ?? null,
    });
  } catch (error) {
    console.error("POST /api/ai/suggest-photo-note", error);
    return NextResponse.json(
      { error: "Error al sugerir la nota" },
      { status: 500 }
    );
  }
}
