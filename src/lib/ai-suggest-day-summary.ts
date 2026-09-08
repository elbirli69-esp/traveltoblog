/**
 * On-demand day summary suggestions (Phase 2).
 * Manual only — one completion, text context, no vision.
 * The user provides a brief seed; the model complements it with the day's facts.
 */

import { createAiClient, getAiConfig } from "@/lib/ai";
import { clampNoteText } from "@/lib/ai-suggest-photo-note";
import { buildTravelBlogVoiceBlock } from "@/lib/ai-blog-voice";
import type { DestinationFiche } from "@/lib/destination-fiche";
import { placeLabel } from "@/lib/places";
import { formatDateKey, isoToDateKey } from "@/lib/travel-dates";
import type { PlaceType } from "@prisma/client";

const MAX_BULLETS = 8;
const MAX_PLACE_NAMES = 5;
const BRIEF_MAX = 400;
const MAX_SEED_CHARS = 400;
/** Minimum seed length before Completar con IA is allowed. */
export const DAY_SUMMARY_SEED_MIN_CHARS = 12;
/** ~180 tokens output */
export const DAY_SUMMARY_MAX_TOKENS = 180;

export type DaySummaryContext = {
  travelTitle: string;
  dayKey: string;
  dayLabel: string;
  authorAlias: string;
  /** Brief outline written by the user — required to call the model. */
  userSeed: string;
  photoCount: number;
  places: Array<{ name: string; type: string; tipoLabel: string }>;
  bullets: string[];
  journalBrief: string | null;
  destination?: DestinationFiche | null;
};

export type DaySummarySources = {
  placeCount: number;
  noteCount: number;
  photoCount: number;
};

export function normalizeDaySummarySeed(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_SEED_CHARS);
}

export function hasUsableDaySummarySeed(seed: string): boolean {
  return normalizeDaySummarySeed(seed).length >= DAY_SUMMARY_SEED_MIN_CHARS;
}

/** Day has no places / notes / photos to weave in (seed may still exist). */
export function isDaySummaryFactsEmpty(ctx: DaySummaryContext): boolean {
  return (
    ctx.photoCount === 0 && ctx.places.length === 0 && ctx.bullets.length === 0
  );
}

/** @deprecated Prefer isDaySummaryFactsEmpty — kept for older call sites/tests. */
export function isDaySummaryEmpty(ctx: DaySummaryContext): boolean {
  return isDaySummaryFactsEmpty(ctx);
}

export function parseDayKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

export function buildDaySummaryContext(input: {
  travelTitle: string;
  dayKey: string;
  authorAlias: string;
  userSeed: string;
  photoCount: number;
  places: Array<{ name: string; type: string }>;
  noteBullets: string[];
  journalBrief: string | null | undefined;
  destination?: DestinationFiche | null;
}): DaySummaryContext {
  const brief = input.journalBrief?.trim() ?? "";
  return {
    travelTitle: input.travelTitle.trim().slice(0, 80) || "Viaje",
    dayKey: input.dayKey,
    dayLabel: formatDateKey(input.dayKey, "long"),
    authorAlias: input.authorAlias.trim().slice(0, 40) || "Viajero",
    userSeed: normalizeDaySummarySeed(input.userSeed),
    photoCount: Math.max(0, input.photoCount),
    places: input.places
      .map((p) => ({
        name: p.name.trim().slice(0, 60),
        type: p.type,
        tipoLabel: placeLabel(p.type as PlaceType) || p.type || "Lugar",
      }))
      .filter((p) => p.name)
      .slice(0, MAX_PLACE_NAMES),
    bullets: input.noteBullets
      .map((b) => clampNoteText(b, 120))
      .filter(Boolean)
      .slice(0, MAX_BULLETS),
    journalBrief: brief
      ? brief.length <= BRIEF_MAX
        ? brief
        : `${brief.slice(0, BRIEF_MAX - 1).trimEnd()}…`
      : null,
    destination: input.destination ?? null,
  };
}

