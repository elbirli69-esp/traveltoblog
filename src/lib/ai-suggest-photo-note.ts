/**
 * On-demand photo note suggestions (Phase 1).
 * Manual trigger only — no auto calls. Text context, no vision.
 * The user must provide a brief seed; the model only complements it.
 */

import { createAiClient, getAiConfig } from "@/lib/ai";
import { distanceMeters } from "@/lib/geo";
import { placeLabel } from "@/lib/places";
import { buildTravelBlogVoiceBlock } from "@/lib/ai-blog-voice";
import type { DestinationFiche } from "@/lib/destination-fiche";
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
  /** Brief description written by the user — required to call the model. */
  userSeed: string;
  exifLocal: string | null;
  /** Linked place (name + Spanish type label), when the photo has one. */
  place: { name: string; type: string; tipoLabel: string } | null;
  /** True when the photo has GPS (coords are not sent; used only as a soft cue). */
  hasGps: boolean;
  existingNotes: string[];
  nearbyPlaceNames: string[];
  tone: PhotoNoteTone;
  destination?: DestinationFiche | null;
};

const MAX_NOTE_CHARS = 120;
const MAX_NOTES = 4;
const MAX_NEARBY = 3;
const NEARBY_RADIUS_M = 500;
/** Minimum seed length before Completar con IA is allowed. */
export const PHOTO_NOTE_SEED_MIN_CHARS = 8;
const MAX_SEED_CHARS = 280;
/** ~80 tokens output */
export const PHOTO_NOTE_MAX_TOKENS = 80;

export function clampNoteText(text: string, max = MAX_NOTE_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function normalizePhotoNoteSeed(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_SEED_CHARS);
}

export function hasUsablePhotoNoteSeed(seed: string): boolean {
  return normalizePhotoNoteSeed(seed).length >= PHOTO_NOTE_SEED_MIN_CHARS;
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
  userSeed: string;
  exifDateTime: string | null;
  place: { name: string; type: string } | null;
  hasGps?: boolean;
  existingNotes: string[];
  nearbyPlaceNames: string[];
  tone: PhotoNoteTone;
  destination?: DestinationFiche | null;
}): PhotoNoteSuggestContext {
  const placeType = input.place?.type ?? "";
  return {
    travelTitle: input.travelTitle.trim().slice(0, 80) || "Viaje",
    authorAlias: input.authorAlias.trim().slice(0, 40) || "Viajero",
    userSeed: normalizePhotoNoteSeed(input.userSeed),
    exifLocal: formatExifLocal(input.exifDateTime),
    place: input.place
      ? {
          name: input.place.name.trim().slice(0, 80),
          type: input.place.type,
          tipoLabel:
            placeLabel(placeType as PlaceType) || placeType || "Lugar",
        }
      : null,
    hasGps: Boolean(input.hasGps),
    existingNotes: input.existingNotes
      .map((n) => clampNoteText(n))
      .filter(Boolean)
      .slice(0, MAX_NOTES),
    nearbyPlaceNames: input.nearbyPlaceNames
      .map((n) => n.trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, MAX_NEARBY),
    tone: input.tone,
    destination: input.destination ?? null,
  };
}

export function photoNoteContextCacheKey(
  photoId: string,
  ctx: PhotoNoteSuggestContext
): string {
  return JSON.stringify({
    photoId,
    seed: ctx.userSeed,
    title: ctx.travelTitle,
    alias: ctx.authorAlias,
    exif: ctx.exifLocal,
    place: ctx.place,
    hasGps: ctx.hasGps,
    notes: ctx.existingNotes,
    nearby: ctx.nearbyPlaceNames,
    tone: ctx.tone,
  });
}

function placeBit(ctx: PhotoNoteSuggestContext): string | null {
  if (ctx.place) {
    const label = ctx.place.tipoLabel || ctx.place.type;
    return label ? `${ctx.place.name} (${label})` : ctx.place.name;
  }
  if (ctx.nearbyPlaceNames[0]) return `cerca de ${ctx.nearbyPlaceNames[0]}`;
  return null;
}

/**
 * Local fallback: lightly polish the user seed with optional place/date.
 * Never invents scene details beyond the seed.
 */
export function heuristicPhotoNote(ctx: PhotoNoteSuggestContext): string {
  const seed = ctx.userSeed;
  const place = placeBit(ctx);
  const when = ctx.exifLocal;

  if (!seed) {
    if (place && when) return `En ${place}, ${when}.`;
    if (place) return `Foto en ${place}.`;
    if (when) return `Tomada el ${when}.`;
    return "Escribe una breve descripción de la foto.";
  }

  // Already a full sentence — keep seed as core.
  const endsWell = /[.!?…]$/.test(seed);
  let core = endsWell ? seed : `${seed}.`;

  if (ctx.tone === "divertido") {
    if (!/[!?]/.test(core)) {
      core = core.replace(/\.$/, "") + " — de esas que luego miras y sonríes.";
    }
  } else if (ctx.tone === "poetico") {
    if (place && !core.toLowerCase().includes(ctx.place?.name.toLowerCase() ?? "___")) {
      core = `${core.replace(/\.$/, "")}; luz y calma en ${place}.`;
    }
  } else if (place && !core.toLowerCase().includes((ctx.place?.name ?? "").toLowerCase())) {
    const withPlace = when
      ? `${core.replace(/\.$/, "")} En ${place}, ${when}.`
      : `${core.replace(/\.$/, "")} En ${place}.`;
    // Prefer keeping seed dominant if already long
    if (seed.length < 100) core = withPlace;
  }

  return clampNoteText(core, 220);
}

