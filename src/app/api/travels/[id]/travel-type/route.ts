import { NextRequest, NextResponse } from "next/server";
import { TravelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const VALID_TYPES = new Set<string>(Object.values(TravelType));

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const travel = await prisma.travel.findUnique({
    where: { id },
    select: { travelType: true },
  });
  if (!travel) {
    return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ travelType: travel.travelType });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { travelType } = body as { travelType?: TravelType | null };

    if (travelType != null && !VALID_TYPES.has(travelType)) {
      return NextResponse.json({ error: "Tipología no válida" }, { status: 400 });
    }

    const travel = await prisma.travel.update({
      where: { id },
      data: { travelType: travelType ?? null },
    });

    return NextResponse.json({ travel: { id: travel.id, travelType: travel.travelType } });
  } catch (error) {
    console.error("PATCH /api/travels/[id]/travel-type", error);
    return NextResponse.json({ error: "Error al actualizar tipología" }, { status: 500 });
  }
}
