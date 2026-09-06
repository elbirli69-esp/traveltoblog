/**
 * Typed catalog of PDF look presets.
 * Same WeasyPrint pipeline for all; presets = theme + layout knobs (not free CSS).
 */

import type { ExportPdfDirectives, Emphasis } from "@/lib/export-directives";
import type { PdfTemplate } from "@/lib/export-pdf-types";
import type { TypePackId } from "@/lib/export/type-packs";

export type PdfPresetId =
  | "pdf-classic"
  | "pdf-minimal"
  | "pdf-photo"
  | "pdf-dark"
  | "pdf-guide";

export interface PdfPresetCriteria {
  imageEmphasis: Emphasis;
  proseDensity: Emphasis;
  preferFullBleed: Emphasis;
  mosaicBias: Emphasis;
  energy: "calm" | "balanced" | "punchy";
}

export interface PdfPresetCatalogEntry {
  id: PdfPresetId;
  version: 1;
  label: string;
  tagline: string;
  description: string;
  /** CSS theme skin used by getPdfThemeCss */
  theme: PdfTemplate;
  typePack: TypePackId;
  criteria: PdfPresetCriteria;
  defaultDirectives: ExportPdfDirectives;
  tags: string[];
  featuredInUi: boolean;
  uiOrder: number;
}

export const PDF_PRESET_CATALOG: PdfPresetCatalogEntry[] = [
  {
    id: "pdf-classic",
    version: 1,
    label: "Clásico",
    tagline: "Serif cálido, equilibrio foto/prosa",
    description:
      "Fotolibro tradicional: tipografía serif, márgenes amplios y mezcla equilibrada de páginas.",
    theme: "classic",
    typePack: "serif-editorial",
    criteria: {
      imageEmphasis: "medium",
      proseDensity: "medium",
      preferFullBleed: "medium",
      mosaicBias: "medium",
      energy: "balanced",
    },
    defaultDirectives: {
      imageEmphasis: "medium",
      proseDensity: "medium",
      preferFullBleed: "medium",
      mosaicBias: "medium",
    },
    tags: ["clasico", "classic", "equilibrado", "serif", "default", "fotolibro"],
    featuredInUi: true,
    uiOrder: 1,
  },
  {
    id: "pdf-minimal",
    version: 1,
    label: "Minimal",
    tagline: "Mucha prosa, poca tinta",
    description:
      "Espacio en blanco, sans limpia y más peso en la crónica que en los full-bleed.",
    theme: "minimal",
    typePack: "sans-clean",
    criteria: {
      imageEmphasis: "low",
      proseDensity: "high",
      preferFullBleed: "low",
      mosaicBias: "low",
      energy: "calm",
    },
    defaultDirectives: {
      imageEmphasis: "low",
      proseDensity: "high",
      preferFullBleed: "low",
      mosaicBias: "low",
    },
    tags: ["minimal", "limpio", "prosa", "cronica", "sans", "blanco"],
    featuredInUi: true,
    uiOrder: 2,
  },
  {
    id: "pdf-photo",
    version: 1,
    label: "Foto primero",
    tagline: "Full-bleed y mosaicos",
    description:
      "Prioriza fotos grandes, full-bleed y mosaicos; prosa corta en los divisores.",
    theme: "classic",
    typePack: "hybrid",
    criteria: {
      imageEmphasis: "high",
      proseDensity: "low",
      preferFullBleed: "high",
      mosaicBias: "high",
      energy: "punchy",
    },
    defaultDirectives: {
      imageEmphasis: "high",
      proseDensity: "low",
      preferFullBleed: "high",
      mosaicBias: "high",
    },
    tags: [
      "foto",
      "photos",
      "full-bleed",
      "fullbleed",
      "mosaico",
      "mosaic",
      "visual",
      "imagenes",
    ],
    featuredInUi: true,
    uiOrder: 3,
  },
  {
    id: "pdf-dark",
    version: 1,
    label: "Revista oscura",
    tagline: "Skin oscura, contraste alto",
    description:
      "Tema dark-magazine: fondo ink, tipografía editorial y fotos con peso visual.",
    theme: "dark-magazine",
    typePack: "serif-editorial",
    criteria: {
      imageEmphasis: "high",
      proseDensity: "medium",
      preferFullBleed: "high",
      mosaicBias: "medium",
      energy: "balanced",
    },
    defaultDirectives: {
      imageEmphasis: "high",
      proseDensity: "medium",
      preferFullBleed: "high",
      mosaicBias: "medium",
    },
    tags: ["oscuro", "dark", "revista", "magazine", "nocturno", "cine"],
    featuredInUi: true,
    uiOrder: 4,
  },
  {
    id: "pdf-guide",
    version: 1,
    label: "Guía",
    tagline: "Más crónica y callouts de día",
    description:
      "Más prosa en divisores, menos mosaicos; útil como guía de viaje imprimible.",
    theme: "classic",
    typePack: "serif-editorial",
    criteria: {
      imageEmphasis: "medium",
      proseDensity: "high",
      preferFullBleed: "medium",
      mosaicBias: "low",
      energy: "calm",
    },
    defaultDirectives: {
      imageEmphasis: "medium",
      proseDensity: "high",
      preferFullBleed: "medium",
      mosaicBias: "low",
    },
    tags: ["guia", "guide", "practica", "callouts", "cronica", "texto"],
    featuredInUi: true,
    uiOrder: 5,
  },
];

const BY_ID = new Map(PDF_PRESET_CATALOG.map((e) => [e.id, e]));

export function getPdfPresetCatalogEntry(
  id: PdfPresetId | string | null | undefined
): PdfPresetCatalogEntry | undefined {
  if (!id) return undefined;
  return BY_ID.get(id as PdfPresetId);
}

export function featuredPdfPresetCatalog(): PdfPresetCatalogEntry[] {
  return PDF_PRESET_CATALOG.filter((e) => e.featuredInUi).sort(
    (a, b) => a.uiOrder - b.uiOrder
  );
}

/** Brief knobs overlay preset defaults (brief wins when present). */
export function mergePdfDirectives(
  base: ExportPdfDirectives,
  overlay?: ExportPdfDirectives | null
): ExportPdfDirectives {
  if (!overlay) return { ...base };
  return {
    imageEmphasis: overlay.imageEmphasis ?? base.imageEmphasis,
    proseDensity: overlay.proseDensity ?? base.proseDensity,
    preferFullBleed: overlay.preferFullBleed ?? base.preferFullBleed,
    mosaicBias: overlay.mosaicBias ?? base.mosaicBias,
  };
}

export function resolvePdfDirectivesForPreset(
  presetId: PdfPresetId | null | undefined,
  briefDirectives?: ExportPdfDirectives | null
): ExportPdfDirectives {
  const entry =
    getPdfPresetCatalogEntry(presetId) ??
    getPdfPresetCatalogEntry("pdf-classic")!;
  return mergePdfDirectives(entry.defaultDirectives, briefDirectives);
}

export function themeForPdfPreset(
  presetId: PdfPresetId | null | undefined
): PdfTemplate {
  return (
    getPdfPresetCatalogEntry(presetId)?.theme ??
    getPdfPresetCatalogEntry("pdf-classic")!.theme
  );
}

export function typePackForPdfPreset(
  presetId: PdfPresetId | null | undefined
): TypePackId {
  return (
    getPdfPresetCatalogEntry(presetId)?.typePack ??
    getPdfPresetCatalogEntry("pdf-classic")!.typePack
  );
}