const TONE_INSTRUCTION: Record<PhotoNoteTone, string> = {
  neutro:
    "Tono natural de blog de viaje: cercano, con una curiosidad breve si hay lugar/destino.",
  divertido:
    "Tono ligero y con humor suave; la curiosidad histórica puede ir con ironía leve, sin inventar la escena.",
  poetico:
    "Tono evocador breve; une la semilla con una pincelada histórica/cultural del lugar si hay ancla.",
};

export function buildPhotoNoteSystemPrompt(
  destination?: DestinationFiche | null
): string {
  return [
    "Eres un redactor de blog de viaje.",
    "El usuario te da una descripción breve (campo «semilla») de lo que hay en la foto.",
    "Tu trabajo es COMPLEMENTAR y COMPLETAR esa semilla en UNA nota corta (1–2 frases, máximo ~200 caracteres) en español, lista para publicar en el blog.",
    "IMPORTANTE: NO ves la imagen. La semilla es la única fuente de lo que aparece en la foto.",
    "Además del JSON puedes usar datos de LOCALIZACIÓN si vienen rellenados:",
    "- Si hay «lugar» (sitio enlazado): intégralo y, si encaja, una curiosidad histórica/cultural de ese sitio (tradición, historia, por qué importa).",
    "- Si no hay lugar pero sí «cerca»: puedes anclar una curiosidad al sitio cercano nombrado.",
    "- El título del viaje (p. ej. Krakow) fija el destino: las curiosidades deben encajar con ese destino.",
    "- Si hay «cuando» (fecha/hora EXIF): úsala solo si encaja sin alargar demasiado.",
    "- «tiene_gps» solo indica coordenadas; NO inventes ciudad o monumento solo a partir de eso.",
    buildTravelBlogVoiceBlock({ compact: true, destination }),
    "Conserva el sentido de la semilla; pule estilo y une semilla + lugar + curiosidad breve.",
    "Si la semilla ya nombra el mismo lugar, no lo repitas de forma torpe.",
    "Si hay notas_existentes, no las copies; complementa sin repetir.",
    "No uses comillas ni prefijos como «Nota:». Solo el texto de la nota.",
  ].join(" ");
}

export function buildPhotoNoteUserPrompt(ctx: PhotoNoteSuggestContext): string {
  return JSON.stringify(
    {
      semilla: ctx.userSeed,
      viaje: ctx.travelTitle,
      ficha_destino: ctx.destination?.name
        ? {
            nombre: ctx.destination.name,
            temas: ctx.destination.themes,
          }
        : ctx.destination?.themes?.length
          ? { nombre: null, temas: ctx.destination.themes }
          : null,
      autor: ctx.authorAlias,
      cuando: ctx.exifLocal,
      lugar: ctx.place
        ? {
            nombre: ctx.place.name,
            tipo: ctx.place.type,
            tipoLabel: ctx.place.tipoLabel,
          }
        : null,
      cerca: ctx.nearbyPlaceNames,
      tiene_gps: ctx.hasGps,
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
 * Complement a user seed into a photo note.
 * Without a usable seed, returns a local message (no model call).
 */
export async function suggestPhotoNote(options: {
  photoId: string;
  context: PhotoNoteSuggestContext;
  forceAi?: boolean;
}): Promise<SuggestPhotoNoteResult> {
  const { photoId, context, forceAi = false } = options;
  const sparse = !hasUsablePhotoNoteSeed(context.userSeed);
  const cacheKey = photoNoteContextCacheKey(photoId, context);

  const cached = suggestionCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return {
      suggestion: cached.suggestion,
      fromAi: cached.fromAi,
      cached: true,
      sparse,
    };
  }

  if (sparse) {
    return {
      suggestion: heuristicPhotoNote(context),
      fromAi: false,
      cached: false,
      sparse: true,
      interpretation: `Escribe al menos ${PHOTO_NOTE_SEED_MIN_CHARS} caracteres describiendo la foto; la IA solo complementa lo que digas.`,
    };
  }

  const { apiKey, model } = getAiConfig();
  if (!apiKey) {
    const suggestion = heuristicPhotoNote(context);
    return {
      suggestion,
      fromAi: false,
      cached: false,
      sparse: false,
      interpretation: "Sin API key; se pulió la descripción en local.",
    };
  }

  // forceAi unused for gating now (seed is the gate); kept for API compat
  void forceAi;

  try {
    const ai = createAiClient();
    const completion = await ai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: buildPhotoNoteSystemPrompt(context.destination) },
        { role: "user", content: buildPhotoNoteUserPrompt(context) },
      ],
      temperature: 0.25,
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
      sparse: false,
      interpretation: fromAi
        ? "Nota completada a partir de tu descripción. Edítala antes de guardar."
        : "La IA no devolvió texto; se usó una versión local de tu descripción.",
    };
  } catch {
    const suggestion = heuristicPhotoNote(context);
    return {
      suggestion,
      fromAi: false,
      cached: false,
      sparse: false,
      interpretation:
        "No hay conexión con la IA. Se usó una versión local de tu descripción.",
    };
  }
}
