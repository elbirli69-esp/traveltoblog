/**
 * Editorial “what’s missing for a good blog” heuristics (plan B1).
 * Detect gaps only — never invent visits or content.
 */

import { formatDateKey, isoToDateKey, resolveTravelDayRange } from "@/lib/travel-dates";

export const BLOG_COMPLETENESS_MAX_GAPS = 5;

export type BlogGapCode =
  | "places_sparse"
  | "food_missing"
  | "personal_thin"
  | "day_gaps"
  | "hook_missing"
  | "tips_missing"
  | "cover_story"
  | "destination_context";

export type BlogGapActionKind =
  | "place"
  | "place_food"
  | "day"
  | "trip"
  | "photos_notes"
  | "photos_highlight"
  | "journal_brief";

export type BlogGap = {
  code: BlogGapCode;
  message: string;
  actionLabel: string;
  actionKind: BlogGapActionKind;
  /** Optional YYYY-MM-DD for day-scoped actions */
  dayDate?: string;
  /** Optional photo id to focus in gallery */
  photoId?: string;
  /** Higher = show first */
  weight: number;
};

export type BlogCompletenessInput = {
  title: string;
  journalBrief: string | null | undefined;
  startDate: string | null;
  endDate: string | null;
  photos: Array<{
    id: string;
    selected?: boolean;
    exifDateTime: string | null;
    latitude: number | null;
    longitude: number | null;
    placeId: string | null;
    highlightScore?: number | null;
    isTransportStart?: boolean;
    isTransportEnd?: boolean;
    photoNoteCount: number;
  }>;
  places: Array<{
    type: string;
    noteCount: number;
  }>;
  dayNotes: Array<{ dayDate: string | null; textLength?: number }>;
  tripNoteCount: number;
  /** Total length of PHOTO + DAY note texts (chars). */
  personalNoteChars: number;
};

export type BlogCompletenessResult = {
  score: number;
  gaps: BlogGap[];
  stats: {
    selectedPhotos: number;
    photosWithoutNote: number;
    placeCount: number;
    foodPlaceCount: number;
    dayCount: number;
    daysWithPhotosWithoutNote: number;
  };
};

const FOOD_TYPES = new Set(["RESTAURANT", "CAFE"]);
const GENERIC_TITLE =
  /^(viaje|trip|vacaciones|holidays|nuevo viaje|sin t[ií]tulo|test|prueba)\b/i;

