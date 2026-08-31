import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tracks = await prisma.gpsTrack.findMany({
    where: { travelId: id },
    include: { user: true },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json({
    tracks: tracks.map((t) => ({
      id: t.id,
      startedAt: t.startedAt.toISOString(),
      endedAt: t.endedAt?.toISOString() ?? null,
      pointCount: (JSON.parse(t.points || "[]") as unknown[]).length,
      includeInExport: t.includeInExport,
      alias: t.user.alias,
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: travelId } = await params;
    const body = await request.json();
    const { userId, points, startedAt, endedAt, includeInExport } = body as {
      userId?: string;
      points?: { lat: number; lng: number; at: string }[];
      startedAt?: string;
      endedAt?: string | null;
      includeInExport?: boolean;
    };

    if (!userId || !startedAt) {
      return NextResponse.json({ error: "userId y startedAt son obligatorios" }, { status: 400 });
    }

    const track = await prisma.gpsTrack.create({
      data: {
        travelId,
        userId,
        startedAt: new Date(startedAt),
        endedAt: endedAt ? new Date(endedAt) : null,
        points: JSON.stringify(points ?? []),
        includeInExport: includeInExport ?? false,
      },
      include: { user: true },
    });

    await prisma.travel.update({
      where: { id: travelId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ track });
  } catch (error) {
    console.error("POST /api/travels/[id]/gps-tracks", error);
    return NextResponse.json({ error: "Error al guardar recorrido" }, { status: 500 });
  }
}
