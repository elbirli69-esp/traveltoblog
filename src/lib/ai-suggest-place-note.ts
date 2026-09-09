/**
 * On-demand place note suggestions.
 * Manual trigger only — no auto calls. Text only.
 * Uses place name + user seed (written note); model only complements.
 */

import { createAiClient, getAiConfig } from "@/lib/ai";
import { placeLabel } from "@/lib/places";
import { buildTravelBlogVoiceBlock } from "@/lib/ai-blog-voice";
import type { DestinationFiche } from "@/lib/destination-fiche";
import type { PlaceType } from "@prisma/client";
import {
  clampNoteText,
  sanitizeSuggestionText,
  type PhotoNoteTone,
  parsePhotoNoteTone,
  PHOTO_NOTE_SEED_MIN_CHARS,
  PHOTO_NOTE_MAX_TOKENS,
  normalizePhotoNoteSeed,
  hasUsablePhotoNoteSeed,
} from "@/lib/ai-suggest-photo-note";

export type PlaceNoteTone = PhotoNoteTone;
export const PLACE_NOTE_TONES = ["neutro", "divertido", "poetico"] as const;
export const PLACE_NOTE_SEED_MIN_CHARS = PHOTO_NOTE_SEED_MIN_CHARS;
export const PLACE_NOTE_MAX_TOKENS = PHOTO_NOTE_MAX_TOKENS;

export const parsePlaceNoteTone = parsePhotoNoteTone;
export const normalizePlaceNoteSeed = normalizePhotoNoteSeed;
export const hasUsablePlaceNoteSeed = hasUsablePhotoNoteSeed;

export type PlaceNoteSuggestContext = {
  travelTitle: string;
  authorAlias: string;
  /** Brief note written by the user — required to call the model. */
  userSeed: string;
  placeName: string;
  placeType: string;
  placeTypeLabel: string;
  visitedAtLocal: string | null;
  existingNotes: string[];
  tone: PlaceNoteTone;
  destination?: DestinationFiche | null;
};

const MAX_NOTES = 4;

export function formatVisitedAtLocal(
  iso: string | null | undefined
): string | null {
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

export function buildPlaceNoteSuggestContext(input: {
  travelTitle: string;
  authorAlias: string;
  userSeed: string;
  placeName: string;
  placeType: string;
  visitedAt?: string | null;
  existingNotes: string[];
  tone: PlaceNoteTone;
  destination?: DestinationFiche | null;
}): PlaceNoteSuggestContext {
  const placeType = input.placeType || "OTHER";
  return {
    travelTitle: input.travelTitle.trim().slice(0, 80) || "Viaje",
    authorAlias: input.authorAlias.trim().slice(0, 40) || "Viajero",
    userSeed: normalizePlaceNoteSeed(input.userSeed),
    placeName: input.placeName.trim().slice(0, 80) || "Lugar",
    placeType,
    placeTypeLabel: placeLabel(placeType as PlaceType) || placeType || "Lugar",
    visitedAtLocal: formatVisitedAtLocal(input.visitedAt),
    existingNotes: input.existingNotes
      .map((n) => clampNoteText(n))
      .filter(Boolean)
      .slice(0, MAX_NOTES),
    tone: input.tone,
    destination: input.destination ?? null,
  };
}

export function placeNoteContextCacheKey(
  placeKey: string,
  ctx: PlaceNoteSuggestContext
): string {
  return JSON.stringify({
    placeKey,
    seed: ctx.userSeed,
    title: ctx.travelTitle,
    alias: ctx.authorAlias,
    name: ctx.placeName,
    type: ctx.placeType,
    visited: ctx.visitedAtLocal,
    notes: ctx.existingNotes,
    tone: ctx.tone,
  });
}

const TONE_INSTRUCTION: Record<PlaceNoteTone, string> = {
  neutro:
    "Tono natural de blog de viaje: cercano, con una curiosidad breve del lugar si encaja.",
  divertido:
    "Tono ligero y con humor suave; la curiosidad del lugar puede ir con ironía leve.",
  poetico:
    "Tono evocador breve; une la semilla con una pincelada histórica/cultural del lugar.",
};

export function buildPlaceNoteSystemPrompt(
  destination?: DestinationFiche | null
): string {
  return [
    "Eres un redactor de blog de viaje.",
    "El usuario te da una descripción breve (campo «semilla») sobre un LUGAR visitado.",
    "También recibes el NOMBRE del lugar y su tipo: úsalos siempre como ancla.",
    "Tu trabajo es COMPLEMENTAR y COMPLETAR esa semilla en UNA nota corta (1–2 frases, máximo ~200 caracteres) en español, lista para el blog.",
    "IMPORTANTE: NO inventes lo que hicieron en el sitio ni anécdotas personales no escritas en la semilla.",
    "Sí puedes añadir una curiosidad histórica/cultural del lugar nombrado (tradición, historia, por qué importa) si encaja con el nombre/tipo y el destino del viaje.",
    buildTravelBlogVoiceBlock({ compact: true, destination }),
    "Conserva el sentido de la semilla; pule estilo y une semilla + nombre del lugar + curiosidad breve.",
    "Si la semilla ya nombra el mismo lugar, no lo repitas de forma torpe.",
    "Si hay notas_existentes, no las copies; complementa sin repetir.",
    "No uses comillas ni prefijos como «Nota:». Solo el texto de la nota.",
  ].join(" ");
}

export function buildPlaceNoteUserPrompt(ctx: PlaceNoteSuggestContext): string {
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
      lugar: {
        nombre: ctx.placeName,
        tipo: ctx.placeType,
        tipoLabel: ctx.placeTypeLabel,
      },
      cuando_visita: ctx.visitedAtLocal,
      notas_existentes: ctx.existingNotes,
      tono: ctx.tone,
      instruccion_tono: TONE_INSTRUCTION[ctx.tone],
    },
    null,
    0
  );
}

