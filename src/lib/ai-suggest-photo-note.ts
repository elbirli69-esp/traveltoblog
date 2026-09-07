/**
 * On-demand photo note suggestions (Phase 1).
 * Manual trigger only — no auto calls. Text context, no vision.
 */

import { createAiClient, getAiConfig } from "@/lib/ai";
import { distanceMeters } from "@/lib/geo";
import { placeLabel } from "@/lib/places";
import type { PlaceType } from "@prisma/client";

export type PhotoNoteTone = "neutro" | "divertido" | "poetico";

export const PHOTO_NOTE_TONES: PhotoNoteTone[] = [
  "neutro",
  "divertido",
  "poetico",
];

export function parsePhotoNoteTone(raw: unknown): PhotoNoteTone {
  if (raw === "divertido" || raw === "poetico" || raw === "neutro") return raw;
  return "neutro";
}

export type PhotoNoteSuggestContext = {
  travelTitle: string;
  authorAlias: string;
  exifLocal: string | null;
  place: { name: string; type: string } | null;
  existingNotes: string[];
  nearbyPlaceNames: string[];
  tone: PhotoNoteTone;
};

const MAX_NOTE_CHARS = 120;
const MAX_NOTES = 4;
const MAX_NEARBY = 3;
const NEARBY_RADIUS_M = 500;
/** ~80 tokens output */
export const PHOTO_NOTE_MAX_TOKENS = 80;

export function clampNoteText(text: string, max = MAX_NOTE_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function formatExifLocal(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isPhotoNoteContextSparse(
  ctx: Pick<
    PhotoNoteSuggestContext,
    "place" | "existingNotes" | "exifLocal" | "nearbyPlaceNames"
  >
): boolean {
  return (
    !ctx.place &&
    ctx.existingNotes.length === 0 &&
    !ctx.exifLocal &&
    ctx.nearbyPlaceNames.length === 0
  );
}

export function pickNearbyPlaceNames(input: {
  latitude: number | null;
  longitude: number | null;
  linkedPlaceId: string | null;
  places: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  }>;
}): string[] {
  const { latitude, longitude, linkedPlaceId, places } = input;
  if (latitude == null || longitude == null) return [];
  return places
    .filter((p) => p.id !== linkedPlaceId)
    .map((p) => ({
      name: p.name,
      distanceM: distanceMeters(latitude, longitude, p.latitude, p.longitude),
    }))
    .filter((p) => p.distanceM <= NEARBY_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, MAX_NEARBY)
    .map((p) => p.name);
}

export function buildPhotoNoteSuggestContext(input: {
  travelTitle: string;
  authorAlias: string;
  exifDateTime: string | null;
  place: { name: string; type: string } | null;
  existingNotes: string[];
  nearbyPlaceNames: string[];
  tone: PhotoNoteTone;
}): PhotoNoteSuggestContext {
  return {
    travelTitle: input.travelTitle.trim().slice(0, 80) || "Viaje",
    authorAlias: input.authorAlias.trim().slice(0, 40) || "Viajero",
    exifLocal: formatExifLocal(input.exifDateTime),
    place: input.place
      ? {
          name: input.place.name.trim().slice(0, 80),
          type: input.place.type,
        }
      : null,
    existingNotes: input.existingNotes
      .map((n) => clampNoteText(n))
      .filter(Boolean)
      .slice(0, MAX_NOTES),
    nearbyPlaceNames: input.nearbyPlaceNames
      .map((n) => n.trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, MAX_NEARBY),
    tone: input.tone,
  };
}

export function photoNoteContextCacheKey(
  photoId: string,
  ctx: PhotoNoteSuggestContext
): string {
  return JSON.stringify({
    photoId,
    title: ctx.travelTitle,
    alias: ctx.authorAlias,
    exif: ctx.exifLocal,
    place: ctx.place,
    notes: ctx.existingNotes,
    nearby: ctx.nearbyPlaceNames,
    tone: ctx.tone,
  });
}

export function heuristicPhotoNote(ctx: PhotoNoteSuggestContext): string {
  const placeBit = ctx.place
    ? `${ctx.place.name}${
        ctx.place.type
          ? ` (${placeLabel(ctx.place.type as PlaceType) || ctx.place.type})`
          : ""
      }`
    : ctx.nearbyPlaceNames[0]
      ? `cerca de ${ctx.nearbyPlaceNames[0]}`
      : null;

  if (ctx.tone === "divertido") {
    if (placeBit && ctx.exifLocal) {
      return `Parada en ${placeBit} (${ctx.exifLocal}): de esas fotos que luego miras y sonríes.`;
    }
    if (placeBit) return `Momento en ${placeBit} — sin filtro, con buena onda.`;
    if (ctx.exifLocal) return `Capturado el ${ctx.exifLocal}. Historia corta, recuerdo largo.`;
    return "Una foto del viaje que pide una línea… ¡y aquí está!";
  }

  if (ctx.tone === "poetico") {
    if (placeBit) {
      return `Luz y calma en ${placeBit}${ctx.exifLocal ? `, ${ctx.exifLocal}` : ""}.`;
    }
    if (ctx.exifLocal) return `Un instante detenido (${ctx.exifLocal}).`;
    return "Un fragmento del camino, guardado en silencio.";
  }

  // neutro
  if (placeBit && ctx.exifLocal) {
    return `En ${placeBit}, ${ctx.exifLocal}.`;
  }
  if (placeBit) return `Foto en ${placeBit}.`;
  if (ctx.exifLocal) return `Tomada el ${ctx.exifLocal}.`;
  if (ctx.existingNotes[0]) {
    return `Detalle: ${clampNoteText(ctx.existingNotes[0], 90)}`;
  }
  return "Nota breve para esta foto del viaje.";
}

const TONE_INSTRUCTION: Record<PhotoNoteTone, string> = {
  neutro: "Tono natural y cercano, como una nota de diario.",
  divertido: "Tono ligero y con humor suave, sin forzar chistes ni inventar la escena.",
  poetico:
    "Tono evocador breve usando SOLO el lugar/fecha/notas dados; sin inventar elementos visuales.",
};

export function buildPhotoNoteSystemPrompt(): string {
  return [
    "Eres un asistente de diario de viaje.",
    "Escribe UNA nota corta (1–2 frases, máximo ~180 caracteres) en español para una foto.",
    "IMPORTANTE: NO ves la imagen. Solo tienes el JSON de metadatos.",
    "Usa ÚNICAMENTE hechos del JSON (viaje, autor, cuando, lugar.name, cerca, notas_existentes).",
    "PROHIBIDO inventar: puentes, calles, edificios, personas, ropa, clima, comida, sonidos u objetos que no estén nombrados en el JSON.",
    "PROHIBIDO rellenar con conocimiento genérico del destino (p. ej. «gueto de Cracovia», leyendas, películas) si no aparece en el JSON.",
    "Si solo hay un nombre de lugar, una nota sobria tipo «En {lugar}, {cuando}.» basta. No dramatices la escena.",
    "Si ya hay notas_existentes, complementa sin repetir ni ampliar con detalles visuales nuevos.",
    "No uses comillas ni prefijos como «Nota:». Solo el texto de la nota.",
  ].join(" ");
}

export function buildPhotoNoteUserPrompt(ctx: PhotoNoteSuggestContext): string {
  return JSON.stringify(
    {
      viaje: ctx.travelTitle,
      autor: ctx.authorAlias,
      cuando: ctx.exifLocal,
      lugar: ctx.place,
      cerca: ctx.nearbyPlaceNames,
      notas_existentes: ctx.existingNotes,
      tono: ctx.tone,
      instruccion_tono: TONE_INSTRUCTION[ctx.tone],
    },
    null,
    0
  );
}

export function sanitizeSuggestionText(raw: string): string {
  let t = raw.trim();
  // Strip common wrappers
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("«") && t.endsWith("»"))
  ) {
    t = t.slice(1, -1).trim();
  }
  t = t.replace(/^nota\s*:\s*/i, "").trim();
  // Keep to ~2 sentences / 220 chars hard cap for UI
  if (t.length > 220) t = `${t.slice(0, 219).trimEnd()}…`;
  return t;
}

