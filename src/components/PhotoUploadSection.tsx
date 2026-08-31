"use client";

import { useCallback } from "react";
import PhotoUploadGrid from "@/components/PhotoUploadGrid";
import {
  savePendingPhoto,
  removePendingPhoto,
} from "@/lib/offline-db";
import type { ExifMetadata, ParsedPhoto, TravelDateRange } from "@/types";

interface PhotoUploadSectionProps {
  travelId: string;
  userId: string;
  userAlias: string;
  dateRange: TravelDateRange;
  incomingFiles?: File[];
  incomingExifByName?: Record<string, ExifMetadata>;
  /** When set, confirm imports originals from server share inbox (preserves EXIF/GPS). */
  shareBundleId?: string | null;
  onIncomingFilesHandled?: () => void;
  onSyncComplete?: () => void;
  openPickerSignal?: number;
  highlight?: boolean;
}

export default function PhotoUploadSection({
  travelId,
  userId,
  userAlias,
  dateRange,
  incomingFiles,
  incomingExifByName,
  shareBundleId,
  onIncomingFilesHandled,
  onSyncComplete,
  openPickerSignal,
  highlight,
}: PhotoUploadSectionProps) {
  const handlePhotosConfirmed = useCallback(
    async (photos: ParsedPhoto[]) => {
      if (!navigator.onLine) {
        for (const photo of photos) {
          await savePendingPhoto({
            localId: photo.id,
            travelId,
            userId,
            fileBlob: photo.file,
            filename: photo.file.name,
            exifDateTime: photo.exif.dateTime?.toISOString() ?? null,
            latitude: photo.exif.latitude,
            longitude: photo.exif.longitude,
            selected: photo.selected,
            isTransportStart: photo.isTransportStart,
            isTransportEnd: photo.isTransportEnd,
            createdAt: new Date().toISOString(),
          });
        }
        return;
      }

      if (shareBundleId) {
        const res = await fetch(`/api/travels/${travelId}/photos/import-shared`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bundleId: shareBundleId,
            userId,
            photos: photos.map((p) => ({
              sourceName: p.file.name,
              localId: p.id,
              selected: p.selected,
              isTransportStart: p.isTransportStart,
              isTransportEnd: p.isTransportEnd,
            })),
          }),
        });
        if (!res.ok) throw new Error("Import failed");
        onSyncComplete?.();
        return;
      }

      const formData = new FormData();
      formData.append("travelId", travelId);
      formData.append("userId", userId);

      const metadata = photos.map((p) => ({
        localId: p.id,
        exifDateTime: p.exif.dateTime?.toISOString() ?? null,
        latitude: p.exif.latitude,
        longitude: p.exif.longitude,
        selected: p.selected,
        isTransportStart: p.isTransportStart,
        isTransportEnd: p.isTransportEnd,
      }));

      formData.append("metadata", JSON.stringify(metadata));

      photos.forEach((p) => {
        formData.append(`file_${p.id}`, p.file, p.file.name);
      });

      const res = await fetch("/api/photos", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      onSyncComplete?.();
    },
    [travelId, userId, shareBundleId, onSyncComplete]
  );

  const handleTransportMarked = useCallback(
    async (_photoId: string, _type: "start" | "end", _exifDate: Date | null) => {
      // Ida/Vuelta en la cola de subida solo se guarda localmente hasta Confirmar;
      // POST /api/photos aplica las flags. Tras subir, edítalas en la galería.
    },
    []
  );

  return (
    <PhotoUploadGrid
      travelId={travelId}
      userId={userId}
      userAlias={userAlias}
      dateRange={dateRange}
      incomingFiles={incomingFiles}
      incomingExifByName={incomingExifByName}
      onIncomingFilesHandled={onIncomingFilesHandled}
      onPhotosConfirmed={handlePhotosConfirmed}
      onTransportPhotoMarked={handleTransportMarked}
      openPickerSignal={openPickerSignal}
      highlight={highlight}
    />
  );
}

export { removePendingPhoto };
