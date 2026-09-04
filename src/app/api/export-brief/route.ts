import { NextRequest, NextResponse } from "next/server";
import { interpretExportBrief } from "@/lib/export-brief";
import {
  summarizeHtmlDirectives,
  summarizeReelDirectives,
  type ReelDurationPreset,
} from "@/lib/export-directives";
import { parseReelDuration } from "@/lib/export-reel";

/**
 * Ground free-text export brief → typed directives (preview / UI chips).
 * Does not generate HTML/CSS/MP4.
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
    };

    const brief = typeof body.brief === "string" ? body.brief : "";
    if (!brief.trim()) {
      return NextResponse.json({
        directives: null,
        fromAi: false,
        summary: null,
        message: "Brief vacío: se usará el estilo por defecto.",
      });
    }

    const target = body.target ?? "all";
    const durationSeconds = parseReelDuration(body.durationSeconds);
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

    return NextResponse.json({
      directives: result.directives,
      fromAi: result.fromAi,
      warning: result.warning ?? null,
      summary,
      interpretation: result.directives.interpretation ?? null,
    });
  } catch (error) {
    console.error("POST /api/export-brief", error);
    return NextResponse.json(
      { error: "Error al interpretar el brief" },
      { status: 500 }
    );
  }
}
