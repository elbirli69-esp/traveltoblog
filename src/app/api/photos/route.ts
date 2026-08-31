import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { extractExifFromBuffer, mergeExifMetadata } from "@/lib/exif";
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
    const files = formData.getAll("photos") as File[];

    if (!travelId || !userId || !metadataRaw || !files.length) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const metadata: PhotoMeta[] = JSON.parse(metadataRaw);
    const uploadDir = path.join(process.cwd(), "public", "uploads", travelId);
    await mkdir(uploadDir, { recursive: true });

    const created = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = metadata[i];
      if (!file || !meta) continue;

      const ext = path.extname(file.name) || ".jpg";
      const filename = `${meta.localId}${ext}`;
      const filepath = path.join(uploadDir, filename);
      const buffer = Buffer.from(await file.arrayBuffer());
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
