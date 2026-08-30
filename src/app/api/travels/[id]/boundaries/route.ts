import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: travelId } = await params;

  try {
    const body = await request.json();
    const { photoLocalId, type, exifDateTime } = body as {
      photoLocalId?: string;
      type?: "start" | "end";
      exifDateTime?: string | null;
    };

    if (!photoLocalId || !type) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const photo = await prisma.photo.findFirst({
      where: { travelId, localId: photoLocalId },
    });

    if (!photo) {
      return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
    }

    await prisma.photo.update({
      where: { id: photo.id },
      data: {
        isTransportStart: type === "start",
        isTransportEnd: type === "end",
      },
    });

    const date = exifDateTime ? new Date(exifDateTime) : photo.exifDateTime;

    if (type === "start") {
      await prisma.travel.update({
        where: { id: travelId },
        data: { startPhotoId: photo.id, startDate: date ?? undefined },
      });
    } else {
      await prisma.travel.update({
        where: { id: travelId },
        data: { endPhotoId: photo.id, endDate: date ?? undefined },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH boundaries", error);
    return NextResponse.json({ error: "Error al actualizar límites" }, { status: 500 });
  }
}
