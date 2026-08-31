import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { travelToTimelineInput } from "@/lib/timeline-data";
import { suggestTravelType } from "@/lib/export/detect-travel-type";
import { TYPOLOGY_LIST } from "@/lib/export/typologies/registry";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const travel = await prisma.travel.findUnique({
    where: { id },
    include: {
      photos: { include: { user: true } },
      places: {
        include: {
          user: true,
          notes: { where: { type: "PLACE" }, orderBy: { createdAt: "asc" } },
        },
      },
      notes: { include: { user: true } },
      gpsTracks: { include: { user: true } },
    },
  });

  if (!travel) {
    return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
  }

  const suggestion = suggestTravelType(travelToTimelineInput(travel));

  return NextResponse.json({
    travelType: travel.travelType,
    suggestion,
    typologies: TYPOLOGY_LIST.map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description,
    })),
  });
}
