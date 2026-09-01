import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (request.nextUrl.searchParams.get("meta") === "1") {
    const travel = await prisma.travel.findUnique({
      where: { id },
      select: { id: true, updatedAt: true },
    });
    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ updatedAt: travel.updatedAt.toISOString() });
  }

  const travel = await prisma.travel.findUnique({
    where: { id },
    include: {
      users: true,
      photos: {
        include: {
          user: true,
          notes: { include: { user: true }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { exifDateTime: "asc" },
      },
      notes: {
        include: { user: true, photo: true, place: true },
        orderBy: { createdAt: "asc" },
      },
      places: {
        include: {
          user: true,
          notes: {
            where: { type: "PLACE" },
            include: { user: true },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { visitedAt: "asc" },
      },
      startPhoto: true,
      endPhoto: true,
    },
  });

  if (!travel) {
    return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ travel });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { startDate, endDate, title } = body as {
      startDate?: string | null;
      endDate?: string | null;
      title?: string;
    };

    const data: {
      startDate?: Date | null;
      endDate?: Date | null;
      title?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (title !== undefined) data.title = title.trim();
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;

    const travel = await prisma.travel.update({
      where: { id },
      data,
    });

    return NextResponse.json({ travel });
  } catch (error) {
    console.error("PATCH /api/travels/[id]", error);
    return NextResponse.json({ error: "Error al actualizar viaje" }, { status: 500 });
  }
}
