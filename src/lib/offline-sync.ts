import {
  getPendingNotes,
  getPendingPhotos,
  getPendingPlaces,
  markPendingNoteError,
  markPendingPhotoError,
  markPendingPlaceError,
  removePendingNote,
  removePendingPhoto,
  removePendingPlace,
  resetPendingNoteForRetry,
  resetPendingPhotoForRetry,
  resetPendingPlaceForRetry,
} from "@/lib/offline-db";
import {
  PHOTO_UPLOAD_CHUNK_SIZE,
  describeUploadHttpError,
  packByUploadBudget,
  prepareImageForUpload,
} from "@/lib/client-photo-compress";
import { describeFetchError } from "@/lib/fetch-error";
import type { PendingPhoto } from "@/types";

/**
 * Keep each /api/sync POST under Vercel’s ~4.5MB body limit (and Tailscale-friendly).
 * Images are client-compressed first; default is one photo per request.
 */
export const PHOTO_SYNC_CHUNK_SIZE = PHOTO_UPLOAD_CHUNK_SIZE;
/** Per-chunk timeout — a hung POST used to leave the UI on «Sincronizando…» forever. */
export const PHOTO_SYNC_CHUNK_TIMEOUT_MS = 120_000;

export interface SyncTravelResult {
  syncedPhotos: number;
  syncedNotes: number;
  syncedPlaces: number;
  failed: number;
  photoIdByLocalId: Map<string, string>;
  placeIdByLocalId: Map<string, string>;
}

type PreparedPendingPhoto = PendingPhoto & {
  uploadBlob: Blob;
  uploadFilename: string;
};

async function preparePendingPhotoForUpload(
  photo: PendingPhoto
): Promise<PreparedPendingPhoto> {
  const prepared = await prepareImageForUpload(photo.fileBlob, photo.filename, {
    mediaType: photo.mediaType ?? "IMAGE",
  });
  return {
    ...photo,
    uploadBlob: prepared.blob,
    uploadFilename: prepared.filename,
  };
}

async function postPhotoSyncChunk(
  travelId: string,
  userId: string,
  chunk: PreparedPendingPhoto[],
  placeIdByLocalId: Map<string, string>
): Promise<{
  synced: Array<{ id: string; localId: string | null }>;
  skipped: Array<{ localId: string; reason: string }>;
}> {
  const formData = new FormData();
  formData.append("travelId", travelId);
  formData.append("userId", userId);
  formData.append(
    "pendingPhotos",
    JSON.stringify(
      chunk.map((p) => ({
        localId: p.localId,
        exifDateTime: p.exifDateTime,
        latitude: p.latitude,
        longitude: p.longitude,
        placeId:
          p.placeId ??
          (p.placeLocalId ? placeIdByLocalId.get(p.placeLocalId) ?? null : null),
        mediaType: p.mediaType ?? "IMAGE",
        durationMs: p.durationMs ?? null,
        selected: p.selected,
        isTransportStart: p.isTransportStart,
        isTransportEnd: p.isTransportEnd,
        filename: p.uploadFilename,
      }))
    )
  );

  for (const p of chunk) {
    formData.append(`file_${p.localId}`, p.uploadBlob, p.uploadFilename);
    if (p.posterBlob) {
      formData.append(`poster_${p.localId}`, p.posterBlob, `${p.localId}.poster.jpg`);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PHOTO_SYNC_CHUNK_TIMEOUT_MS);
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "No se pudieron subir las fotos"));
    }
    const data = (await res.json()) as {
      synced?: Array<{ id: string; localId: string | null }>;
      skipped?: Array<{ localId: string; reason: string }>;
    };
    return {
      synced: data.synced ?? [],
      skipped: data.skipped ?? [],
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  let serverError: string | null = null;
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error?.trim()) serverError = data.error.trim();
  } catch {
    /* ignore non-JSON (Vercel edge 413) */
  }
  return describeUploadHttpError(res.status, fallback, serverError);
}

