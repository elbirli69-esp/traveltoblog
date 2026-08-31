import { NextRequest, NextResponse } from "next/server";
import { resolvePhotoExifFromFile } from "@/lib/photo-gps";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: travelId } = await params;

    const photos = await prisma.photo.findMany({
      where: {
        travelId,
        OR: [{ latitude: null }, { longitude: null }, { exifDateTime: null }],
      },
    });

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

    return NextResponse.json({
      scanned: photos.length,
      updated,
      withGps: await prisma.photo.count({
        where: { travelId, latitude: { not: null }, longitude: { not: null } },
      }),
    });
  } catch (error) {
    console.error("POST /api/travels/[id]/photos/backfill-exif", error);
    return NextResponse.json({ error: "Error al reindexar EXIF" }, { status: 500 });
  }
}
