import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const travel = await prisma.travel.findUnique({
    where: { id },
    include: {
      users: true,
      photos: {
        include: { user: true, notes: true },
        orderBy: { exifDateTime: "asc" },
      },
      notes: {
        include: { user: true, photo: true },
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
