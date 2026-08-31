import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { points, endedAt, includeInExport } = body as {
      points?: { lat: number; lng: number; at: string }[];
      endedAt?: string | null;
      includeInExport?: boolean;
    };

    const data: {
      points?: string;
      endedAt?: Date | null;
      includeInExport?: boolean;
    } = {};

    if (points) data.points = JSON.stringify(points);
    if (endedAt !== undefined) data.endedAt = endedAt ? new Date(endedAt) : null;
    if (includeInExport !== undefined) data.includeInExport = includeInExport;

    const track = await prisma.gpsTrack.update({
      where: { id },
      data,
      include: { user: true },
    });

    return NextResponse.json({ track });
  } catch (error) {
    console.error("PATCH /api/gps-tracks/[id]", error);
    return NextResponse.json({ error: "Error al actualizar recorrido" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.gpsTrack.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/gps-tracks/[id]", error);
    return NextResponse.json({ error: "Error al eliminar recorrido" }, { status: 500 });
  }
}
