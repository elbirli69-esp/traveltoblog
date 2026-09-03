export type PdfPageFormat = "a4-landscape" | "square";

/** Visual style for the photobook (CSS theme). */
export type PdfTemplate = "classic" | "minimal" | "dark-magazine";

export interface PdfExportOptions {
  format: PdfPageFormat;
  template?: PdfTemplate;
  /** Selected photo id for cover; falls back to highest highlight score. */
  coverPhotoId?: string | null;
}

export interface PdfPhotoAsset {
  id: string;
  url: string;
  filename: string;
  /** Standard-resolution JPEG for interior layouts (pair, featured, mosaic). */
  imagePath: string;
  /** High-resolution JPEG for cover and full-bleed pages. */
  bleedImagePath: string;
  latitude: number | null;
  longitude: number | null;
  exifDateTime: Date | null;
  alias: string;
  placeName?: string | null;
  highlightScore?: number;
  notes: string[];
  isTransportStart?: boolean;
  isTransportEnd?: boolean;
}

export interface PdfExportContext {
  travel: {
    id: string;
    title: string;
    startDate: Date | null;
    endDate: Date | null;
    journalMarkdown: string | null;
  };
  users: { alias: string }[];
  photos: PdfPhotoAsset[];
  notes: {
    type: string;
    text: string;
    user: { alias: string };
  }[];
  format: PdfPageFormat;
  template: PdfTemplate;
  coverPhotoId?: string | null;
  /** Relative path to static map PNG inside workDir (e.g. map/route.png). */
  mapImagePath?: string | null;
  /** How the PDF route line was generated. */
  mapRouteMode?: "segmented" | "directions" | "direct" | null;
  mapPointCount?: number;
  /** Day color legend for the map page. */
  mapDayLegend?: { dayKey: string | null; dayIndex: number; color: string; label: string }[];
}

export const PDF_TEMPLATES: { id: PdfTemplate; name: string; description: string }[] = [
  {
    id: "classic",
    name: "Clásico",
    description: "Tipografía serif, tonos cálidos y márgenes de fotolibro tradicional.",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Mucho espacio en blanco, sans-serif limpio y marcos finos.",
  },
  {
    id: "dark-magazine",
    name: "Revista oscura",
    description: "Fondo oscuro, contraste alto y estética editorial nocturna.",
  },
];
