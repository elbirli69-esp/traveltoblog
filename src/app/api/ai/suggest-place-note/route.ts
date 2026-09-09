import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiSuggestionsEnabled } from "@/lib/ai-suggestions-enabled";
import {
  buildPlaceNoteSuggestContext,
  hasUsablePlaceNoteSeed,
  normalizePlaceNoteSeed,
  parsePlaceNoteTone,
  PLACE_NOTE_SEED_MIN_CHARS,
  suggestPlaceNote,
} from "@/lib/ai-suggest-place-note";
import { destinationFicheFromTravel } from "@/lib/destination-fiche";

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
      placeId,
      placeName: placeNameRaw,
      placeType: placeTypeRaw,
      tone: toneRaw,
      userSeed: userSeedRaw,
      authorAlias,
    } = body as {
      travelId?: string;
      placeId?: string;
      placeName?: string;
      placeType?: string;
      tone?: string;
      userSeed?: string;
      authorAlias?: string;
    };

    if (!travelId?.trim()) {
      return NextResponse.json(
        { error: "travelId es obligatorio" },
        { status: 400 }
      );
    }

    const userSeed = normalizePlaceNoteSeed(userSeedRaw);
    if (!hasUsablePlaceNoteSeed(userSeed)) {
      return NextResponse.json(
        {
          error: `Escribe una breve nota del lugar (mínimo ${PLACE_NOTE_SEED_MIN_CHARS} caracteres). La IA solo la complementa.`,
        },
        { status: 400 }
      );
    }

    const travel = await prisma.travel.findUnique({
      where: { id: travelId },
      select: {
        id: true,
        title: true,
        destinationName: true,
        destinationThemes: true,
      },
    });
    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    let placeName = typeof placeNameRaw === "string" ? placeNameRaw.trim() : "";
    let placeType = typeof placeTypeRaw === "string" ? placeTypeRaw.trim() : "OTHER";
    let visitedAt: string | null = null;
    let existingNotes: string[] = [];
    let placeKey = `draft:${placeName}`;
    let authorFromPlace: string | null = null;

    if (placeId?.trim()) {
      const place = await prisma.place.findFirst({
        where: { id: placeId, travelId },
        include: {
          user: { select: { alias: true } },
          notes: {
            where: { type: "PLACE" },
            orderBy: { createdAt: "asc" },
            select: { text: true },
          },
        },
      });
      if (!place) {
        return NextResponse.json(
          { error: "Lugar no encontrado" },
          { status: 404 }
        );
      }
      placeName = place.name;
      placeType = place.type;
      visitedAt = place.visitedAt?.toISOString() ?? null;
      existingNotes = place.notes.map((n) => n.text);
      if (place.comment?.trim()) existingNotes.push(place.comment.trim());
      placeKey = place.id;
      authorFromPlace = place.user.alias;
    }

    if (!placeName) {
      return NextResponse.json(
        { error: "placeId o placeName son obligatorios" },
        { status: 400 }
      );
    }

    const tone = parsePlaceNoteTone(toneRaw);
    const context = buildPlaceNoteSuggestContext({
      travelTitle: travel.title,
      authorAlias:
        (typeof authorAlias === "string" && authorAlias.trim()) ||
        authorFromPlace ||
        "Viajero",
      userSeed,
      placeName,
      placeType: placeType || "OTHER",
      visitedAt,
      existingNotes,
      tone,
      destination: destinationFicheFromTravel(travel),
    });

    const result = await suggestPlaceNote({ placeKey, context });

    return NextResponse.json({
      suggestion: result.suggestion,
      fromAi: result.fromAi,
      cached: result.cached,
      sparse: result.sparse,
      interpretation: result.interpretation ?? null,
    });
  } catch (error) {
    console.error("POST /api/ai/suggest-place-note", error);
    return NextResponse.json(
      { error: "Error al sugerir la nota del lugar" },
      { status: 500 }
    );
  }
}