/** Collect bullets + places for a calendar day from travel payload. */
export function collectDaySummaryInputs(input: {
  dayKey: string;
  photos: Array<{
    exifDateTime: Date | string | null;
    place?: { name: string; type: string } | null;
    notes?: Array<{ type: string; text: string }>;
  }>;
  places: Array<{
    name: string;
    type: string;
    visitedAt: Date | string | null;
    notes?: Array<{ type: string; text: string }>;
  }>;
  dayNotes: Array<{ text: string; dayDate: Date | string | null }>;
}): {
  photoCount: number;
  places: Array<{ name: string; type: string }>;
  noteBullets: string[];
} {
  const { dayKey } = input;
  const photosForDay = input.photos.filter((p) => {
    if (!p.exifDateTime) return false;
    const iso =
      typeof p.exifDateTime === "string"
        ? p.exifDateTime
        : p.exifDateTime.toISOString();
    return isoToDateKey(iso) === dayKey;
  });

  const placeMap = new Map<string, { name: string; type: string }>();

  for (const p of input.places) {
    if (!p.visitedAt) continue;
    const iso =
      typeof p.visitedAt === "string" ? p.visitedAt : p.visitedAt.toISOString();
    if (isoToDateKey(iso) !== dayKey) continue;
    placeMap.set(p.name.toLowerCase(), { name: p.name, type: p.type });
  }
  for (const photo of photosForDay) {
    if (photo.place?.name) {
      placeMap.set(photo.place.name.toLowerCase(), {
        name: photo.place.name,
        type: photo.place.type,
      });
    }
  }

  const noteBullets: string[] = [];
  for (const n of input.dayNotes) {
    if (!n.dayDate) continue;
    const iso =
      typeof n.dayDate === "string" ? n.dayDate : n.dayDate.toISOString();
    if (isoToDateKey(iso) !== dayKey) continue;
    noteBullets.push(n.text);
  }
  for (const photo of photosForDay) {
    for (const n of photo.notes ?? []) {
      if (n.type === "PHOTO" && n.text.trim()) noteBullets.push(n.text);
    }
  }
  for (const place of input.places) {
    if (!place.visitedAt) continue;
    const iso =
      typeof place.visitedAt === "string"
        ? place.visitedAt
        : place.visitedAt.toISOString();
    if (isoToDateKey(iso) !== dayKey) continue;
    for (const n of place.notes ?? []) {
      if (n.text.trim()) noteBullets.push(`${place.name}: ${n.text}`);
    }
  }

  return {
    photoCount: photosForDay.length,
    places: [...placeMap.values()].slice(0, MAX_PLACE_NAMES),
    noteBullets,
  };
}

export function daySummaryCacheKey(
  travelId: string,
  ctx: DaySummaryContext
): string {
  return JSON.stringify({
    travelId,
    day: ctx.dayKey,
    seed: ctx.userSeed,
    title: ctx.travelTitle,
    alias: ctx.authorAlias,
    photos: ctx.photoCount,
    places: ctx.places,
    bullets: ctx.bullets,
    brief: ctx.journalBrief,
  });
}

/**
 * Local fallback: expand the user seed with place names / photo count.
 * Never invents anecdotes beyond seed + listed facts.
 */
export function heuristicDaySummary(ctx: DaySummaryContext): string {
  const seed = ctx.userSeed;
  if (!seed) {
    if (isDaySummaryFactsEmpty(ctx)) {
      return `Sin actividad registrada el ${ctx.dayLabel}. Escribe unas líneas sobre el día.`;
    }
    const placeNames = ctx.places.map((p) => p.name);
    const parts: string[] = [];
    if (placeNames.length) parts.push(`Pasamos por ${placeNames.join(", ")}`);
    if (ctx.photoCount > 0) {
      parts.push(
        `${ctx.photoCount} foto${ctx.photoCount === 1 ? "" : "s"} este día`
      );
    }
    if (ctx.bullets[0]) parts.push(clampNoteText(ctx.bullets[0], 100));
    return parts.length
      ? `${parts.join(". ")}.`
      : `Día ${ctx.dayLabel} del viaje «${ctx.travelTitle}».`;
  }

  const endsWell = /[.!?…]$/.test(seed);
  let core = endsWell ? seed : `${seed}.`;
  const placeNames = ctx.places.map((p) => p.name);
  const missingPlaces = placeNames.filter(
    (n) => !core.toLowerCase().includes(n.toLowerCase())
  );
  if (missingPlaces.length && seed.length < 220) {
    core = `${core.replace(/\.$/, "")} Pasamos por ${missingPlaces.join(", ")}.`;
  } else if (ctx.photoCount > 0 && seed.length < 180) {
    core = `${core.replace(/\.$/, "")} (${ctx.photoCount} foto${
      ctx.photoCount === 1 ? "" : "s"
    }).`;
  }
  if (core.length > 500) core = `${core.slice(0, 499).trimEnd()}…`;
  return core;
}