function hasGps(lat: number | null, lng: number | null): boolean {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

/** Selected photos with no PHOTO note — for gallery queue. */
export function listPhotosWithoutNote(
  photos: BlogCompletenessInput["photos"]
): string[] {
  return photos
    .filter((p) => p.selected !== false && p.photoNoteCount === 0)
    .map((p) => p.id);
}

export function buildBlogCompleteness(
  input: BlogCompletenessInput
): BlogCompletenessResult {
  const selected = input.photos.filter((p) => p.selected !== false);
  const photosWithoutNote = selected.filter((p) => p.photoNoteCount === 0);
  const gpsPhotos = selected.filter((p) => hasGps(p.latitude, p.longitude));
  const placeCount = input.places.length;
  const foodPlaceCount = input.places.filter((p) =>
    FOOD_TYPES.has(p.type)
  ).length;
  const placeNotes = input.places.reduce((n, p) => n + p.noteCount, 0);

  const { dayKeys } = resolveTravelDayRange({
    startDate: input.startDate,
    endDate: input.endDate,
    photoExifDates: selected.map((p) => p.exifDateTime),
  });

  const daysWithDayNotes = new Set(
    input.dayNotes
      .filter((n) => n.dayDate)
      .map((n) => isoToDateKey(n.dayDate!))
  );

  const photosByDay = new Map<string, number>();
  for (const p of selected) {
    if (!p.exifDateTime) continue;
    const key = isoToDateKey(p.exifDateTime);
    photosByDay.set(key, (photosByDay.get(key) ?? 0) + 1);
  }

  const daysWithPhotosWithoutNote = [...photosByDay.keys()].filter(
    (key) => (photosByDay.get(key) ?? 0) > 0 && !daysWithDayNotes.has(key)
  );

  const candidates: BlogGap[] = [];

  // places_sparse: many GPS photos, few named places
  if (gpsPhotos.length >= 5 && placeCount < 2) {
    candidates.push({
      code: "places_sparse",
      message:
        "Hay muchas fotos con ubicación y pocos lugares marcados. Añade 2–3 sitios con nombre para anclar el blog.",
      actionLabel: "Añadir lugar",
      actionKind: "place",
      weight: 90,
    });
  } else if (gpsPhotos.length >= 8 && placeCount < Math.min(4, Math.ceil(gpsPhotos.length / 4))) {
    candidates.push({
      code: "places_sparse",
      message: `Solo hay ${placeCount} lugar${placeCount === 1 ? "" : "es"} marcado${placeCount === 1 ? "" : "s"} frente a ${gpsPhotos.length} fotos con GPS. Marca los sitios clave.`,
      actionLabel: "Añadir lugar",
      actionKind: "place",
      weight: 75,
    });
  }

  // food_missing
  if (dayKeys.length >= 2 && foodPlaceCount === 0 && selected.length >= 4) {
    candidates.push({
      code: "food_missing",
      message:
        "Un blog de viaje suele contar al menos una comida o café. ¿Dónde comisteis? Márcalo y añade una nota.",
      actionLabel: "Añadir restaurante/café",
      actionKind: "place_food",
      weight: 85,
    });
  }

  // personal_thin
  const muteRatio =
    selected.length > 0 ? photosWithoutNote.length / selected.length : 0;
  if (selected.length >= 4 && (muteRatio >= 0.6 || input.personalNoteChars < 80)) {
    const firstId = photosWithoutNote[0]?.id;
    candidates.push({
      code: "personal_thin",
      message:
        photosWithoutNote.length > 0
          ? `Faltan experiencias personales: ${photosWithoutNote.length} foto${photosWithoutNote.length === 1 ? "" : "s"} sin nota. Cuenta una anécdota o un momento del grupo.`
          : "Las notas son muy breves. Añade alguna anécdota personal para que el blog no sea solo un álbum.",
      actionLabel:
        photosWithoutNote.length > 0 ? "Fotos sin nota" : "Nota del día",
      actionKind: photosWithoutNote.length > 0 ? "photos_notes" : "day",
      photoId: firstId,
      dayDate: daysWithPhotosWithoutNote[0],
      weight: 95,
    });
  }

  // day_gaps: days with photos but no DAY note
  if (daysWithPhotosWithoutNote.length > 0 && dayKeys.length >= 1) {
    const first = daysWithPhotosWithoutNote[0]!;
    const label = formatDateKey(first, "short");
    candidates.push({
      code: "day_gaps",
      message:
        daysWithPhotosWithoutNote.length === 1
          ? `${label} tiene fotos pero no relato del día.`
          : `${daysWithPhotosWithoutNote.length} días tienen fotos sin nota del día (p. ej. ${label}).`,
      actionLabel: "Nota del día",
      actionKind: "day",
      dayDate: first,
      weight: 88,
    });
  }

  // hook_missing
  const brief = input.journalBrief?.trim() ?? "";
  if (input.tripNoteCount === 0 && brief.length < 12 && selected.length >= 1) {
    candidates.push({
      code: "hook_missing",
      message:
        "Falta el gancho del viaje: por qué fuisteis o la escena de apertura (nota del viaje o indicaciones de la crónica).",
      actionLabel: "Nota del viaje",
      actionKind: "trip",
      weight: 80,
    });
  }

  // tips_missing
  if (placeCount >= 2 && placeNotes === 0 && input.personalNoteChars < 200) {
    candidates.push({
      code: "tips_missing",
      message:
        "Añade 1–2 consejos útiles para quien lea el blog (cola, horario, «merece la pena») en un lugar o en la nota del día.",
      actionLabel: "Añadir tip en lugar",
      actionKind: "place",
      weight: 55,
    });
  }

  // cover_story: no elevated highlights
  const highlighted = selected.filter((p) => (p.highlightScore ?? 5) >= 7);
  if (selected.length >= 8 && highlighted.length < 2) {
    candidates.push({
      code: "cover_story",
      message:
        "Elige 3–5 fotos protagonistas (puntuación alta) para el ritmo del blog y del Reel.",
      actionLabel: "Ver galería",
      actionKind: "photos_highlight",
      weight: 45,
    });
  }

  // destination_context
  const title = input.title.trim();
  if (
    (GENERIC_TITLE.test(title) || title.length < 4) &&
    placeCount === 0 &&
    selected.length >= 3
  ) {
    candidates.push({
      code: "destination_context",
      message:
        "El título es genérico y no hay lugares. Nombra el destino o marca sitios para que la IA aporte historia local con ancla.",
      actionLabel: "Añadir lugar",
      actionKind: "place",
      weight: 50,
    });
  }

  candidates.sort((a, b) => b.weight - a.weight);
  const gaps = candidates.slice(0, BLOG_COMPLETENESS_MAX_GAPS);

  let score = 100;
  for (const g of gaps) {
    score -= Math.round(g.weight / 5);
  }
  // Soft penalties from stats even if not in top gaps
  if (photosWithoutNote.length > 0 && !gaps.some((g) => g.code === "personal_thin")) {
    score -= Math.min(15, photosWithoutNote.length);
  }
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    gaps,
    stats: {
      selectedPhotos: selected.length,
      photosWithoutNote: photosWithoutNote.length,
      placeCount,
      foodPlaceCount,
      dayCount: dayKeys.length,
      daysWithPhotosWithoutNote: daysWithPhotosWithoutNote.length,
    },
  };
}
