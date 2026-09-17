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
import type { PhotoSaveProgress } from "@/lib/photo-save-progress";
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

type ProgressCb = (progress: PhotoSaveProgress) => void;

async function prepareConfirmPhotos(
  photos: ParsedPhoto[],
  onProgress?: ProgressCb
): Promise<PreparedConfirmPhoto[]> {
  const out: PreparedConfirmPhoto[] = [];
  const total = photos.length;
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    onProgress?.({
      phase: "compressing",
      current: i + 1,
      total,
      completed: i,
      label: `Comprimiendo ${i + 1} de ${total}`,
    });
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
    async (photos: ParsedPhoto[], onProgress?: ProgressCb) => {
      const total = photos.length;
      const report = (partial: PhotoSaveProgress) => onProgress?.(partial);

      const queueOffline = async (
        items: Array<{
          photo: ParsedPhoto;
          uploadBlob: Blob;
          uploadFilename: string;
        }>,
        lastError: string | null = null
      ) => {
        report({
          phase: "queuing",
          current: 0,
          total,
          completed: Math.max(0, total - items.length),
          label:
            items.length === 1
              ? "Guardando 1 foto en la cola local"
              : `Guardando ${items.length} fotos en la cola local`,
        });
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

      report({
        phase: "preparing",
        current: 0,
        total,
        completed: 0,
        label:
          total === 1 ? "Preparando 1 foto…" : `Preparando ${total} fotos…`,
      });

      if (!navigator.onLine) {
        const prepared = await prepareConfirmPhotos(photos, onProgress);
        await queueOffline(
          prepared.map((p) => ({
            photo: p,
            uploadBlob: p.uploadBlob,
            uploadFilename: p.uploadFilename,
          }))
        );
        report({
          phase: "done",
          current: total,
          total,
          completed: total,
          label: "Guardadas offline",
        });
        return;
      }

      try {
        if (shareBundleId) {
          report({
            phase: "uploading",
            current: 1,
            total,
            completed: 0,
            label: "Importando desde el buzón compartido…",
          });
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
          report({
            phase: "done",
            current: total,
            total,
            completed: total,
            label: "Importación lista",
          });
          return;
        }

        // Compress first, then upload one (or budget-safe) photo per request so
        // phone JPEGs (~8MB) never hit Vercel’s ~4.5MB FUNCTION_PAYLOAD_TOO_LARGE.
        const prepared = await prepareConfirmPhotos(photos, onProgress);
        const CONFIRM_TIMEOUT_MS = 120_000;
        let uploaded = 0;
        let lastFailureMessage: string | null = null;

        try {
          const chunks = packByUploadBudget(
            prepared,
            (p) => p.uploadBlob.size + (p.posterBlob?.size ?? 0)
          );

          for (const chunk of chunks) {
            const indexStart = uploaded + 1;
            const indexEnd = uploaded + chunk.length;
            report({
              phase: "uploading",
              current: indexStart,
              total,
              completed: uploaded,
              label:
                chunk.length === 1
                  ? `Subiendo ${indexStart} de ${total}`
                  : `Subiendo ${indexStart}–${indexEnd} de ${total}`,
            });

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
              lastFailureMessage = await readUploadError(
                res,
                "No se pudieron subir las fotos"
              );
              throw new Error(lastFailureMessage);
            }
            uploaded += chunk.length;
            report({
              phase: "uploading",
              current: Math.min(uploaded, total),
              total,
              completed: uploaded,
              label:
                uploaded >= total
                  ? "Subida completa"
                  : `Subidas ${uploaded} de ${total}`,
            });
          }
        } catch (err) {
          // Queue only what did not upload yet. Always mark lastError so the UI
          // (and offline banner) show a real message — do not pretend success.
          const remaining = prepared.slice(uploaded);
          const message =
            lastFailureMessage ??
            (err instanceof Error ? err.message : null) ??
            "Error al subir fotos";

          if (remaining.length) {
            await queueOffline(
              remaining.map((p) => ({
                photo: p,
                uploadBlob: p.uploadBlob,
                uploadFilename: p.uploadFilename,
              })),
              message
            );
          }
          if (uploaded > 0) onSyncComplete?.();
          const summary =
            uploaded > 0
              ? `Se subieron ${uploaded} de ${prepared.length}. ${message}`
              : message;
          throw new Error(summary);
        }

        onSyncComplete?.();
        report({
          phase: "done",
          current: total,
          total,
          completed: total,
          label: total === 1 ? "1 foto guardada" : `${total} fotos guardadas`,
        });
      } catch (err) {
        // Propagate structured upload errors to PhotoUploadGrid.
        if (
          err instanceof Error &&
          /HTTP\s*\d|subieron \d|demasiado grande|FUNCTION_PAYLOAD|No se pudieron|Error al subir|Import failed/i.test(
            err.message
          )
        ) {
          throw err;
        }
        // Unexpected (e.g. compress crash): keep memories in the offline queue.
        const prepared = await prepareConfirmPhotos(photos, onProgress);
        const message =
          err instanceof Error ? err.message : "Error al guardar las fotos";
        await queueOffline(
          prepared.map((p) => ({
            photo: p,
            uploadBlob: p.uploadBlob,
            uploadFilename: p.uploadFilename,
          })),
          message
        );
        throw new Error(message);
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
