/**
 * On-demand Reel storyboard suggestions (Phase 3).
 * Heuristic candidates → one AI reorder/caption call → validated IDs.
 */

import { createAiClient, getAiConfig } from "@/lib/ai";
import { clampNoteText } from "@/lib/ai-suggest-photo-note";
import { buildTravelBlogVoiceBlock } from "@/lib/ai-blog-voice";
import { computeReelPhotoPriority } from "@/lib/highlight-score";
import { pickDiverseExportPhotos } from "@/lib/export-photo-pick";
import {
  parseReelDuration,
  reelSoftMaxFrames,
  type ReelDurationPreset,
} from "@/lib/export-reel";
import { isoToDateKey } from "@/lib/travel-dates";

export const REEL_STORYBOARD_MAX_TOKENS = 400;
export const REEL_STORYBOARD_CANDIDATE_CAP = 20;
/** Minimum narrative seed before Completar storyboard con IA. */
export const REEL_STORYBOARD_SEED_MIN_CHARS = 12;
const MAX_SEED_CHARS = 400;

export function normalizeReelStoryboardSeed(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_SEED_CHARS);
}

export function hasUsableReelStoryboardSeed(seed: string): boolean {
  return normalizeReelStoryboardSeed(seed).length >= REEL_STORYBOARD_SEED_MIN_CHARS;
}

export type StoryboardRole = "open" | "beat" | "close";

export type StoryboardFrame = {
  photoId: string;
  caption?: string;
  role?: StoryboardRole;
  reason?: string;
};

export type StoryboardCandidate = {
  photoId: string;
  dayKey: string | null;
  placeName: string | null;
  highlightScore: number;
  isTransportStart: boolean;
  isTransportEnd: boolean;
  existingCaption: string | null;
  priority: number;
};

export function slotCountForDuration(durationSeconds: ReelDurationPreset): number {
  return reelSoftMaxFrames(durationSeconds);
}

export function buildStoryboardCandidates(
  photos: Array<{
    id: string;
    selected: boolean;
    mediaType?: string | null;
    posterFilename?: string | null;
    exifDateTime: Date | string | null;
    placeName?: string | null;
    placeId?: string | null;
    highlightScore?: number | null;
    placeHighlightScore?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    isTransportStart?: boolean;
    isTransportEnd?: boolean;
    comments?: string[];
  }>,
  opts?: { dayKey?: string | null; max?: number }
): StoryboardCandidate[] {
  const dayKey = opts?.dayKey ?? null;
  const max = opts?.max ?? REEL_STORYBOARD_CANDIDATE_CAP;

  const usable = photos.filter((p) => {
    if (!p.selected) return false;
    if (p.mediaType === "VIDEO" && !p.posterFilename) return false;
    if (dayKey) {
      if (!p.exifDateTime) return false;
      const iso =
        typeof p.exifDateTime === "string"
          ? p.exifDateTime
          : p.exifDateTime.toISOString();
      if (isoToDateKey(iso) !== dayKey) return false;
    }
    return true;
  });

  const ranked = usable
    .map((p) => {
      const caption = p.comments?.find((c) => c.trim())?.trim() || null;
      const day =
        p.exifDateTime == null
          ? null
          : isoToDateKey(
              typeof p.exifDateTime === "string"
                ? p.exifDateTime
                : p.exifDateTime.toISOString()
            );
      const priority = computeReelPhotoPriority({
        highlightScore: p.highlightScore ?? 5,
        hasCaption: Boolean(caption),
        placeName: p.placeName,
        placeHighlightScore: p.placeHighlightScore,
      });
      return {
        photoId: p.id,
        dayKey: day,
        placeName: p.placeName?.trim() || null,
        highlightScore: p.highlightScore ?? 5,
        isTransportStart: Boolean(p.isTransportStart),
        isTransportEnd: Boolean(p.isTransportEnd),
        existingCaption: caption ? clampNoteText(caption, 80) : null,
        priority,
        latitude: p.latitude,
        longitude: p.longitude,
        exifDateTime: p.exifDateTime,
        placeId: p.placeId,
        hasCaption: Boolean(caption),
      };
    })
    .sort((a, b) => b.priority - a.priority);

  // Prefer open/close transport shots in the candidate pool
  const transport = ranked.filter((p) => p.isTransportStart || p.isTransportEnd);
  const rest = ranked.filter((p) => !p.isTransportStart && !p.isTransportEnd);
  const diverse = pickDiverseExportPhotos(
    rest.map((p) => ({
      id: p.photoId,
      highlightScore: p.highlightScore,
      placeName: p.placeName,
      placeId: p.placeId,
      latitude: p.latitude,
      longitude: p.longitude,
      exifDateTime: p.exifDateTime,
      hasCaption: p.hasCaption,
      dayKey: p.dayKey,
    })),
    {
      max: Math.max(0, max - Math.min(2, transport.length)),
      maxPerPlace: 3,
    }
  );

  const mergedIds = [
    ...transport.slice(0, 2).map((p) => p.photoId),
    ...diverse.map((p) => p.id),
  ];
  const byId = new Map(ranked.map((p) => [p.photoId, p]));
  const seen = new Set<string>();
  const out: StoryboardCandidate[] = [];
  for (const id of mergedIds) {
    if (seen.has(id)) continue;
    const p = byId.get(id);
    if (!p) continue;
    seen.add(id);
    out.push({
      photoId: p.photoId,
      dayKey: p.dayKey,
      placeName: p.placeName,
      highlightScore: p.highlightScore,
      isTransportStart: p.isTransportStart,
      isTransportEnd: p.isTransportEnd,
      existingCaption: p.existingCaption,
      priority: p.priority,
    });
    if (out.length >= max) break;
  }
  return out;
}

