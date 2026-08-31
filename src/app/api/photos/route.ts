import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { extractExifFromBuffer, mergeExifMetadata } from "@/lib/exif";
import { normalizeImageForStorage } from "@/lib/photo-storage";
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

    const uploadDir = path.join(process.cwd(), "public", "uploads", travelId);
    await mkdir(uploadDir, { recursive: true });

    const created = [];

    for (const meta of metadata) {
      const file = formData.get(`file_${meta.localId}`) as File | null;
      if (!file) continue;

      let ext = path.extname(file.name) || ".jpg";
      let buffer: Buffer = Buffer.from(await file.arrayBuffer());
      const normalized = await normalizeImageForStorage(buffer, ext);
      buffer = Buffer.from(normalized.buffer);
      ext = normalized.ext;

      const filename = `${meta.localId}${ext}`;
      const filepath = path.join(uploadDir, filename);
      await writeFile(filepath, buffer);

      const fileExif = await extractExifFromBuffer(buffer);
      const exif = mergeExifMetadata(
        {
          dateTime: meta.exifDateTime ? new Date(meta.exifDateTime) : null,
          latitude: meta.latitude,
          longitude: meta.longitude,
        },
        fileExif
      );

      const photo = await prisma.photo.create({
        data: {
          travelId,
          userId,
          filename,
          url: `/uploads/${travelId}/${filename}`,
          exifDateTime: exif.dateTime,
          latitude: exif.latitude,
          longitude: exif.longitude,
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
            startDate: exif.dateTime ?? undefined,
          },
        });
      }

      if (meta.isTransportEnd) {
        await prisma.travel.update({
          where: { id: travelId },
          data: {
            endPhotoId: photo.id,
            endDate: exif.dateTime ?? undefined,
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
