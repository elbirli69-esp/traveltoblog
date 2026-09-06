import { NextRequest, NextResponse } from "next/server";
import { interpretExportBrief } from "@/lib/export-brief";
import {
  summarizeHtmlDirectives,
  summarizeReelDirectives,
  type ReelDurationPreset,
} from "@/lib/export-directives";
import { parseReelDuration } from "@/lib/export-reel";
import {
  detectExplicitStructureChange,
  matchTemplateCatalog,
} from "@/lib/export/template-match";
import type { ExportTemplateId } from "@/lib/export/template-catalog";
import { matchReelPresetCatalog } from "@/lib/export/reel-preset-match";
import {
  getReelPresetCatalogEntry,
  type ReelPresetId,
} from "@/lib/export/reel-preset-catalog";
import {
  getThemePackEntry,
  suggestThemePackFromBrief,
  type ThemePackId,
} from "@/lib/export/theme-packs";
import {
  getTypePackEntry,
  suggestTypePackFromBrief,
  type TypePackId,
} from "@/lib/export/type-packs";
import { matchPdfPresetCatalog } from "@/lib/export/pdf-preset-match";
import {
  getPdfPresetCatalogEntry,
  type PdfPresetId,
} from "@/lib/export/pdf-preset-catalog";
import { summarizePdfDirectives } from "@/lib/export-directives";


const HTML_TEMPLATES: ExportTemplateId[] = [
  "magazine",
  "visual-journey",
  "editorial-clean",
  "dark-photo-journey",
];

const REEL_PRESETS: ReelPresetId[] = [
  "balanced-story",
  "calm-story",
  "punchy-highlights",
  "textless-photos",
  "place-labels",
  "map-pulse",
];

const THEME_PACKS: ThemePackId[] = [
  "light-paper",
  "light-clean",
  "dark-cinema",
  "warm-sunset",
  "cool-coast",
];

const PDF_PRESETS: PdfPresetId[] = [
  "pdf-classic",
  "pdf-minimal",
  "pdf-photo",
  "pdf-dark",
  "pdf-guide",
];

const TYPE_PACKS: TypePackId[] = ["serif-editorial", "sans-clean", "hybrid"];

function parseUiTemplate(raw: unknown): ExportTemplateId {
  if (typeof raw === "string" && (HTML_TEMPLATES as string[]).includes(raw)) {
    return raw as ExportTemplateId;
  }
  return "magazine";
}

function parseUiReelPreset(raw: unknown): ReelPresetId {
  if (typeof raw === "string" && (REEL_PRESETS as string[]).includes(raw)) {
    return raw as ReelPresetId;
  }
  return "balanced-story";
}

function parseUiThemePack(raw: unknown): ThemePackId | null {
  if (typeof raw === "string" && (THEME_PACKS as string[]).includes(raw)) {
    return raw as ThemePackId;
  }
  return null;
}

function parseUiPdfPreset(raw: unknown): PdfPresetId {
  if (typeof raw === "string" && (PDF_PRESETS as string[]).includes(raw)) {
    return raw as PdfPresetId;
  }
  return "pdf-classic";
}

function parseUiTypePack(raw: unknown): TypePackId | null {
  if (typeof raw === "string" && (TYPE_PACKS as string[]).includes(raw)) {
    return raw as TypePackId;
  }
  return null;
}

