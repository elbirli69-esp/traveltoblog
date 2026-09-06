import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type TravelExportPrefs = {
  exportBrief: string | null;
  exportBriefCache: string | null;
  htmlTemplateId: string | null;
  htmlThemePackId: string | null;
  htmlTypePackId: string | null;
  reelPresetId: string | null;
  pdfPresetId: string | null;
};

const SELECT = {
  exportBrief: true,
  exportBriefCache: true,
  htmlTemplateId: true,
  htmlThemePackId: true,
  htmlTypePackId: true,
  reelPresetId: true,
  pdfPresetId: true,
} as const;

function asOptionalString(raw: unknown, max = 8000): string | null | undefined {
  if (raw === null) return null;
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function asOptionalId(raw: unknown, max = 64): string | null | undefined {
  if (raw === null) return null;
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * GET/PATCH persisted export brief + look choices for a travel.
 * Nullable fields: old travels without prefs stay valid.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const travel = await prisma.travel.findUnique({
      where: { id },
      select: SELECT,
    });
    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ prefs: travel });
  } catch (error) {
    console.error("GET /api/travels/[id]/export-prefs", error);
    return NextResponse.json(
      { error: "Error al cargar preferencias de export" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const data: Partial<TravelExportPrefs> = {};
    const brief = asOptionalString(body.exportBrief, 8000);
    if (brief !== undefined) data.exportBrief = brief;
    const cache = asOptionalString(body.exportBriefCache, 20000);
    if (cache !== undefined) data.exportBriefCache = cache;
    const htmlTemplateId = asOptionalId(body.htmlTemplateId);
    if (htmlTemplateId !== undefined) data.htmlTemplateId = htmlTemplateId;
    const htmlThemePackId = asOptionalId(body.htmlThemePackId);
    if (htmlThemePackId !== undefined) data.htmlThemePackId = htmlThemePackId;
    const htmlTypePackId = asOptionalId(body.htmlTypePackId);
    if (htmlTypePackId !== undefined) data.htmlTypePackId = htmlTypePackId;
    const reelPresetId = asOptionalId(body.reelPresetId);
    if (reelPresetId !== undefined) data.reelPresetId = reelPresetId;
    const pdfPresetId = asOptionalId(body.pdfPresetId);
    if (pdfPresetId !== undefined) data.pdfPresetId = pdfPresetId;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Nada que actualizar" },
        { status: 400 }
      );
    }

    const travel = await prisma.travel.update({
      where: { id },
      data,
      select: SELECT,
    });

    return NextResponse.json({ prefs: travel });
  } catch (error) {
    console.error("PATCH /api/travels/[id]/export-prefs", error);
    return NextResponse.json(
      { error: "Error al guardar preferencias de export" },
      { status: 500 }
    );
  }
}
