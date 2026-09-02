import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { preparePhotoForStorage } from "@/lib/photo-upload";
import { inferPlaceIdFromGps, loadPlacesForLink } from "@/lib/photo-place-auto-link";
import { prisma } from "@/lib/prisma";
import { maxBytesForMedia } from "@/lib/media-limits";
import type { MediaKind } from "@/lib/media-types";

interface PhotoMeta {
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
    const places = await loadPlacesForLink(travelId);

    for (const meta of metadata) {
      const file = formData.get(`file_${meta.localId}`) as File | null;
      if (!file) continue;

      const mediaType: MediaKind = meta.mediaType === "VIDEO" ? "VIDEO" : "IMAGE";
      const maxBytes = maxBytesForMedia(mediaType === "VIDEO");
      if (file.size > maxBytes) continue;

      const ext = path.extname(file.name) || (mediaType === "VIDEO" ? ".mp4" : ".jpg");
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

      if (meta.isTransportStart && mediaType === "IMAGE") {
        await prisma.travel.update({
          where: { id: travelId },
          data: {
            startPhotoId: photo.id,
            startDate: prepared.exif.dateTime ?? undefined,
          },
        });
      }

      if (meta.isTransportEnd && mediaType === "IMAGE") {
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
      return NextResponse.json(
        { error: "No se recibieron archivos válidos (revisa el tamaño máximo)" },
        { status: 400 }
      );
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