/**
 * Ground free-text export brief → typed directives (preview / UI chips).
 * Does not generate HTML/CSS/MP4.
 * For HTML target, also returns a catalog match (structure locked unless expressly asked).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      brief?: string;
      target?: "reel" | "html" | "pdf" | "all";
      durationSeconds?: ReelDurationPreset;
      photoCount?: number;
      hasJournal?: boolean;
      travelTitle?: string;
      uiTemplate?: string;
      uiReelPreset?: string;
      uiThemePack?: string;
      uiTypePack?: string;
      uiPdfPreset?: string;
    };

    const brief = typeof body.brief === "string" ? body.brief : "";
    if (!brief.trim()) {
      return NextResponse.json({
        directives: null,
        fromAi: false,
        summary: null,
        message: "Brief vacío: se usará el estilo por defecto.",
        templateMatch: null,
        reelPresetMatch: null,
        themePackMatch: null,
        typePackMatch: null,
        pdfPresetMatch: null,
      });
    }

    const target = body.target ?? "all";
    const durationSeconds = parseReelDuration(body.durationSeconds);
    const uiTemplate = parseUiTemplate(body.uiTemplate);
    const uiReelPreset = parseUiReelPreset(body.uiReelPreset);
    const uiThemePack = parseUiThemePack(body.uiThemePack);
    const uiTypePack = parseUiTypePack(body.uiTypePack);
    const uiPdfPreset = parseUiPdfPreset(body.uiPdfPreset);
    const result = await interpretExportBrief(brief, {
      target,
      durationSeconds,
      photoCount: body.photoCount,
      hasJournal: body.hasJournal,
      travelTitle: body.travelTitle,
    });

    const summary =
      target === "html" && result.directives.html
        ? summarizeHtmlDirectives(result.directives.html)
        : target === "reel" && result.directives.reel
          ? summarizeReelDirectives(result.directives.reel)
          : target === "pdf" && result.directives.pdf
            ? summarizePdfDirectives(result.directives.pdf)
            : result.directives.html
              ? summarizeHtmlDirectives(result.directives.html)
              : result.directives.reel
                ? summarizeReelDirectives(result.directives.reel)
                : result.directives.pdf
                  ? summarizePdfDirectives(result.directives.pdf)
                  : null;

    let templateMatch = null;
    if ((target === "html" || target === "all") && result.directives.html) {
      const unlock = detectExplicitStructureChange(brief, uiTemplate);
      const match = matchTemplateCatalog({
        brief,
        directives: result.directives.html,
        uiTemplate,
        lockStructure: !unlock,
      });
      templateMatch = {
        suggestedTemplateId: match.suggestedTemplateId,
        label: match.entry.label,
        score: Math.round(match.score * 100) / 100,
        reasons: match.reasons,
        unmet: match.unmet,
        structureLocked: match.structureLocked,
        layoutBase: match.layoutBase,
        differsFromUi: match.differsFromUi,
      };
    }

    let reelPresetMatch = null;
    if ((target === "reel" || target === "all") && result.directives.reel) {
      const match = matchReelPresetCatalog({
        brief,
        directives: result.directives.reel,
        uiPreset: uiReelPreset,
      });
      reelPresetMatch = {
        suggestedPresetId: match.suggestedPresetId,
        label: match.entry.label,
        tagline: match.entry.tagline,
        score: Math.round(match.score * 100) / 100,
        reasons: match.reasons,
        unmet: match.unmet,
        differsFromUi: match.differsFromUi,
      };
      // Validate catalog entry still exists (defensive).
      if (!getReelPresetCatalogEntry(match.suggestedPresetId)) {
        reelPresetMatch = null;
      }
    }

    let themePackMatch = null;
    let typePackMatch = null;
    if (target === "html" || target === "all") {
      const suggestedTheme = suggestThemePackFromBrief(brief);
      if (suggestedTheme) {
        const entry = getThemePackEntry(suggestedTheme);
        themePackMatch = {
          suggestedThemePackId: suggestedTheme,
          label: entry?.label ?? suggestedTheme,
          tagline: entry?.tagline ?? "",
          differsFromUi: uiThemePack != null && suggestedTheme !== uiThemePack,
        };
      }
      const suggestedType = suggestTypePackFromBrief(brief);
      if (suggestedType) {
        const entry = getTypePackEntry(suggestedType);
        typePackMatch = {
          suggestedTypePackId: suggestedType,
          label: entry?.label ?? suggestedType,
          tagline: entry?.tagline ?? "",
          differsFromUi: uiTypePack != null && suggestedType !== uiTypePack,
        };
      }
    }

    
    let pdfPresetMatch = null;
    if ((target === "pdf" || target === "all") && result.directives.pdf) {
      const match = matchPdfPresetCatalog({
        brief,
        directives: result.directives.pdf,
        uiPreset: uiPdfPreset,
      });
      pdfPresetMatch = {
        suggestedPresetId: match.suggestedPresetId,
        label: match.entry.label,
        tagline: match.entry.tagline,
        score: Math.round(match.score * 100) / 100,
        reasons: match.reasons,
        unmet: match.unmet,
        differsFromUi: match.differsFromUi,
        theme: match.entry.theme,
        typePack: match.entry.typePack,
      };
      if (!getPdfPresetCatalogEntry(match.suggestedPresetId)) {
        pdfPresetMatch = null;
      }
    }

    return NextResponse.json({
      directives: result.directives,
      fromAi: result.fromAi,
      warning: result.warning ?? null,
      summary,
      interpretation: result.directives.interpretation ?? null,
      templateMatch,
      reelPresetMatch,
      themePackMatch,
      typePackMatch,
      pdfPresetMatch,
    });
  } catch (error) {
    console.error("POST /api/export-brief", error);
    return NextResponse.json(
      { error: "Error al interpretar el brief" },
      { status: 500 }
    );
  }
}
