import { NextRequest, NextResponse } from "next/server";
import { isValidGps } from "@/lib/exif";
import { resolvePhotoExifFromFile } from "@/lib/photo-gps";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: travelId } = await params;

    const photos = await prisma.photo.findMany({ where: { travelId } });

    let updated = 0;
    for (const photo of photos) {
      const resolved = await resolvePhotoExifFromFile({
        url: photo.url,
        exifDateTime: photo.exifDateTime,
        latitude: photo.latitude,
        longitude: photo.longitude,
      });

      if (!resolved.changed) continue;

      await prisma.photo.update({
        where: { id: photo.id },
        data: {
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          exifDateTime: resolved.dateTime,
        },
      });
      updated += 1;
    }

    const all = await prisma.photo.findMany({
      where: { travelId },
      select: { latitude: true, longitude: true },
    });
    const withGps = all.filter((p) => isValidGps(p.latitude, p.longitude)).length;

    return NextResponse.json({
      scanned: photos.length,
      updated,
      withGps,
    });
  } catch (error) {
    console.error("POST /api/travels/[id]/photos/backfill-exif", error);
    return NextResponse.json({ error: "Error al reindexar EXIF" }, { status: 500 });
  }
}