type CacheEntry = { suggestion: string; fromAi: boolean; at: number };
const suggestionCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;

export function clearPhotoNoteSuggestionCache(): void {
  suggestionCache.clear();
}

export type SuggestPhotoNoteResult = {
  suggestion: string;
  fromAi: boolean;
  cached: boolean;
  sparse: boolean;
  interpretation?: string;
};

/**
 * Suggest a photo note. Heuristic when sparse unless forceAi.
 * Single completion when calling the model.
 */
export async function suggestPhotoNote(options: {
  photoId: string;
  context: PhotoNoteSuggestContext;
  forceAi?: boolean;
}): Promise<SuggestPhotoNoteResult> {
  const { photoId, context, forceAi = false } = options;
  const sparse = isPhotoNoteContextSparse(context);
  const cacheKey = photoNoteContextCacheKey(photoId, {
    ...context,
    // forceAi path shares cache once we have a result
  });

  const cached = suggestionCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return {
      suggestion: cached.suggestion,
      fromAi: cached.fromAi,
      cached: true,
      sparse,
    };
  }

  if (sparse && !forceAi) {
    const suggestion = heuristicPhotoNote(context);
    suggestionCache.set(cacheKey, {
      suggestion,
      fromAi: false,
      at: Date.now(),
    });
    return {
      suggestion,
      fromAi: false,
      cached: false,
      sparse: true,
      interpretation:
        "Poca información (sin lugar, notas ni fecha). Sugerencia local; pulsa «Mejorar con IA» si quieres.",
    };
  }

  const { apiKey, model } = getAiConfig();
  if (!apiKey) {
    const suggestion = heuristicPhotoNote(context);
    return {
      suggestion,
      fromAi: false,
      cached: false,
      sparse,
      interpretation: "Sin API key; se usó una sugerencia local.",
    };
  }

  try {
    const ai = createAiClient();
    const completion = await ai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: buildPhotoNoteSystemPrompt() },
        { role: "user", content: buildPhotoNoteUserPrompt(context) },
      ],
      temperature: 0.2,
      max_tokens: PHOTO_NOTE_MAX_TOKENS,
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const suggestion = sanitizeSuggestionText(raw) || heuristicPhotoNote(context);
    const fromAi = Boolean(raw);
    suggestionCache.set(cacheKey, { suggestion, fromAi, at: Date.now() });
    return {
      suggestion,
      fromAi,
      cached: false,
      sparse,
      interpretation: fromAi
        ? "Sugerencia generada. Edítala antes de guardar."
        : "La IA no devolvió texto; se usó plantilla local.",
    };
  } catch {
    const suggestion = heuristicPhotoNote(context);
    return {
      suggestion,
      fromAi: false,
      cached: false,
      sparse,
      interpretation:
        "No hay conexión con la IA. Prueba más tarde o escribe a mano.",
    };
  }
}
