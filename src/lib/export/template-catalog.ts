/**
 * Typed catalog of HTML export looks.
 * Phase 1: one entry per current ExportTemplateId (4).
 * Structure (layoutBase) is fixed unless the user expressly asks to change it.
 */

import type { ExportHtmlDirectives, Emphasis } from "@/lib/export-directives";

export type ExportTemplateId =
  | "magazine"
  | "visual-journey"
  | "editorial-clean"
  | "dark-photo-journey";

/** Codepath in buildExportHtml — do not switch unless the user expressly asks. */
export type LayoutBase = "magazine" | "visual" | "editorial";

export type ThemePack = "light-paper" | "light-clean" | "dark-cinema";

export type TemplateCapability =
  | "gallery"
  | "guide"
  | "map-explorer"
  | "map-compact"
  | "unified-story"
  | "journal-article"
  | "lightbox"
  | "play-mode";

export type TemplateEnergy = "calm" | "balanced" | "punchy";
export type TemplateAudience = "friends" | "public" | "print-like";

export interface TemplateCriteria {
  theme: "light" | "dark" | "either";
  imageEmphasis: Emphasis;
  proseDensity: Emphasis;
  galleryEmphasis: Emphasis;
  guideEmphasis: Emphasis;
  mapEmphasis: Emphasis;
  energy: TemplateEnergy;
  audience: TemplateAudience;
}

export interface TemplateCatalogEntry {
  id: ExportTemplateId;
  version: 1;
  label: string;
  tagline: string;
  description: string;
  layoutBase: LayoutBase;
  themePack: ThemePack;
  capabilities: TemplateCapability[];
  criteria: TemplateCriteria;
  defaultDirectives: ExportHtmlDirectives;
  tags: string[];
  featuredInUi: boolean;
  uiOrder: number;
}

const EMPHASIS_MID: Emphasis = "medium";

export const TEMPLATE_CATALOG: TemplateCatalogEntry[] = [
  {
    id: "magazine",
    version: 1,
    label: "Magazine",
    tagline: "Blog experto con guía práctica",
    description:
      "Hero, recorrido cronológico unificado, galería, guía y cierre. Estructura completa de crónica.",
    layoutBase: "magazine",
    themePack: "light-paper",
    capabilities: [
      "gallery",
      "guide",
      "map-compact",
      "unified-story",
      "journal-article",
      "lightbox",
    ],
    criteria: {
      theme: "light",
      imageEmphasis: "medium",
      proseDensity: "medium",
      galleryEmphasis: "medium",
      guideEmphasis: "high",
      mapEmphasis: "medium",
      energy: "balanced",
      audience: "public",
    },
    defaultDirectives: {
      imageEmphasis: EMPHASIS_MID,
      galleryEmphasis: EMPHASIS_MID,
      proseDensity: EMPHASIS_MID,
      placeCallouts: "high",
      mapEmphasis: EMPHASIS_MID,
      theme: "light",
    },
    tags: ["magazine", "blog", "guia", "practica"],
    featuredInUi: true,
    uiOrder: 1,
  },
  {
    id: "visual-journey",
    version: 1,
    label: "Visual Journey",
    tagline: "Recorrido visual con mapa protagonista",
    description:
      "Hero fotográfico, story visual, galería, lightbox y mapa explorador. Sin bloque de guía densa.",
    layoutBase: "visual",
    themePack: "light-clean",
    capabilities: [
      "gallery",
      "map-explorer",
      "unified-story",
      "lightbox",
      "play-mode",
    ],
    criteria: {
      theme: "light",
      imageEmphasis: "high",
      proseDensity: "low",
      galleryEmphasis: "high",
      guideEmphasis: "low",
      mapEmphasis: "high",
      energy: "punchy",
      audience: "friends",
    },
    defaultDirectives: {
      imageEmphasis: "high",
      galleryEmphasis: "high",
      proseDensity: "low",
      placeCallouts: "low",
      mapEmphasis: "high",
      theme: "light",
    },
    tags: ["visual", "fotos", "mapa", "galeria", "journey"],
    featuredInUi: true,
    uiOrder: 2,
  },
  {
    id: "editorial-clean",
    version: 1,
    label: "Editorial Clean",
    tagline: "Revista tipográfica, prosa primero",
    description:
      "Fondo claro, tipografía serif y acentos teal. Énfasis en leer bien; galería más discreta.",
    layoutBase: "editorial",
    themePack: "light-clean",
    capabilities: ["journal-article", "map-compact"],
    criteria: {
      theme: "light",
      imageEmphasis: "low",
      proseDensity: "high",
      galleryEmphasis: "low",
      guideEmphasis: "low",
      mapEmphasis: "low",
      energy: "calm",
      audience: "print-like",
    },
    defaultDirectives: {
      imageEmphasis: "low",
      galleryEmphasis: "low",
      proseDensity: "high",
      placeCallouts: "low",
      mapEmphasis: "low",
      theme: "light",
    },
    tags: ["editorial", "serif", "texto", "cronica", "lectura"],
    featuredInUi: true,
    uiOrder: 3,
  },
  {
    id: "dark-photo-journey",
    version: 1,
    label: "Dark Photo Journey",
    tagline: "Oscuro cinematográfico, fotos al frente",
    description:
      "Misma base visual que Visual Journey con skin oscura y fotos destacadas.",
    layoutBase: "visual",
    themePack: "dark-cinema",
    capabilities: [
      "gallery",
      "map-explorer",
      "unified-story",
      "lightbox",
      "play-mode",
    ],
    criteria: {
      theme: "dark",
      imageEmphasis: "high",
      proseDensity: "low",
      galleryEmphasis: "high",
      guideEmphasis: "low",
      mapEmphasis: "medium",
      energy: "punchy",
      audience: "friends",
    },
    defaultDirectives: {
      imageEmphasis: "high",
      galleryEmphasis: "high",
      proseDensity: "low",
      placeCallouts: "low",
      mapEmphasis: "medium",
      theme: "dark",
    },
    tags: ["dark", "oscuro", "cinema", "fotos", "cinematico"],
    featuredInUi: true,
    uiOrder: 4,
  },
];

const BY_ID = new Map(TEMPLATE_CATALOG.map((e) => [e.id, e]));

export function getTemplateCatalogEntry(
  id: ExportTemplateId | string | null | undefined
): TemplateCatalogEntry | undefined {
  if (!id) return undefined;
  return BY_ID.get(id as ExportTemplateId);
}

export function layoutBaseForTemplate(id: ExportTemplateId): LayoutBase {
  return getTemplateCatalogEntry(id)?.layoutBase ?? "magazine";
}

/** Bridge: catalog entry → runtime ExportTemplateId (phase 1: id identity). */
export function resolveRuntimeTemplate(
  entry: TemplateCatalogEntry
): ExportTemplateId {
  return entry.id;
}

export function featuredTemplateCatalog(): TemplateCatalogEntry[] {
  return TEMPLATE_CATALOG.filter((e) => e.featuredInUi).sort(
    (a, b) => a.uiOrder - b.uiOrder
  );
}
