/**
 * Blog editorial B4 — audience shortcuts for export.
 * Blog largo / Álbum / Reel fill brief + switch tab/presets without technical knobs.
 */

import type { ExportTemplateId } from "@/lib/export/template-catalog";
import type { ThemePackId } from "@/lib/export/theme-packs";
import type { TypePackId } from "@/lib/export/type-packs";
import type { PdfPresetId } from "@/lib/export/pdf-preset-catalog";
import type { ReelPresetId } from "@/lib/export/reel-preset-catalog";

export type ExportAudienceId = "blog-largo" | "album" | "reel";

export type ExportAudienceTab = "html" | "pdf" | "video";

export type ExportAudiencePlan = {
  id: ExportAudienceId;
  label: string;
  description: string;
  tab: ExportAudienceTab;
  /** Spanish seed written into exportBrief. */
  briefSeed: string;
  html?: {
    templateId: ExportTemplateId;
    themePackId?: ThemePackId;
    typePackId?: TypePackId;
    includeReaderGuide?: boolean;
  };
  pdf?: {
    presetId: PdfPresetId;
  };
  reel?: {
    presetId: ReelPresetId;
    durationSeconds?: 15 | 30 | 60;
  };
};

export const EXPORT_AUDIENCE_OPTIONS: ExportAudiencePlan[] = [
  {
    id: "blog-largo",
    label: "Blog largo",
    description: "Crónica + guía + mapa para compartir como artículo",
    tab: "html",
    briefSeed:
      "Audiencia: blog largo para compartir. Quiero crónica legible, guía práctica, mapa y galería. Tono revista de viajes, sin relleno turístico vacío.",
    html: {
      templateId: "magazine",
      includeReaderGuide: true,
    },
  },
  {
    id: "album",
    label: "Álbum",
    description: "Fotos grandes para imprenta o álbum físico",
    tab: "pdf",
    briefSeed:
      "Audiencia: álbum fotográfico para imprenta. Prioriza fotos grandes, poco texto y portada fuerte.",
    pdf: {
      presetId: "pdf-photo",
    },
  },
  {
    id: "reel",
    label: "Reel",
    description: "Vídeo vertical corto para Instagram",
    tab: "video",
    briefSeed:
      "Audiencia: Reel vertical para Instagram. Ritmo ágil, highlights, captions cortas, unos 30 segundos.",
    reel: {
      presetId: "punchy-highlights",
      durationSeconds: 30,
    },
  },
];

const BY_ID = new Map(EXPORT_AUDIENCE_OPTIONS.map((o) => [o.id, o]));

export function getExportAudiencePlan(
  id: ExportAudienceId | string | null | undefined
): ExportAudiencePlan | null {
  if (!id) return null;
  return BY_ID.get(id as ExportAudienceId) ?? null;
}

/** Merge audience seed into existing brief without duplicating. */
export function applyAudienceBrief(
  current: string | null | undefined,
  seed: string
): string {
  const cur = (current ?? "").trim();
  const s = seed.trim();
  if (!s) return cur;
  if (!cur) return s;
  // Already applied (same seed or same audience line)
  if (cur.includes(s) || cur.includes(s.slice(0, Math.min(48, s.length)))) {
    return cur;
  }
  return `${s}\n\n${cur}`.slice(0, 8000);
}

export function audienceIdFromBrief(
  brief: string | null | undefined
): ExportAudienceId | null {
  const text = brief ?? "";
  for (const opt of EXPORT_AUDIENCE_OPTIONS) {
    if (text.includes(`Audiencia: ${opt.label.toLowerCase()}`) || text.includes(opt.briefSeed.slice(0, 32))) {
      return opt.id;
    }
  }
  // Loose match on labels in brief
  if (/audiencia:\s*blog/i.test(text)) return "blog-largo";
  if (/audiencia:\s*álbum|audiencia:\s*album/i.test(text)) return "album";
  if (/audiencia:\s*reel/i.test(text)) return "reel";
  return null;
}