export interface SyncTravelOptions {
  /** When true, also retry items previously marked as error. */
  includeErrors?: boolean;
}

/** Upload IndexedDB pending queue for one travel. Keeps failed items with lastError. */
export async function syncTravelPending(
  travelId: string,
  userId: string,
  options: SyncTravelOptions = {}
): Promise<SyncTravelResult> {
  const includeErrors = options.includeErrors ?? false;
  const photoIdByLocalId = new Map<string, string>();
  const placeIdByLocalId = new Map<string, string>();
  let syncedPhotos = 0;
  let syncedNotes = 0;
  let syncedPlaces = 0;
  let failed = 0;

  const pendingPlaces = (await getPendingPlaces(travelId)).filter(
    (p) => includeErrors || (p.syncStatus ?? "pending") !== "error"
  );

  for (const place of pendingPlaces) {
    try {
      const res = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelId: place.travelId,
          userId: place.userId,
          name: place.name,
          type: place.type,
          latitude: place.latitude,
          longitude: place.longitude,
          comment: place.comment,
          localId: place.localId,
          visitedAt: place.visitedAt ?? place.createdAt,
        }),
      });
      if (!res.ok) {
        failed += 1;
        await markPendingPlaceError(
          place,
          await readErrorMessage(res, "No se pudo subir el lugar")
        );
        continue;
      }
      const data = (await res.json()) as {
        place?: { id: string; localId?: string | null };
      };
      if (data.place?.id) {
        placeIdByLocalId.set(place.localId, data.place.id);
      }
      await removePendingPlace(place.localId);
      syncedPlaces += 1;
    } catch {
      failed += 1;
      await markPendingPlaceError(place, "Sin conexión o error de red al subir el lugar");
    }
  }

  const pendingPhotos = (await getPendingPhotos(travelId)).filter(
    (p) => includeErrors || (p.syncStatus ?? "pending") !== "error"
  );

  // Compress images, then upload in budget-safe chunks (default 1) so Vercel
  // never sees an 8MB phone JPEG (or a 3×HEIC batch) as one function body.
  const preparedPhotos: PreparedPendingPhoto[] = [];
  for (const photo of pendingPhotos) {
    preparedPhotos.push(await preparePendingPhotoForUpload(photo));
  }

  const photoChunks = packByUploadBudget(
    preparedPhotos,
    (p) => p.uploadBlob.size + (p.posterBlob?.size ?? 0),
    undefined,
    PHOTO_SYNC_CHUNK_SIZE
  );

  for (const chunk of photoChunks) {
    try {
      const { synced, skipped } = await postPhotoSyncChunk(
        travelId,
        userId,
        chunk,
        placeIdByLocalId
      );
      const syncedLocalIds = new Set<string>();
      for (const photo of synced) {
        if (photo.localId) {
          photoIdByLocalId.set(photo.localId, photo.id);
          syncedLocalIds.add(photo.localId);
        }
      }
      const skippedByLocalId = new Map(
        skipped.map((s) => [s.localId, s.reason] as const)
      );
      for (const photo of chunk) {
        if (syncedLocalIds.has(photo.localId)) {
          await removePendingPhoto(photo.localId);
          syncedPhotos += 1;
        } else {
          failed += 1;
          await markPendingPhotoError(
            photo,
            skippedByLocalId.get(photo.localId) ??
              "La foto no se sincronizó (archivo ausente o demasiado grande)"
          );
        }
      }
    } catch (err) {
      failed += chunk.length;
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Tiempo de espera agotado al subir (lote demasiado lento). Reintenta."
          : describeFetchError(err, "Sin conexión o error de red al subir fotos");
      for (const photo of chunk) {
        await markPendingPhotoError(photo, message);
      }
    }
  }

  // Notes that were waiting on photos/places may need a later pass — include errors
  // only when includeErrors, otherwise only pending notes.
  const pendingNotes = (await getPendingNotes(travelId)).filter(
    (n) => includeErrors || (n.syncStatus ?? "pending") !== "error"
  );

  for (const note of pendingNotes) {
    const resolvedPhotoId =
      note.photoLocalId != null
        ? (photoIdByLocalId.get(note.photoLocalId) ?? null)
        : null;
    const resolvedPlaceId =
      note.placeId ??
      (note.placeLocalId != null
        ? (placeIdByLocalId.get(note.placeLocalId) ?? null)
        : null);

    // PHOTO note still waiting for its photo — leave pending, don't mark error.
    if (note.photoLocalId && !resolvedPhotoId) {
      const stillPendingPhoto = (await getPendingPhotos(travelId)).some(
        (p) => p.localId === note.photoLocalId
      );
      if (stillPendingPhoto) continue;
      failed += 1;
      await markPendingNoteError(
        note,
        "La foto asociada no está en el servidor; vuelve a subir la foto o edita la nota"
      );
      continue;
    }

    if (note.placeLocalId && !resolvedPlaceId) {
      const stillPendingPlace = (await getPendingPlaces(travelId)).some(
        (p) => p.localId === note.placeLocalId
      );
      if (stillPendingPlace) continue;
      failed += 1;
      await markPendingNoteError(
        note,
        "El lugar asociado no está en el servidor; vuelve a crear el lugar"
      );
      continue;
    }

    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelId: note.travelId,
          userId: note.userId,
          photoId: resolvedPhotoId,
          photoLocalId: note.photoLocalId ?? null,
          placeId: resolvedPlaceId,
          placeLocalId: note.placeLocalId ?? null,
          type: note.type,
          dayDate: note.dayDate,
          text: note.text,
          localId: note.localId,
        }),
      });
      if (!res.ok) {
        failed += 1;
        await markPendingNoteError(
          note,
          await readErrorMessage(res, "No se pudo subir la nota")
        );
        continue;
      }
      await removePendingNote(note.localId);
      syncedNotes += 1;
    } catch {
      failed += 1;
      await markPendingNoteError(note, "Sin conexión o error de red al subir la nota");
    }
  }

  return {
    syncedPhotos,
    syncedNotes,
    syncedPlaces,
    failed,
    photoIdByLocalId,
    placeIdByLocalId,
  };
}

