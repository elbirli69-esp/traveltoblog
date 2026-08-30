import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const travelId = formData.get("travelId") as string;
    const userId = formData.get("userId") as string;
    const pendingPhotosRaw = formData.get("pendingPhotos") as string;

    if (!travelId || !userId || !pendingPhotosRaw) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const pendingPhotos = JSON.parse(pendingPhotosRaw) as Array<{
      localId: string;
      exifDateTime: string | null;
      latitude: number | null;
      longitude: number | null;
      selected: boolean;
      isTransportStart: boolean;
      isTransportEnd: boolean;
      filename: string;
    }>;

    const uploadDir = path.join(process.cwd(), "public", "uploads", travelId);
    await mkdir(uploadDir, { recursive: true });

    const synced = [];

    for (const meta of pendingPhotos) {
      const file = formData.get(`file_${meta.localId}`) as File | null;
      if (!file) continue;

      const ext = path.extname(meta.filename) || ".jpg";
      const filename = `${meta.localId}${ext}`;
      const filepath = path.join(uploadDir, filename);
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filepath, buffer);

      const photo = await prisma.photo.create({
        data: {
          travelId,
          userId,
          filename,
          url: `/uploads/${travelId}/${filename}`,
          exifDateTime: meta.exifDateTime ? new Date(meta.exifDateTime) : null,
          latitude: meta.latitude,
          longitude: meta.longitude,
          selected: meta.selected,
          isTransportStart: meta.isTransportStart,
          isTransportEnd: meta.isTransportEnd,
          localId: meta.localId,
        },
      });

      synced.push(photo);
    }

    return NextResponse.json({ synced });
  } catch (error) {
    console.error("POST /api/sync", error);
    return NextResponse.json({ error: "Error en sincronización" }, { status: 500 });
  }
}
