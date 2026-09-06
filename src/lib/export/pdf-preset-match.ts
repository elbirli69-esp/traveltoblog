/**
 * Match free-text brief + typed PDF directives → look preset.
 * UI preset wins unless the user clicks "Aplicar sugerencia".
 */

import type { ExportPdfDirectives, Emphasis } from "@/lib/export-directives";
import {
  PDF_PRESET_CATALOG,
  getPdfPresetCatalogEntry,
  type PdfPresetCatalogEntry,
  type PdfPresetId,
} from "@/lib/export/pdf-preset-catalog";

export interface PdfPresetMatchInput {
  brief?: string;
  directives: ExportPdfDirectives;
  uiPreset?: PdfPresetId | null;
}

export interface PdfPresetMatchResult {
  entry: PdfPresetCatalogEntry;
  suggestedPresetId: PdfPresetId;
  score: number;
  reasons: string[];
  unmet: string[];
  differsFromUi: boolean;
}

const EMPHASIS_RANK: Record<Emphasis, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function normalizeBrief(brief: string): string {
  return brief
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

const NAMED_PRESET_CUES: Array<{ id: PdfPresetId; re: RegExp }> = [
  {
    id: "pdf-minimal",
    re: /\b(pdf\s+)?minimal\b|\bpreset\s+minimal\b|\bmucha\s+prosa\b|\bpoca\s+tinta\b/,
  },
  {
    id: "pdf-photo",
    re: /\b(pdf\s+)?foto(\s+primero)?\b|\bfull[\s-]?bleed\b|\bmosaicos?\b|\bpreset\s+foto\b|\bsolo\s+fotos?\b/,
  },
  {
    id: "pdf-dark",
    re: /\b(pdf\s+)?dark\b|\brevista\s+oscura\b|\bmodo\s+oscuro\b|\btema\s+oscuro\b|\bpreset\s+oscuro\b/,
  },
  {
    id: "pdf-guide",
    re: /\b(pdf\s+)?guia\b|\bguide\b|\bpreset\s+guia\b|\bguia\s+practica\b|\bcallouts?\b/,
  },
  {
    id: "pdf-classic",
    re: /\b(pdf\s+)?clasico\b|\bclassic\b|\bpreset\s+clasico\b|\bfotolibro\s+clasico\b/,
  },
];

export function namedPdfPresetInBrief(brief: string): PdfPresetId | null {
  const text = normalizeBrief(brief);
  const hits = NAMED_PRESET_CUES.filter((n) => n.re.test(text)).map((n) => n.id);
  if (hits.length === 0) return null;
  // Dark + photo often co-occur; prefer dark when "oscuro/revista" leads.
  if (
    hits.includes("pdf-dark") &&
    /\b(oscuro|dark|revista|nocturn)\b/.test(text)
  ) {
    return "pdf-dark";
  }
  if (hits.includes("pdf-photo") && hits.includes("pdf-guide")) {
    return "pdf-photo";
  }
  return hits[0] ?? null;
}

function emphasisClose(a: Emphasis, b: Emphasis, weight: number): number {
  const dist = Math.abs(EMPHASIS_RANK[a] - EMPHASIS_RANK[b]) / 2;
  return weight * (1 - dist);
}

function lexicalBoost(text: string, entry: PdfPresetCatalogEntry): number {
  let score = 0;
  for (const tag of entry.tags) {
    const re = new RegExp(`\\b${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (re.test(text)) score += 0.08;
  }
  return Math.min(0.35, score);
}

function scoreEntry(
  entry: PdfPresetCatalogEntry,
  directives: ExportPdfDirectives,
  briefText: string
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const img = emphasisClose(
    directives.imageEmphasis,
    entry.criteria.imageEmphasis,
    0.22
  );
  score += img;
  if (img > 0.15 && directives.imageEmphasis === entry.criteria.imageEmphasis) {
    reasons.push(
      directives.imageEmphasis === "high"
        ? "fotos protagonistas"
        : directives.imageEmphasis === "low"
          ? "fotos discretas"
          : "fotos equilibradas"
    );
  }

  const prose = emphasisClose(
    directives.proseDensity,
    entry.criteria.proseDensity,
    0.22
  );
  score += prose;
  if (prose > 0.15 && directives.proseDensity === entry.criteria.proseDensity) {
    reasons.push(
      directives.proseDensity === "high"
        ? "más crónica"
        : directives.proseDensity === "low"
          ? "poca prosa"
          : "prosa media"
    );
  }

  const bleed = emphasisClose(
    directives.preferFullBleed,
    entry.criteria.preferFullBleed,
    0.2
  );
  score += bleed;
  if (
    bleed > 0.15 &&
    directives.preferFullBleed === entry.criteria.preferFullBleed
  ) {
    reasons.push(
      directives.preferFullBleed === "high"
        ? "full-bleed alto"
        : directives.preferFullBleed === "low"
          ? "pocos full-bleed"
          : "full-bleed medio"
    );
  }

  const mosaic = emphasisClose(
    directives.mosaicBias,
    entry.criteria.mosaicBias,
    0.18
  );
  score += mosaic;
  if (mosaic > 0.12 && directives.mosaicBias === entry.criteria.mosaicBias) {
    reasons.push(
      directives.mosaicBias === "high"
        ? "más mosaicos"
        : directives.mosaicBias === "low"
          ? "pocos mosaicos"
          : "mosaicos normales"
    );
  }

  const lex = lexicalBoost(briefText, entry);
  score += lex;
  if (lex >= 0.16) reasons.push(`cues «${entry.label}»`);

  return { score: Math.min(1, score), reasons };
}

function unmetForEntry(
  entry: PdfPresetCatalogEntry,
  directives: ExportPdfDirectives,
  briefText: string
): string[] {
  const unmet: string[] = [];
  if (
    /\b(css\s+libre|fuente\s+libre|google\s+fonts|webfont)\b/.test(briefText)
  ) {
    unmet.push("no hay CSS/fuentes libres: solo packs tipados");
  }
  if (
    directives.proseDensity === "high" &&
    entry.criteria.proseDensity === "low"
  ) {
    unmet.push("este look reduce la prosa");
  }
  if (
    directives.imageEmphasis === "high" &&
    entry.criteria.imageEmphasis === "low"
  ) {
    unmet.push("este look no prioriza fotos grandes");
  }
  return unmet;
}

export function matchPdfPresetCatalog(
  input: PdfPresetMatchInput
): PdfPresetMatchResult {
  const briefText = normalizeBrief(input.brief ?? "");
  const named = input.brief ? namedPdfPresetInBrief(input.brief) : null;
  if (named) {
    const entry = getPdfPresetCatalogEntry(named)!;
    return {
      entry,
      suggestedPresetId: named,
      score: 0.98,
      reasons: [`preset nombrado «${entry.label}»`],
      unmet: unmetForEntry(entry, input.directives, briefText),
      differsFromUi: input.uiPreset != null && input.uiPreset !== named,
    };
  }

  let best: PdfPresetMatchResult | null = null;
  for (const entry of PDF_PRESET_CATALOG) {
    const { score, reasons } = scoreEntry(entry, input.directives, briefText);
    const candidate: PdfPresetMatchResult = {
      entry,
      suggestedPresetId: entry.id,
      score,
      reasons: reasons.slice(0, 4),
      unmet: unmetForEntry(entry, input.directives, briefText),
      differsFromUi: input.uiPreset != null && input.uiPreset !== entry.id,
    };
    if (!best || candidate.score > best.score) best = candidate;
  }

  // Soft preference for current UI when scores are close
  if (
    input.uiPreset &&
    best &&
    best.suggestedPresetId !== input.uiPreset
  ) {
    const uiEntry = getPdfPresetCatalogEntry(input.uiPreset);
    if (uiEntry) {
      const uiScored = scoreEntry(uiEntry, input.directives, briefText);
      if (uiScored.score >= best.score - 0.06) {
        return {
          entry: uiEntry,
          suggestedPresetId: uiEntry.id,
          score: uiScored.score,
          reasons: [...uiScored.reasons.slice(0, 3), "ya elegido en UI"],
          unmet: unmetForEntry(uiEntry, input.directives, briefText),
          differsFromUi: false,
        };
      }
    }
  }

  return best!;
}
