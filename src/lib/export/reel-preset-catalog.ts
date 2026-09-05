/**
 * Typed catalog of Reel montage presets.
 * Same vertical pipeline for all; presets are montage looks (pacing/captions/cuts),
 * not alternate HTML-like structures. UI duration always wins over preset duration hints.
 */

import type {
  ExportReelDirectives,
  Emphasis,
  ReelPacing,
  ReelCaptionMode,
  ReelTransitionStyle,
} from "@/lib/export-directives";

export type ReelPresetId =
  | "balanced-story"
  | "calm-story"
  | "punchy-highlights"
  | "textless-photos"
  | "place-labels"
  | "map-pulse";

export type ReelPresetEnergy = "calm" | "balanced" | "punchy";

export interface ReelPresetCriteria {
  pacing: ReelPacing;
  captionMode: ReelCaptionMode;
  transitionStyle: ReelTransitionStyle;
  heroBias: Emphasis;
  photoDensity: Emphasis; // relative clip count for the chosen duration
  energy: ReelPresetEnergy;
  mapBias: Emphasis;
}

export interface ReelPresetCatalogEntry {
  id: ReelPresetId;
  version: 1;
  label: string;
  tagline: string;
  description: string;
  criteria: ReelPresetCriteria;
  defaultDirectives: ExportReelDirectives;
  tags: string[];
  featuredInUi: boolean;
  uiOrder: number;
}

export const REEL_PRESET_CATALOG: ReelPresetCatalogEntry[] = [
  {
    id: "balanced-story",
    version: 1,
    label: "Historia equilibrada",
    tagline: "Ritmo medio, textos cortos",
    description:
      "Montaje por defecto: mezcla de fotos, textos breves y transiciones variadas.",
    criteria: {
      pacing: "balanced",
      captionMode: "short",
      transitionStyle: "mixed",
      heroBias: "medium",
      photoDensity: "medium",
      energy: "balanced",
      mapBias: "medium",
    },
    defaultDirectives: {
      pacing: "balanced",
      captionMode: "short",
      captionPlacement: "bottom",
      transitionStyle: "mixed",
      transitionSeconds: 0.4,
      heroBias: "medium",
    },
    tags: ["equilibrado", "historia", "default", "textos"],
    featuredInUi: true,
    uiOrder: 1,
  },
  {
    id: "calm-story",
    version: 1,
    label: "Crónica calmada",
    tagline: "Pocas fotos, fundidos, más prosa",
    description:
      "Ritmo lento, menos clips, captions narrativos y fundidos suaves.",
    criteria: {
      pacing: "calm",
      captionMode: "story",
      transitionStyle: "softFade",
      heroBias: "high",
      photoDensity: "low",
      energy: "calm",
      mapBias: "low",
    },
    defaultDirectives: {
      pacing: "calm",
      captionMode: "story",
      captionPlacement: "center",
      transitionStyle: "softFade",
      transitionSeconds: 0.5,
      heroBias: "high",
    },
    tags: ["tranquilo", "calma", "cronica", "lento", "suave", "fundidos"],
    featuredInUi: true,
    uiOrder: 2,
  },
  {
    id: "punchy-highlights",
    version: 1,
    label: "Highlights rápidos",
    tagline: "Ritmo punchy, cortes vivos",
    description:
      "Más clips, prioriza highlights, textos cortos y cortes rápidos.",
    criteria: {
      pacing: "punchy",
      captionMode: "short",
      transitionStyle: "fastCut",
      heroBias: "high",
      photoDensity: "high",
      energy: "punchy",
      mapBias: "medium",
    },
    defaultDirectives: {
      pacing: "punchy",
      captionMode: "short",
      captionPlacement: "bottom",
      transitionStyle: "fastCut",
      transitionSeconds: 0.22,
      heroBias: "high",
    },
    tags: ["rapido", "dinamico", "punchy", "highlights", "cortes"],
    featuredInUi: true,
    uiOrder: 3,
  },
  {
    id: "textless-photos",
    version: 1,
    label: "Solo fotos",
    tagline: "Sin texto en pantalla",
    description:
      "Protagonismo fotográfico puro: sin captions, ritmo calmado/medio y fundidos.",
    criteria: {
      pacing: "calm",
      captionMode: "none",
      transitionStyle: "softFade",
      heroBias: "high",
      photoDensity: "medium",
      energy: "calm",
      mapBias: "low",
    },
    defaultDirectives: {
      pacing: "calm",
      captionMode: "none",
      captionPlacement: "bottom",
      transitionStyle: "softFade",
      transitionSeconds: 0.5,
      heroBias: "high",
    },
    tags: ["sin texto", "mute", "solo fotos", "imagenes", "textless"],
    featuredInUi: true,
    uiOrder: 4,
  },
  {
    id: "place-labels",
    version: 1,
    label: "Nombres de lugar",
    tagline: "Solo sitios, ritmo equilibrado",
    description:
      "Captions de lugar únicamente; montaje claro para reconocer el recorrido.",
    criteria: {
      pacing: "balanced",
      captionMode: "placeOnly",
      transitionStyle: "mixed",
      heroBias: "medium",
      photoDensity: "medium",
      energy: "balanced",
      mapBias: "high",
    },
    defaultDirectives: {
      pacing: "balanced",
      captionMode: "placeOnly",
      captionPlacement: "bottom",
      transitionStyle: "mixed",
      transitionSeconds: 0.4,
      heroBias: "medium",
    },
    tags: ["lugares", "sitios", "nombres", "place", "mapa"],
    featuredInUi: true,
    uiOrder: 5,
  },
  {
    id: "map-pulse",
    version: 1,
    label: "Mapa al frente",
    tagline: "Recorrido + pin, energía media-alta",
    description:
      "Énfasis en movimiento/mapa y lugares; captions de sitio y ritmo un poco más vivo.",
    criteria: {
      pacing: "punchy",
      captionMode: "placeOnly",
      transitionStyle: "mixed",
      heroBias: "high",
      photoDensity: "medium",
      energy: "punchy",
      mapBias: "high",
    },
    defaultDirectives: {
      pacing: "punchy",
      captionMode: "placeOnly",
      captionPlacement: "bottom",
      transitionStyle: "mixed",
      transitionSeconds: 0.3,
      heroBias: "high",
    },
    tags: ["mapa", "recorrido", "ruta", "trayecto", "gps", "pin"],
    featuredInUi: true,
    uiOrder: 6,
  },
];

