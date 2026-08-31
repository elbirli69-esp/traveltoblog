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
        include: { user: true, photo: true },
        orderBy: { createdAt: "asc" },
      },
      places: {
        include: { user: true },
        orderBy: { createdAt: "asc" },
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
