/**
 * Match free-text brief + typed HTML directives → catalog entry.
 *
 * Structure lock: keep the same layoutBase as the UI template unless the brief
 * expressly asks to change structure / names another template.
 * Theme and emphasis knobs may still change within that layout.
 */

import type { ExportHtmlDirectives, Emphasis } from "@/lib/export-directives";
import {
  TEMPLATE_CATALOG,
  getTemplateCatalogEntry,
  layoutBaseForTemplate,
  type ExportTemplateId,
  type LayoutBase,
  type TemplateCatalogEntry,
} from "@/lib/export/template-catalog";

export interface TemplateMatchInput {
  brief?: string;
  directives: ExportHtmlDirectives;
  /** Current UI selection — structure stays on its layoutBase unless unlocked. */
  uiTemplate: ExportTemplateId;
  /**
   * When true (default), only score entries with the same layoutBase as uiTemplate.
   * Pass false only after detectExplicitStructureChange(brief) === true.
   */
  lockStructure?: boolean;
}

export interface TemplateMatchResult {
  entry: TemplateCatalogEntry;
  suggestedTemplateId: ExportTemplateId;
  score: number;
  reasons: string[];
  unmet: string[];
  structureLocked: boolean;
  layoutBase: LayoutBase;
  /** True when suggested id differs from uiTemplate (same or unlocked base). */
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

const NAMED_TEMPLATE_CUES: Array<{ id: ExportTemplateId; re: RegExp }> = [
  {
    id: "magazine",
    re: /\b(plantilla\s+)?magazine\b|\bestilo\s+magazine\b|\bcomo\s+magazine\b/,
  },
  {
    id: "visual-journey",
    re: /\bvisual\s*journey\b|\bplantilla\s+visual\b|\bestilo\s+visual\b|\bcomo\s+visual\b/,
  },
  {
    id: "editorial-clean",
    re: /\beditorial\s*clean\b|\bplantilla\s+editorial\b|\bestilo\s+editorial\b|\bcomo\s+editorial\b/,
  },
  {
    id: "dark-photo-journey",
    re: /\bdark\s*photo\b|\bplantilla\s+oscura\b|\bphoto\s+journey\b|\bcinematografic\w*\b/,
  },
];

/** Template id explicitly named in the brief, if any. */
export function namedTemplateInBrief(
  brief: string,
  uiTemplate?: ExportTemplateId
): ExportTemplateId | null {
  const text = normalizeBrief(brief);
  for (const n of NAMED_TEMPLATE_CUES) {
    if (uiTemplate && n.id === uiTemplate) continue;
    if (n.re.test(text)) return n.id;
  }
  for (const n of NAMED_TEMPLATE_CUES) {
    if (n.re.test(text)) return n.id;
  }
  return null;
}

/**
 * Detect an explicit ask to change HTML structure / pick another template.
 * Theme-only asks ("modo oscuro") do NOT unlock structure.
 */
export function detectExplicitStructureChange(
  brief: string,
  uiTemplate: ExportTemplateId
): boolean {
  const text = normalizeBrief(brief);
  if (!text.trim()) return false;

  if (
    /\b(cambia(r)?\s+(la\s+)?estructura|otra\s+estructura|cambia(r)?\s+(la\s+|de\s+)?plantilla|otra\s+plantilla|cambia(r)?\s+el\s+layout|change\s+(the\s+)?(structure|template|layout)|different\s+(structure|template|layout)|switch\s+template)\b/.test(
      text
    )
  ) {
    return true;
  }

  const named = namedTemplateInBrief(brief, uiTemplate);
  if (named && named !== uiTemplate) return true;

  if (
    /\b(sin\s+guia|quita(r)?\s+la\s+guia|sin\s+galeria|quita(r)?\s+la\s+galeria|solo\s+texto|solo\s+cronica|sin\s+mapa\s+explorer|mapa\s+full[- ]?bleed|estructura\s+de\s+revista)\b/.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

function emphasisDistance(a: Emphasis, b: Emphasis): number {
  return Math.abs(EMPHASIS_RANK[a] - EMPHASIS_RANK[b]) / 2;
}

function scoreEntry(
  entry: TemplateCatalogEntry,
  directives: ExportHtmlDirectives,
  briefNorm: string
): { score: number; reasons: string[]; unmet: string[] } {
  const c = entry.criteria;
  const reasons: string[] = [];
  const unmet: string[] = [];
  let score = 0;

  const wantTheme = directives.theme;
  if (wantTheme) {
    if (c.theme === wantTheme || c.theme === "either") {
      score += 0.25;
      reasons.push(wantTheme === "dark" ? "modo oscuro" : "modo claro");
    } else {
      unmet.push(
        wantTheme === "dark"
          ? "pedías modo oscuro; esta entrada es clara (el tema se aplica por directrices)"
          : "pedías modo claro; esta entrada es oscura"
      );
    }
  } else if (c.theme === "either" || c.theme === "light") {
    score += 0.1;
  }

  const imgDist = emphasisDistance(directives.imageEmphasis, c.imageEmphasis);
  score += 0.2 * (1 - imgDist);
  if (directives.imageEmphasis === "high" && c.imageEmphasis === "high") {
    reasons.push("fotos protagonistas");
  } else if (
    directives.imageEmphasis === "high" &&
    c.imageEmphasis !== "high"
  ) {
    unmet.push("pedías fotos muy grandes; esta plantilla las atenúa");
  }

  const proseDist = emphasisDistance(directives.proseDensity, c.proseDensity);
  score += 0.15 * (1 - proseDist);
  if (directives.proseDensity === "low" && c.proseDensity === "low") {
    reasons.push("poca prosa");
  } else if (directives.proseDensity === "high" && c.proseDensity === "high") {
    reasons.push("más crónica");
  } else if (directives.proseDensity === "low" && c.proseDensity === "high") {
    unmet.push("pedías poca prosa; esta plantilla es texto-first");
  }

  const galDist = emphasisDistance(
    directives.galleryEmphasis,
    c.galleryEmphasis
  );
  score += 0.1 * (1 - galDist);
  if (directives.galleryEmphasis === "high" && c.galleryEmphasis === "high") {
    reasons.push("galería visible");
  }

  const guideWant = directives.placeCallouts;
  const guideDist = emphasisDistance(guideWant, c.guideEmphasis);
  score += 0.1 * (1 - guideDist);
  if (guideWant === "high" && !entry.capabilities.includes("guide")) {
    unmet.push("pedías guía destacada; esta plantilla no tiene bloque de guía");
  } else if (guideWant === "high" && c.guideEmphasis === "high") {
    reasons.push("guía práctica");
  }

  const mapDist = emphasisDistance(directives.mapEmphasis, c.mapEmphasis);
  score += 0.1 * (1 - mapDist);
  if (directives.mapEmphasis === "high" && c.mapEmphasis === "high") {
    reasons.push("mapa destacado");
  }

  if (briefNorm) {
    const hits = entry.tags.filter((t) => briefNorm.includes(t.toLowerCase()));
    if (hits.length > 0) {
      score += Math.min(0.1, 0.04 * hits.length);
      reasons.push(`encaja con: ${hits.slice(0, 2).join(", ")}`);
    }
  }

  score += (5 - entry.uiOrder) * 0.002;

  return {
    score: Math.max(0, Math.min(1, score)),
    reasons: unique(reasons),
    unmet: unique(unmet),
  };
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}

function candidatesFor(
  uiTemplate: ExportTemplateId,
  structureLocked: boolean
): TemplateCatalogEntry[] {
  if (!structureLocked) return [...TEMPLATE_CATALOG];
  const base = layoutBaseForTemplate(uiTemplate);
  return TEMPLATE_CATALOG.filter((e) => e.layoutBase === base);
}

/**
 * Pick the best catalog entry for the brief + directives.
 * Does not mutate the UI selection; callers decide whether to apply.
 */
export function matchTemplateCatalog(
  input: TemplateMatchInput
): TemplateMatchResult {
  const uiTemplate = input.uiTemplate;
  const structureLocked =
    input.lockStructure !== false &&
    !detectExplicitStructureChange(input.brief ?? "", uiTemplate);

  const briefNorm = normalizeBrief(input.brief ?? "");
  const pool = candidatesFor(uiTemplate, structureLocked);
  const namedId = namedTemplateInBrief(input.brief ?? "");

  if (namedId) {
    const namedEntry = getTemplateCatalogEntry(namedId);
    if (namedEntry && pool.some((e) => e.id === namedId)) {
      const meta = scoreEntry(namedEntry, input.directives, briefNorm);
      return {
        entry: namedEntry,
        suggestedTemplateId: namedEntry.id,
        score: Math.max(meta.score, 0.85),
        reasons: unique([
          `pediste ${namedEntry.label}`,
          ...meta.reasons,
          ...(structureLocked
            ? ["misma estructura que la plantilla elegida"]
            : []),
        ]),
        unmet: meta.unmet,
        structureLocked,
        layoutBase: namedEntry.layoutBase,
        differsFromUi: namedEntry.id !== uiTemplate,
      };
    }
  }

  let best: TemplateCatalogEntry | undefined;
  let bestScore = -1;
  let bestMeta = { reasons: [] as string[], unmet: [] as string[] };

  for (const entry of pool) {
    const meta = scoreEntry(entry, input.directives, briefNorm);
    if (
      meta.score > bestScore ||
      (meta.score === bestScore &&
        (best == null || entry.uiOrder < best.uiOrder))
    ) {
      best = entry;
      bestScore = meta.score;
      bestMeta = meta;
    }
  }

  const entry =
    best ?? getTemplateCatalogEntry(uiTemplate) ?? TEMPLATE_CATALOG[0]!;

  const reasons = [...bestMeta.reasons];
  const unmet = [...bestMeta.unmet];

  if (structureLocked) {
    reasons.unshift("misma estructura que la plantilla elegida");
    const otherBases = TEMPLATE_CATALOG.filter(
      (e) => e.layoutBase !== entry.layoutBase
    );
    if (
      input.directives.theme === "dark" &&
      entry.criteria.theme !== "dark" &&
      otherBases.some((e) => e.criteria.theme === "dark")
    ) {
      unmet.push(
        "hay un look oscuro nativo en otra estructura; no se cambia salvo que lo pidas expresamente"
      );
    }
  }

  return {
    entry,
    suggestedTemplateId: entry.id,
    score: bestScore < 0 ? 0 : bestScore,
    reasons: unique(reasons),
    unmet: unique(unmet),
    structureLocked,
    layoutBase: entry.layoutBase,
    differsFromUi: entry.id !== uiTemplate,
  };
}

/** Convenience: score one criteria vector against catalog (tests). */
export function scoreTemplateCriteria(
  entry: TemplateCatalogEntry,
  directives: ExportHtmlDirectives,
  brief = ""
): number {
  return scoreEntry(entry, directives, normalizeBrief(brief)).score;
}
