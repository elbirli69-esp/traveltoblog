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
      });
    }

    const target = body.target ?? "all";
    const durationSeconds = parseReelDuration(body.durationSeconds);
    const uiTemplate = parseUiTemplate(body.uiTemplate);
    const uiReelPreset = parseUiReelPreset(body.uiReelPreset);
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
          : result.directives.html
            ? summarizeHtmlDirectives(result.directives.html)
            : result.directives.reel
              ? summarizeReelDirectives(result.directives.reel)
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

    return NextResponse.json({
      directives: result.directives,
      fromAi: result.fromAi,
      warning: result.warning ?? null,
      summary,
      interpretation: result.directives.interpretation ?? null,
      templateMatch,
      reelPresetMatch,
    });
  } catch (error) {
    console.error("POST /api/export-brief", error);
    return NextResponse.json(
      { error: "Error al interpretar el brief" },
      { status: 500 }
    );
  }
}
