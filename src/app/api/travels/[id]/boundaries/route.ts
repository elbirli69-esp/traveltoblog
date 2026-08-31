import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: travelId } = await params;

  try {
    const body = await request.json();
    const { photoId, photoLocalId, type, clear, exifDateTime } = body as {
      photoId?: string;
      photoLocalId?: string;
      type?: "start" | "end";
      /** When true, clears the transport flag instead of setting it */
      clear?: boolean;
      exifDateTime?: string | null;
    };

    const lookupId = photoId ?? photoLocalId;
    if (!lookupId || !type) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const photo = await prisma.photo.findFirst({
      where: {
        travelId,
        OR: [{ localId: lookupId }, { id: lookupId }],
      },
    });

    if (!photo) {
      return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
    }

    if (clear) {
      await prisma.photo.update({
        where: { id: photo.id },
        data:
          type === "start"
            ? { isTransportStart: false }
            : { isTransportEnd: false },
      });

      const travel = await prisma.travel.findUnique({
        where: { id: travelId },
        select: { startPhotoId: true, endPhotoId: true },
      });

      if (type === "start" && travel?.startPhotoId === photo.id) {
        await prisma.travel.update({
          where: { id: travelId },
          data: { startPhotoId: null, startDate: null },
        });
      }
      if (type === "end" && travel?.endPhotoId === photo.id) {
        await prisma.travel.update({
          where: { id: travelId },
          data: { endPhotoId: null, endDate: null },
        });
      }

      return NextResponse.json({ ok: true, cleared: true });
    }

    await prisma.photo.updateMany({
      where: {
        travelId,
        id: { not: photo.id },
        ...(type === "start"
          ? { isTransportStart: true }
          : { isTransportEnd: true }),
      },
      data:
        type === "start"
          ? { isTransportStart: false }
          : { isTransportEnd: false },
    });

    await prisma.photo.update({
      where: { id: photo.id },
      data:
        type === "start"
          ? { isTransportStart: true, isTransportEnd: false }
          : { isTransportEnd: true, isTransportStart: false },
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
