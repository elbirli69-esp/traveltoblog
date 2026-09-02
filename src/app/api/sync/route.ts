import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { preparePhotoForStorage } from "@/lib/photo-upload";
import { inferPlaceIdFromGps, loadPlacesForLink } from "@/lib/photo-place-auto-link";
import { prisma } from "@/lib/prisma";
import { maxBytesForMedia } from "@/lib/media-limits";
import type { MediaKind } from "@/lib/media-types";

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
      mediaType?: MediaKind;
      durationMs?: number | null;
      selected: boolean;
      isTransportStart: boolean;
      isTransportEnd: boolean;
      filename: string;
    }>;

    const synced = [];
    const places = await loadPlacesForLink(travelId);

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

      const mediaType: MediaKind = meta.mediaType === "VIDEO" ? "VIDEO" : "IMAGE";
      if (file.size > maxBytesForMedia(mediaType === "VIDEO")) continue;

      const ext =
        path.extname(meta.filename) || (mediaType === "VIDEO" ? ".mp4" : ".jpg");
      const originalBuffer = Buffer.from(await file.arrayBuffer());
      const posterFile = formData.get(`poster_${meta.localId}`) as File | null;
      const posterBuffer = posterFile
        ? Buffer.from(await posterFile.arrayBuffer())
        : null;

      const prepared = await preparePhotoForStorage(
        travelId,
        meta.localId,
        originalBuffer,
        ext,
        {
          dateTime: meta.exifDateTime ? new Date(meta.exifDateTime) : null,
          latitude: meta.latitude,
          longitude: meta.longitude,
        },
        {
          mediaType,
          durationMs: meta.durationMs ?? null,
          posterBuffer,
        }
      );

      const placeId = inferPlaceIdFromGps(
        prepared.exif.latitude,
        prepared.exif.longitude,
        places,
        meta.placeId ?? null,
        {
          isTransportStart: meta.isTransportStart,
          isTransportEnd: meta.isTransportEnd,
        }
      );

      const photo = await prisma.photo.create({
        data: {
          travelId,
          userId,
          filename: prepared.filename,
          url: `/uploads/${travelId}/${prepared.filename}`,
          mediaType: prepared.mediaType,
          durationMs: prepared.durationMs,
          posterFilename: prepared.posterFilename,
          exifDateTime: prepared.exif.dateTime,
          latitude: prepared.exif.latitude,
          longitude: prepared.exif.longitude,
          placeId: placeId ?? null,
          selected: meta.selected,
          isTransportStart: mediaType === "VIDEO" ? false : meta.isTransportStart,
          isTransportEnd: mediaType === "VIDEO" ? false : meta.isTransportEnd,
          localId: meta.localId,
        },
      });

      synced.push(photo);

      if (meta.isTransportStart && mediaType === "IMAGE") {
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

      if (meta.isTransportEnd && mediaType === "IMAGE") {
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
