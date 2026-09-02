import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { preparePhotoForStorage } from "@/lib/photo-upload";
import { resolvePhotoPlaceId } from "@/lib/photo-place";
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
      placeId?: string | null;
      selected: boolean;
      isTransportStart: boolean;
      isTransportEnd: boolean;
      filename: string;
    }>;

    const synced = [];

    for (const meta of pendingPhotos) {
      const existing = await prisma.photo.findUnique({
        where: { localId: meta.localId },
      });
      if (existing) {
        synced.push(existing);
        continue;
      }

      const file = formData.get(`file_${meta.localId}`) as File | null;
      if (!file) continue;

      const ext = path.extname(meta.filename) || ".jpg";
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

      const placeId = await resolvePhotoPlaceId(travelId, meta.placeId ?? null);

      const photo = await prisma.photo.create({
        data: {
          travelId,
          userId,
          filename: prepared.filename,
          url: `/uploads/${travelId}/${prepared.filename}`,
          exifDateTime: prepared.exif.dateTime,
          latitude: prepared.exif.latitude,
          longitude: prepared.exif.longitude,
          placeId: placeId ?? null,
          selected: meta.selected,
          isTransportStart: meta.isTransportStart,
          isTransportEnd: meta.isTransportEnd,
          localId: meta.localId,
        },
      });

      synced.push(photo);

      if (meta.isTransportStart) {
        await prisma.photo.updateMany({
          where: { travelId, id: { not: photo.id }, isTransportStart: true },
          data: { isTransportStart: false },
        });
        await prisma.travel.update({
          where: { id: travelId },
          data: {
            startPhotoId: photo.id,
            startDate: prepared.exif.dateTime ?? undefined,
          },
        });
      }

      if (meta.isTransportEnd) {
        await prisma.photo.updateMany({
          where: { travelId, id: { not: photo.id }, isTransportEnd: true },
          data: { isTransportEnd: false },
        });
        await prisma.travel.update({
          where: { id: travelId },
          data: {
            endPhotoId: photo.id,
            endDate: prepared.exif.dateTime ?? undefined,
          },
        });
      }
    }

    await prisma.travel.update({
      where: { id: travelId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ synced });
  } catch (error) {
    console.error("POST /api/sync", error);
    return NextResponse.json({ error: "Error en sincronización" }, { status: 500 });
  }
}