const BY_ID = new Map(REEL_PRESET_CATALOG.map((e) => [e.id, e]));

export function getReelPresetCatalogEntry(
  id: ReelPresetId | string | null | undefined
): ReelPresetCatalogEntry | undefined {
  if (!id) return undefined;
  return BY_ID.get(id as ReelPresetId);
}

export function featuredReelPresetCatalog(): ReelPresetCatalogEntry[] {
  return REEL_PRESET_CATALOG.filter((e) => e.featuredInUi).sort(
    (a, b) => a.uiOrder - b.uiOrder
  );
}

/**
 * Merge preset defaults with brief knobs.
 * Brief wins on fields it sets; durationSeconds from UI is applied by the caller.
 */
export function mergeReelDirectives(
  base: ExportReelDirectives,
  overlay?: ExportReelDirectives | null
): ExportReelDirectives {
  if (!overlay) return { ...base };
  return {
    pacing: overlay.pacing ?? base.pacing,
    captionMode: overlay.captionMode ?? base.captionMode,
    captionPlacement: overlay.captionPlacement ?? base.captionPlacement,
    transitionStyle: overlay.transitionStyle ?? base.transitionStyle,
    heroBias: overlay.heroBias ?? base.heroBias,
    ...(overlay.durationSeconds != null
      ? { durationSeconds: overlay.durationSeconds }
      : base.durationSeconds != null
        ? { durationSeconds: base.durationSeconds }
        : {}),
    ...(overlay.targetPhotoCount != null
      ? { targetPhotoCount: overlay.targetPhotoCount }
      : base.targetPhotoCount != null
        ? { targetPhotoCount: base.targetPhotoCount }
        : {}),
    ...(overlay.transitionSeconds != null
      ? { transitionSeconds: overlay.transitionSeconds }
      : base.transitionSeconds != null
        ? { transitionSeconds: base.transitionSeconds }
        : {}),
  };
}

export function resolveReelDirectivesForPreset(
  presetId: ReelPresetId | null | undefined,
  briefDirectives?: ExportReelDirectives | null
): ExportReelDirectives {
  const entry =
    getReelPresetCatalogEntry(presetId) ??
    getReelPresetCatalogEntry("balanced-story")!;
  return mergeReelDirectives(entry.defaultDirectives, briefDirectives);
}