export async function retryAllFailed(travelId: string): Promise<void> {
  const [photos, notes, places] = await Promise.all([
    getPendingPhotos(travelId),
    getPendingNotes(travelId),
    getPendingPlaces(travelId),
  ]);
  await Promise.all([
    ...photos
      .filter((p) => p.syncStatus === "error")
      .map((p) => resetPendingPhotoForRetry(p)),
    ...notes
      .filter((n) => n.syncStatus === "error")
      .map((n) => resetPendingNoteForRetry(n)),
    ...places
      .filter((p) => p.syncStatus === "error")
      .map((p) => resetPendingPlaceForRetry(p)),
  ]);
}

export async function discardPendingItem(
  kind: "photo" | "note" | "place",
  localId: string
): Promise<void> {
  if (kind === "photo") await removePendingPhoto(localId);
  else if (kind === "note") await removePendingNote(localId);
  else await removePendingPlace(localId);
}

export async function retryPendingItem(
  kind: "photo" | "note" | "place",
  localId: string,
  travelId: string
): Promise<void> {
  if (kind === "photo") {
    const photo = (await getPendingPhotos(travelId)).find((p) => p.localId === localId);
    if (photo) await resetPendingPhotoForRetry(photo);
  } else if (kind === "note") {
    const note = (await getPendingNotes(travelId)).find((n) => n.localId === localId);
    if (note) await resetPendingNoteForRetry(note);
  } else {
    const place = (await getPendingPlaces(travelId)).find((p) => p.localId === localId);
    if (place) await resetPendingPlaceForRetry(place);
  }
}