export function heuristicStoryboard(
  candidates: StoryboardCandidate[],
  durationSeconds: ReelDurationPreset
): StoryboardFrame[] {
  const slots = Math.min(slotCountForDuration(durationSeconds), candidates.length);
  if (slots === 0) return [];

  const open =
    candidates.find((c) => c.isTransportStart) ??
    candidates[0] ??
    null;
  const close =
    candidates.find((c) => c.isTransportEnd && c.photoId !== open?.photoId) ??
    candidates[candidates.length - 1] ??
    null;

  const middle = candidates.filter(
    (c) => c.photoId !== open?.photoId && c.photoId !== close?.photoId
  );

  const frames: StoryboardFrame[] = [];
  if (open) {
    frames.push({
      photoId: open.photoId,
      caption: open.existingCaption ?? undefined,
      role: "open",
      reason: open.isTransportStart ? "salida" : "apertura",
    });
  }
  for (const c of middle) {
    if (frames.length >= slots - (close && close.photoId !== open?.photoId ? 1 : 0)) {
      break;
    }
    frames.push({
      photoId: c.photoId,
      caption: c.existingCaption ?? undefined,
      role: "beat",
      reason: c.placeName ?? "momento",
    });
  }
  if (close && close.photoId !== open?.photoId && frames.length < slots) {
    frames.push({
      photoId: close.photoId,
      caption: close.existingCaption ?? undefined,
      role: "close",
      reason: close.isTransportEnd ? "regreso" : "cierre",
    });
  }

  return frames.slice(0, slots);
}

