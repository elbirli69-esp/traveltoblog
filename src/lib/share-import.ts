import path from "path";
import { deleteSharedBundle, getSharedBundle, readSharedFile } from "@/lib/share-inbox";
import { preparePhotoForStorage } from "@/lib/photo-upload";
import { prisma } from "@/lib/prisma";

export interface ImportSharedPhotoInput {
  sourceName: string;
  localId: string;
  selected: boolean;
  isTransportStart: boolean;
  isTransportEnd: boolean;
}

export async function importSharedPhotosToTravel(
  travelId: string,
  userId: string,
  bundleId: string,
  photos: ImportSharedPhotoInput[]
) {
  const bundle = await getSharedBundle(bundleId);
  if (!bundle) {
    throw new Error("shared-bundle-not-found");
  }

  const created = [];

  for (const meta of photos) {
    if (!meta.selected) continue;

    const buffer = await readSharedFile(bundleId, meta.sourceName);
    if (!buffer) continue;

    const ext = path.extname(meta.sourceName) || ".jpg";
    const prepared = await preparePhotoForStorage(
      travelId,
      meta.localId,
      buffer,
      ext,
      {}
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
    throw new Error("no-photos-imported");
  }

  await prisma.travel.update({
    where: { id: travelId },
    data: { updatedAt: new Date() },
  });

  await deleteSharedBundle(bundleId);

  return created;
}