/**
 * Local fallback: polish seed with place name. Never invents visit anecdotes.
 */
export function heuristicPlaceNote(ctx: PlaceNoteSuggestContext): string {
  const seed = ctx.userSeed;
  const place = ctx.placeName;
  const typeBit =
    ctx.placeTypeLabel && ctx.placeTypeLabel !== place
      ? `${place} (${ctx.placeTypeLabel})`
      : place;

  if (!seed) {
    if (ctx.visitedAtLocal) return `En ${typeBit}, ${ctx.visitedAtLocal}.`;
    return `Nota sobre ${typeBit}.`;
  }

  const endsWell = /[.!?…]$/.test(seed);
  let core = endsWell ? seed : `${seed}.`;
  const nameLc = place.toLowerCase();

  if (ctx.tone === "divertido") {
    if (!/[!?]/.test(core)) {
      core = core.replace(/\.$/, "") + " — de esos sitios que luego cuentas.";
    }
  } else if (ctx.tone === "poetico") {
    if (!core.toLowerCase().includes(nameLc)) {
      core = `${core.replace(/\.$/, "")}; calma y memoria en ${place}.`;
    }
  } else if (!core.toLowerCase().includes(nameLc)) {
    const withPlace = ctx.visitedAtLocal
      ? `${core.replace(/\.$/, "")} En ${typeBit}, ${ctx.visitedAtLocal}.`
      : `${core.replace(/\.$/, "")} En ${typeBit}.`;
    if (seed.length < 100) core = withPlace;
  }

  return clampNoteText(core, 220);
}

type CacheEntry = { suggestion: string; fromAi: boolean; at: number };
const suggestionCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;

export function clearPlaceNoteSuggestionCache(): void {
  suggestionCache.clear();
}

export type SuggestPlaceNoteResult = {
  suggestion: string;
  fromAi: boolean;
  cached: boolean;
  sparse: boolean;
  interpretation?: string;
};

export async function suggestPlaceNote(options: {
  placeKey: string;
  context: PlaceNoteSuggestContext;
}): Promise<SuggestPlaceNoteResult> {
  const { placeKey, context } = options;
  const sparse = !hasUsablePlaceNoteSeed(context.userSeed);
  const cacheKey = placeNoteContextCacheKey(placeKey, context);

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
      suggestion: heuristicPlaceNote(context),
      fromAi: false,
      cached: false,
      sparse: true,
      interpretation: `Escribe al menos ${PLACE_NOTE_SEED_MIN_CHARS} caracteres sobre el lugar; la IA solo complementa lo que digas y usa el nombre «${context.placeName}».`,
    };
  }

  const { apiKey, model } = getAiConfig();
  if (!apiKey) {
    const suggestion = heuristicPlaceNote(context);
    return {
      suggestion,
      fromAi: false,
      cached: false,
      sparse: false,
      interpretation: "Sin API key; se pulió la nota en local con el nombre del lugar.",
    };
  }

  try {
    const ai = createAiClient();
    const completion = await ai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: buildPlaceNoteSystemPrompt(context.destination),
        },
        { role: "user", content: buildPlaceNoteUserPrompt(context) },
      ],
      temperature: 0.25,
      max_tokens: PLACE_NOTE_MAX_TOKENS,
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const suggestion =
      sanitizeSuggestionText(raw) || heuristicPlaceNote(context);
    const fromAi = Boolean(raw);
    suggestionCache.set(cacheKey, { suggestion, fromAi, at: Date.now() });
    return {
      suggestion,
      fromAi,
      cached: false,
      sparse: false,
      interpretation: fromAi
        ? `Nota completada con el nombre «${context.placeName}». Edítala antes de guardar.`
        : "La IA no devolvió texto; se usó una versión local de tu nota.",
    };
  } catch {
    const suggestion = heuristicPlaceNote(context);
    return {
      suggestion,
      fromAi: false,
      cached: false,
      sparse: false,
      interpretation:
        "No hay conexión con la IA. Se usó una versión local de tu nota.",
    };
  }
}
