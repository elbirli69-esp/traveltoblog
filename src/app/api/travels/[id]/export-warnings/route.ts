import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildExportWarnings } from "@/lib/export-warnings";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const travel = await prisma.travel.findUnique({
      where: { id },
      select: {
        startDate: true,
        endDate: true,
        journalMarkdown: true,
        photos: {
          where: { selected: true },
          select: {
            latitude: true,
            longitude: true,
            exifDateTime: true,
          },
        },
        notes: {
          select: {
            type: true,
            dayDate: true,
          },
        },
      },
    });

    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    const warnings = buildExportWarnings({
      startDate: travel.startDate,
      endDate: travel.endDate,
      journalMarkdown: travel.journalMarkdown,
      photos: travel.photos,
      notes: travel.notes,
    });

    return NextResponse.json({ warnings });
  } catch (error) {
    console.error("GET /api/travels/[id]/export-warnings", error);
    return NextResponse.json({ error: "Error al analizar el viaje" }, { status: 500 });
  }
}
