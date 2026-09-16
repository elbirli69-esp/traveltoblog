"use client";

import { useCallback } from "react";
import PhotoUploadGrid, { type UploadPlaceOption } from "@/components/PhotoUploadGrid";
import {
  savePendingPhoto,
  removePendingPhoto,
} from "@/lib/offline-db";
import {
  describeUploadHttpError,
  packByUploadBudget,
  prepareImageForUpload,
} from "@/lib/client-photo-compress";
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
  places?: UploadPlaceOption[];
  onIncomingFilesHandled?: () => void;
  onSyncComplete?: () => void;
  openPickerSignal?: number;
  highlight?: boolean;
  /** Hide pickers; upload only via Añadir recuerdo or share import. */
  addOnly?: boolean;
}

type PreparedConfirmPhoto = ParsedPhoto & {
  uploadBlob: Blob;
  uploadFilename: string;
};

async function prepareConfirmPhotos(
  photos: ParsedPhoto[]
): Promise<PreparedConfirmPhoto[]> {
  const out: PreparedConfirmPhoto[] = [];
  for (const photo of photos) {
    const prepared = await prepareImageForUpload(photo.file, photo.file.name, {
      mediaType: photo.mediaType ?? "IMAGE",
    });
    out.push({
      ...photo,
      uploadBlob: prepared.blob,
      uploadFilename: prepared.filename,
    });
  }
  return out;
}

async function readUploadError(res: Response, fallback: string): Promise<string> {
  let serverError: string | null = null;
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error?.trim()) serverError = data.error.trim();
  } catch {
    /* ignore non-JSON (e.g. Vercel 413 plain/FUNCTION_PAYLOAD_TOO_LARGE) */
  }
  return describeUploadHttpError(res.status, fallback, serverError);
}

export default function PhotoUploadSection({
  travelId,
  userId,
  userAlias,
  dateRange,
  incomingFiles,
  incomingExifByName,
  shareBundleId,
  places = [],
  onIncomingFilesHandled,
  onSyncComplete,
  openPickerSignal,
  highlight,
  addOnly = false,
}: PhotoUploadSectionProps) {
  const handlePhotosConfirmed = useCallback(
    async (photos: ParsedPhoto[]) => {
      const queueOffline = async (
        items: Array<{
          photo: ParsedPhoto;
          uploadBlob: Blob;
          uploadFilename: string;
        }>,
        lastError: string | null = null
      ) => {
        for (const { photo, uploadBlob, uploadFilename } of items) {
          await savePendingPhoto({
            localId: photo.id,
            travelId,
            userId,
            fileBlob: uploadBlob,
            filename: uploadFilename,
            exifDateTime: photo.exif.dateTime?.toISOString() ?? null,
            latitude: photo.exif.latitude,
            longitude: photo.exif.longitude,
            placeId: photo.placeId ?? null,
            placeLocalId: null,
            mediaType: photo.mediaType ?? "IMAGE",
            durationMs: photo.durationMs ?? null,
            posterBlob: photo.posterBlob ?? null,
            selected: photo.selected,
            isTransportStart: photo.isTransportStart,
            isTransportEnd: photo.isTransportEnd,
            createdAt: new Date().toISOString(),
            syncStatus: lastError ? "error" : "pending",
            lastError,
          });
        }
      };

      if (!navigator.onLine) {
        const prepared = await prepareConfirmPhotos(photos);
        await queueOffline(
          prepared.map((p) => ({
            photo: p,
            uploadBlob: p.uploadBlob,
            uploadFilename: p.uploadFilename,
          }))
        );
        return;
      }

      try {
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

        // Compress first, then upload one (or budget-safe) photo per request so
        // phone JPEGs (~8MB) never hit Vercel’s ~4.5MB FUNCTION_PAYLOAD_TOO_LARGE.
        const prepared = await prepareConfirmPhotos(photos);
        const CONFIRM_TIMEOUT_MS = 120_000;
        let uploaded = 0;
        let lastFailureMessage: string | null = null;

        try {
          const chunks = packByUploadBudget(
            prepared,
            (p) => p.uploadBlob.size + (p.posterBlob?.size ?? 0)
          );

          for (const chunk of chunks) {
            const formData = new FormData();
            formData.append("travelId", travelId);
            formData.append("userId", userId);

            const metadata = chunk.map((p) => ({
              localId: p.id,
              exifDateTime: p.exif.dateTime?.toISOString() ?? null,
              latitude: p.exif.latitude,
              longitude: p.exif.longitude,
              placeId: p.placeId ?? null,
              mediaType: p.mediaType ?? "IMAGE",
              durationMs: p.durationMs ?? null,
              selected: p.selected,
              isTransportStart: p.isTransportStart,
              isTransportEnd: p.isTransportEnd,
            }));

            formData.append("metadata", JSON.stringify(metadata));

            chunk.forEach((p) => {
              formData.append(`file_${p.id}`, p.uploadBlob, p.uploadFilename);
              if (p.posterBlob) {
                formData.append(`poster_${p.id}`, p.posterBlob, `${p.id}.poster.jpg`);
              }
            });

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), CONFIRM_TIMEOUT_MS);
            let res: Response;
            try {
              res = await fetch("/api/photos", {
                method: "POST",
                body: formData,
                signal: controller.signal,
              });
            } finally {
              clearTimeout(timer);
            }

            if (!res.ok) {
              lastFailureMessage = await readUploadError(res, "No se pudieron subir las fotos");
              throw new Error(lastFailureMessage);
            }
            uploaded += chunk.length;
          }
        } catch (err) {
          // Queue only what did not upload yet. HTTP 413 / payload errors are marked
          // as syncStatus=error (not silent "offline") so the banner shows a clear message.
          const remaining = prepared.slice(uploaded);
          const message =
            lastFailureMessage ??
            (err instanceof Error ? err.message : null) ??
            "Error al subir fotos";
          const isPayloadOrHttp =
            /HTTP\s*413|demasiado grande|FUNCTION_PAYLOAD/i.test(message);

          await queueOffline(
            remaining.map((p) => ({
              photo: p,
              uploadBlob: p.uploadBlob,
              uploadFilename: p.uploadFilename,
            })),
            isPayloadOrHttp ? message : null
          );
          if (uploaded > 0) onSyncComplete?.();
          return;
        }

        onSyncComplete?.();
      } catch {
        // Offline / unexpected: keep memories in the offline queue (compressed when possible).
        const prepared = await prepareConfirmPhotos(photos);
        await queueOffline(
          prepared.map((p) => ({
            photo: p,
            uploadBlob: p.uploadBlob,
            uploadFilename: p.uploadFilename,
          }))
        );
      }
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
      places={places}
      onIncomingFilesHandled={onIncomingFilesHandled}
      onPhotosConfirmed={handlePhotosConfirmed}
      onTransportPhotoMarked={handleTransportMarked}
      openPickerSignal={openPickerSignal}
      highlight={highlight}
      addOnly={addOnly}
    />
  );
}

export { removePendingPhoto };