export function parseStoryboardResponse(
  raw: unknown,
  allowedIds: Set<string>,
  maxFrames: number
): StoryboardFrame[] | null {
  if (!raw || typeof raw !== "object") return null;
  const framesRaw = (raw as { frames?: unknown }).frames;
  if (!Array.isArray(framesRaw)) return null;

  const seen = new Set<string>();
  const frames: StoryboardFrame[] = [];
  for (const item of framesRaw) {
    if (!item || typeof item !== "object") continue;
    const photoId =
      typeof (item as { photoId?: unknown }).photoId === "string"
        ? (item as { photoId: string }).photoId.trim()
        : "";
    if (!photoId || !allowedIds.has(photoId) || seen.has(photoId)) continue;
    seen.add(photoId);
    const captionRaw = (item as { caption?: unknown }).caption;
    const caption =
      typeof captionRaw === "string" && captionRaw.trim()
        ? clampNoteText(captionRaw, 90)
        : undefined;
    const roleRaw = (item as { role?: unknown }).role;
    const role: StoryboardRole | undefined =
      roleRaw === "open" || roleRaw === "beat" || roleRaw === "close"
        ? roleRaw
        : undefined;
    const reasonRaw = (item as { reason?: unknown }).reason;
    const reason =
      typeof reasonRaw === "string" ? clampNoteText(reasonRaw, 40) : undefined;
    frames.push({ photoId, caption, role, reason });
    if (frames.length >= maxFrames) break;
  }
  return frames.length > 0 ? frames : null;
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function buildStoryboardSystemPrompt(): string {
  return [
    "Eres un montador y copywriter de Reels para un blog de viaje.",
    "El usuario te da una idea narrativa (campo «semilla») de lo que quiere contar.",
    "Devuelve SOLO JSON: {\"version\":1,\"frames\":[{\"photoId\":\"...\",\"caption\":\"...\",\"role\":\"open|beat|close\",\"reason\":\"...\"}],\"interpretation\":\"...\"}.",
    "Usa únicamente photoId de la lista de candidatos. No inventes ids.",
    "Ordena open → beats → close según la semilla y los metadatos (lugar, caption existente, salida/regreso, prioridad). Respeta max_frames.",
    "Captions en español, cortos (≤90 caracteres), pensados para enganchar a quien ve el Reel / lee el blog.",
    "Si hay caption en el candidato, reutilízalo o enriquécelo con una curiosidad breve del lugar/destino si hay ancla.",
    "Si no hay caption pero sí lugar, caption = lugar + micro-curiosidad o gancho alineado con la semilla.",
    buildTravelBlogVoiceBlock({ compact: true }),
    "interpretation: una frase sobre cómo el montaje sirve al relato de blog / semilla.",
  ].join(" ");
}

export function buildStoryboardUserPrompt(input: {
  travelTitle: string;
  userSeed: string;
  durationSeconds: ReelDurationPreset;
  maxFrames: number;
  dayKey: string | null;
  brief: string | null;
  candidates: StoryboardCandidate[];
}): string {
  return JSON.stringify(
    {
      semilla: input.userSeed,
      viaje: input.travelTitle,
      duracion_s: input.durationSeconds,
      max_frames: input.maxFrames,
      dia: input.dayKey,
      brief_viaje: input.brief,
      candidatos: input.candidates.map((c) => ({
        photoId: c.photoId,
        dia: c.dayKey,
        lugar: c.placeName,
        score: c.highlightScore,
        prioridad: c.priority,
        salida: c.isTransportStart,
        regreso: c.isTransportEnd,
        caption: c.existingCaption,
      })),
    },
    null,
    0
  );
}

type CacheEntry = {
  frames: StoryboardFrame[];
  interpretation: string | null;
  fromAi: boolean;
  at: number;
};
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;

export function clearReelStoryboardCache(): void {
  cache.clear();
}

export type SuggestReelStoryboardResult = {
  frames: StoryboardFrame[];
  fromAi: boolean;
  cached: boolean;
  interpretation: string | null;
  candidateCount: number;
};

export async function suggestReelStoryboard(options: {
  travelId: string;
  travelTitle: string;
  durationSeconds: ReelDurationPreset;
  dayKey?: string | null;
  brief?: string | null;
  userSeed: string;
  candidates: StoryboardCandidate[];
}): Promise<SuggestReelStoryboardResult> {
  const durationSeconds = parseReelDuration(options.durationSeconds);
  const userSeed = normalizeReelStoryboardSeed(options.userSeed);
  const maxFrames = Math.min(
    slotCountForDuration(durationSeconds),
    options.candidates.length
  );
  const cacheKey = JSON.stringify({
    travelId: options.travelId,
    durationSeconds,
    dayKey: options.dayKey ?? null,
    seed: userSeed,
    brief: options.brief?.trim() ?? "",
    ids: options.candidates.map((c) => c.photoId),
  });

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return {
      frames: hit.frames,
      fromAi: hit.fromAi,
      cached: true,
      interpretation: hit.interpretation,
      candidateCount: options.candidates.length,
    };
  }

  const heuristic = heuristicStoryboard(options.candidates, durationSeconds);
  if (options.candidates.length === 0) {
    return {
      frames: [],
      fromAi: false,
      cached: false,
      interpretation: "No hay fotos candidatas para este alcance.",
      candidateCount: 0,
    };
  }

  if (!hasUsableReelStoryboardSeed(userSeed)) {
    return {
      frames: heuristic,
      fromAi: false,
      cached: false,
      interpretation: `Escribe al menos ${REEL_STORYBOARD_SEED_MIN_CHARS} caracteres sobre qué quieres contar; la IA ordena fotos y captions con esa idea.`,
      candidateCount: options.candidates.length,
    };
  }

  const { apiKey, model } = getAiConfig();
  if (!apiKey) {
    cache.set(cacheKey, {
      frames: heuristic,
      fromAi: false,
      interpretation: "Sin API key; storyboard heurístico.",
      at: Date.now(),
    });
    return {
      frames: heuristic,
      fromAi: false,
      cached: false,
      interpretation: "Sin API key; storyboard heurístico.",
      candidateCount: options.candidates.length,
    };
  }

  const allowed = new Set(options.candidates.map((c) => c.photoId));

  try {
    const ai = createAiClient();
    const completion = await ai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: buildStoryboardSystemPrompt() },
        {
          role: "user",
          content: buildStoryboardUserPrompt({
            travelTitle: options.travelTitle,
            userSeed,
            durationSeconds,
            maxFrames,
            dayKey: options.dayKey ?? null,
            brief: options.brief?.trim() || null,
            candidates: options.candidates,
          }),
        },
      ],
      temperature: 0.25,
      max_tokens: REEL_STORYBOARD_MAX_TOKENS,
    });
    const rawText = completion.choices[0]?.message?.content?.trim() ?? "";
    const parsed = extractJsonObject(rawText);
    const frames = parseStoryboardResponse(parsed, allowed, maxFrames);
    if (!frames) {
      cache.set(cacheKey, {
        frames: heuristic,
        fromAi: false,
        interpretation: "JSON inválido; se usó orden heurístico.",
        at: Date.now(),
      });
      return {
        frames: heuristic,
        fromAi: false,
        cached: false,
        interpretation: "JSON inválido; se usó orden heurístico.",
        candidateCount: options.candidates.length,
      };
    }
    const interpretation =
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { interpretation?: unknown }).interpretation === "string"
        ? clampNoteText(
            (parsed as { interpretation: string }).interpretation,
            160
          )
        : "Storyboard propuesto a partir de tu idea. Aplícalo antes de exportar.";
    cache.set(cacheKey, {
      frames,
      fromAi: true,
      interpretation,
      at: Date.now(),
    });
    return {
      frames,
      fromAi: true,
      cached: false,
      interpretation,
      candidateCount: options.candidates.length,
    };
  } catch {
    return {
      frames: heuristic,
      fromAi: false,
      cached: false,
      interpretation:
        "No hay conexión con la IA; se usó orden heurístico.",
      candidateCount: options.candidates.length,
    };
  }
}

export { parseReelDuration };