export function buildDaySummarySystemPrompt(destination?: DestinationFiche | null): string {
  return [
    "Eres un redactor de blog de viaje.",
    "El usuario te da una idea breve del día (campo «semilla»).",
    "COMPLEMENTA y COMPLETA esa semilla en un resumen corto en español (2–4 frases, máximo ~420 caracteres), listo para una entrada de blog.",
    "Usa la semilla como hilo conductor. Integra lugares, notas, fotos y brief_viaje del JSON.",
    "Si hay lugares listados, menciónalos y añade 1 curiosidad histórica/cultural o de costumbres ligada a ellos o al destino del título / ficha_destino.",
    "Si hay notas, intégralas sin copiarlas todas literalmente.",
    buildTravelBlogVoiceBlock({ compact: false, destination }),
    "Si la semilla ya es completa, púlila con suavidad y una pincelada de contexto local; no la sustituyas por otra historia.",
    "Sin título ni prefijo «Resumen:». Solo el párrafo.",
  ].join(" ");
}

export function buildDaySummaryUserPrompt(ctx: DaySummaryContext): string {
  return JSON.stringify(
    {
      semilla: ctx.userSeed,
      viaje: ctx.travelTitle,
      ficha_destino:
        ctx.destination &&
        (ctx.destination.name || ctx.destination.themes.length > 0)
          ? {
              nombre: ctx.destination.name,
              temas: ctx.destination.themes,
            }
          : null,
      dia: ctx.dayLabel,
      dayKey: ctx.dayKey,
      autor: ctx.authorAlias,
      fotos: ctx.photoCount,
      lugares: ctx.places.map((p) => ({
        nombre: p.name,
        tipo: p.type,
        tipoLabel: p.tipoLabel,
      })),
      notas: ctx.bullets,
      brief_viaje: ctx.journalBrief,
    },
    null,
    0
  );
}

export function sanitizeDaySummaryText(raw: string): string {
  let t = raw.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("«") && t.endsWith("»"))
  ) {
    t = t.slice(1, -1).trim();
  }
  t = t.replace(/^resumen(\s+del\s+d[ií]a)?\s*:\s*/i, "").trim();
  if (t.length > 500) t = `${t.slice(0, 499).trimEnd()}…`;
  return t;
}

type CacheEntry = { suggestion: string; fromAi: boolean; at: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;

export function clearDaySummarySuggestionCache(): void {
  cache.clear();
}

export type SuggestDaySummaryResult = {
  suggestion: string;
  fromAi: boolean;
  cached: boolean;
  empty: boolean;
  sources: DaySummarySources;
  interpretation?: string;
};

export async function suggestDaySummary(options: {
  travelId: string;
  context: DaySummaryContext;
  sources: DaySummarySources;
}): Promise<SuggestDaySummaryResult> {
  const { travelId, context, sources } = options;
  const factsEmpty = isDaySummaryFactsEmpty(context);
  const seedMissing = !hasUsableDaySummarySeed(context.userSeed);
  const key = daySummaryCacheKey(travelId, context);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return {
      suggestion: hit.suggestion,
      fromAi: hit.fromAi,
      cached: true,
      empty: factsEmpty,
      sources,
    };
  }

  if (seedMissing) {
    return {
      suggestion: heuristicDaySummary(context),
      fromAi: false,
      cached: false,
      empty: factsEmpty,
      sources,
      interpretation: `Escribe al menos ${DAY_SUMMARY_SEED_MIN_CHARS} caracteres sobre el día; la IA solo complementa con lugares, fotos y notas registradas.`,
    };
  }

  const { apiKey, model } = getAiConfig();
  if (!apiKey) {
    const suggestion = heuristicDaySummary(context);
    return {
      suggestion,
      fromAi: false,
      cached: false,
      empty: factsEmpty,
      sources,
      interpretation: "Sin API key; se pulió tu idea con los datos del día en local.",
    };
  }

  try {
    const ai = createAiClient();
    const completion = await ai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: buildDaySummarySystemPrompt(context.destination) },
        { role: "user", content: buildDaySummaryUserPrompt(context) },
      ],
      temperature: 0.25,
      max_tokens: DAY_SUMMARY_MAX_TOKENS,
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const suggestion =
      sanitizeDaySummaryText(raw) || heuristicDaySummary(context);
    const fromAi = Boolean(raw);
    cache.set(key, { suggestion, fromAi, at: Date.now() });
    return {
      suggestion,
      fromAi,
      cached: false,
      empty: factsEmpty,
      sources,
      interpretation: fromAi
        ? "Resumen completado a partir de tu idea y los datos del día. Edítalo antes de guardar."
        : "La IA no devolvió texto; se usó una versión local de tu idea.",
    };
  } catch {
    const suggestion = heuristicDaySummary(context);
    return {
      suggestion,
      fromAi: false,
      cached: false,
      empty: factsEmpty,
      sources,
      interpretation:
        "No hay conexión con la IA. Se usó una versión local de tu idea.",
    };
  }
}
