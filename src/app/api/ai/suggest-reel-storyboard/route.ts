import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiSuggestionsEnabled } from "@/lib/ai-suggestions-enabled";
import {
  buildStoryboardCandidates,
  hasUsableReelStoryboardSeed,
  normalizeReelStoryboardSeed,
  REEL_STORYBOARD_SEED_MIN_CHARS,
  suggestReelStoryboard,
} from "@/lib/ai-suggest-reel-storyboard";
import { destinationFicheFromTravel } from "@/lib/destination-fiche";
import { parseReelDayKey, parseReelDuration } from "@/lib/export-reel";

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
      durationSeconds: durationRaw,
      dayKey: dayKeyRaw,
      brief,
      userSeed: userSeedRaw,
    } = body as {
      travelId?: string;
      durationSeconds?: number;
      dayKey?: string | null;
      brief?: string | null;
      userSeed?: string;
    };

    if (!travelId?.trim()) {
      return NextResponse.json(
        { error: "travelId es obligatorio" },
        { status: 400 }
      );
    }

    const userSeed = normalizeReelStoryboardSeed(userSeedRaw);
    if (!hasUsableReelStoryboardSeed(userSeed)) {
      return NextResponse.json(
        {
          error: `Escribe qué quieres contar en el Reel (mínimo ${REEL_STORYBOARD_SEED_MIN_CHARS} caracteres). La IA ordena fotos y captions con esa idea.`,
        },
        { status: 400 }
      );
    }

    const durationSeconds = parseReelDuration(durationRaw);
    const dayKey = parseReelDayKey(dayKeyRaw);

    const travel = await prisma.travel.findUnique({
      where: { id: travelId },
      select: {
        title: true,
        destinationName: true,
        destinationThemes: true,
        photos: {
          where: { selected: true },
          select: {
            id: true,
            selected: true,
            mediaType: true,
            posterFilename: true,
            exifDateTime: true,
            highlightScore: true,
            latitude: true,
            longitude: true,
            isTransportStart: true,
            isTransportEnd: true,
            placeId: true,
            place: {
              select: { name: true, highlightScore: true },
            },
            notes: {
              where: { type: "PHOTO" },
              select: { text: true },
              orderBy: { createdAt: "asc" },
              take: 3,
            },
          },
        },
      },
    });

    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    const candidates = buildStoryboardCandidates(
      travel.photos.map((p) => ({
        id: p.id,
        selected: p.selected,
        mediaType: p.mediaType,
        posterFilename: p.posterFilename,
        exifDateTime: p.exifDateTime,
        placeName: p.place?.name ?? null,
        placeId: p.placeId,
        highlightScore: p.highlightScore,
        placeHighlightScore: p.place?.highlightScore ?? null,
        latitude: p.latitude,
        longitude: p.longitude,
        isTransportStart: p.isTransportStart,
        isTransportEnd: p.isTransportEnd,
        comments: p.notes.map((n) => n.text),
      })),
      { dayKey, max: 20 }
    );

    const result = await suggestReelStoryboard({
      travelId,
      travelTitle: travel.title,
      durationSeconds,
      dayKey,
      brief: typeof brief === "string" ? brief : null,
      userSeed,
      candidates,
      destination: destinationFicheFromTravel(travel),
    });

    return NextResponse.json({
      frames: result.frames,
      fromAi: result.fromAi,
      cached: result.cached,
      interpretation: result.interpretation,
      candidateCount: result.candidateCount,
      durationSeconds,
      dayKey,
    });
  } catch (error) {
    console.error("POST /api/ai/suggest-reel-storyboard", error);
    return NextResponse.json(
      { error: "Error al proponer el storyboard" },
      { status: 500 }
    );
  }
}
