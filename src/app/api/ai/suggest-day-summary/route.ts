import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiSuggestionsEnabled } from "@/lib/ai-suggestions-enabled";
import {
  buildDaySummaryContext,
  collectDaySummaryInputs,
  DAY_SUMMARY_SEED_MIN_CHARS,
  hasUsableDaySummarySeed,
  normalizeDaySummarySeed,
  parseDayKey,
  suggestDaySummary,
} from "@/lib/ai-suggest-day-summary";

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
      dayKey: dayKeyRaw,
      authorAlias,
      userSeed: userSeedRaw,
    } = body as {
      travelId?: string;
      dayKey?: string;
      authorAlias?: string;
      userSeed?: string;
      language?: string;
    };

    const dayKey = parseDayKey(dayKeyRaw);
    if (!travelId?.trim() || !dayKey) {
      return NextResponse.json(
        { error: "travelId y dayKey (YYYY-MM-DD) son obligatorios" },
        { status: 400 }
      );
    }

    const userSeed = normalizeDaySummarySeed(userSeedRaw);
    if (!hasUsableDaySummarySeed(userSeed)) {
      return NextResponse.json(
        {
          error: `Escribe una idea breve del día (mínimo ${DAY_SUMMARY_SEED_MIN_CHARS} caracteres). La IA solo la complementa con lugares, fotos y notas.`,
        },
        { status: 400 }
      );
    }

    const travel = await prisma.travel.findUnique({
      where: { id: travelId },
      select: {
        title: true,
        journalBrief: true,
        photos: {
          select: {
            exifDateTime: true,
            place: { select: { name: true, type: true } },
            notes: {
              where: { type: "PHOTO" },
              select: { type: true, text: true },
            },
          },
        },
        places: {
          select: {
            name: true,
            type: true,
            visitedAt: true,
            notes: {
              where: { type: "PLACE" },
              select: { type: true, text: true },
            },
          },
        },
        notes: {
          where: { type: "DAY" },
          select: { text: true, dayDate: true },
        },
      },
    });

    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    const collected = collectDaySummaryInputs({
      dayKey,
      photos: travel.photos,
      places: travel.places,
      dayNotes: travel.notes,
    });

    const context = buildDaySummaryContext({
      travelTitle: travel.title,
      dayKey,
      authorAlias:
        (typeof authorAlias === "string" && authorAlias.trim()) || "Viajero",
      userSeed,
      photoCount: collected.photoCount,
      places: collected.places,
      noteBullets: collected.noteBullets,
      journalBrief: travel.journalBrief,
    });

    const sources = {
      placeCount: collected.places.length,
      noteCount: collected.noteBullets.length,
      photoCount: collected.photoCount,
    };

    const result = await suggestDaySummary({
      travelId,
      context,
      sources,
    });

    return NextResponse.json({
      suggestion: result.suggestion,
      fromAi: result.fromAi,
      cached: result.cached,
      empty: result.empty,
      sources: result.sources,
      interpretation: result.interpretation ?? null,
    });
  } catch (error) {
    console.error("POST /api/ai/suggest-day-summary", error);
    return NextResponse.json(
      { error: "Error al resumir el día" },
      { status: 500 }
    );
  }
}
