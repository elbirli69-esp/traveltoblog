import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { preparePhotoForStorage } from "@/lib/photo-upload";
import { prisma } from "@/lib/prisma";

interface PhotoMeta {
  localId: string;
  exifDateTime: string | null;
  latitude: number | null;
  longitude: number | null;
  selected: boolean;
  isTransportStart: boolean;
  isTransportEnd: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const travelId = formData.get("travelId") as string;
    const userId = formData.get("userId") as string;
    const metadataRaw = formData.get("metadata") as string;

    if (!travelId || !userId || !metadataRaw) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const metadata: PhotoMeta[] = JSON.parse(metadataRaw);
    if (!metadata.length) {
      return NextResponse.json({ error: "No hay fotos para subir" }, { status: 400 });
    }

    const created = [];

    for (const meta of metadata) {
      const file = formData.get(`file_${meta.localId}`) as File | null;
      if (!file) continue;

      const ext = path.extname(file.name) || ".jpg";
      const originalBuffer = Buffer.from(await file.arrayBuffer());
      const prepared = await preparePhotoForStorage(
        travelId,
        meta.localId,
        originalBuffer,
        ext,
        {
          dateTime: meta.exifDateTime ? new Date(meta.exifDateTime) : null,
          latitude: meta.latitude,
          longitude: meta.longitude,
        }
      );

      const photo = await prisma.photo.create({
        data: {
          travelId,
          userId,
          filename: prepared.filename,
          url: `/uploads/${travelId}/${prepared.filename}`,
          exifDateTime: prepared.exif.dateTime,
          latitude: prepared.exif.latitude,
          longitude: prepared.exif.longitude,
          selected: meta.selected,
          isTransportStart: meta.isTransportStart,
          isTransportEnd: meta.isTransportEnd,
          localId: meta.localId,
        },
      });

      if (meta.isTransportStart) {
        await prisma.travel.update({
          where: { id: travelId },
          data: {
            startPhotoId: photo.id,
            startDate: prepared.exif.dateTime ?? undefined,
          },
        });
      }

      if (meta.isTransportEnd) {
        await prisma.travel.update({
          where: { id: travelId },
          data: {
            endPhotoId: photo.id,
            endDate: prepared.exif.dateTime ?? undefined,
          },
        });
      }

      created.push(photo);
    }

    if (!created.length) {
      return NextResponse.json({ error: "No se recibieron archivos de imagen" }, { status: 400 });
    }

    await prisma.travel.update({
      where: { id: travelId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ photos: created });
  } catch (error) {
    console.error("POST /api/photos", error);
    return NextResponse.json({ error: "Error al subir fotos" }, { status: 500 });
  }
}
