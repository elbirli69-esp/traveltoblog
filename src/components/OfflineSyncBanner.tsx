"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getPendingPhotos,
  getPendingNotes,
  getPendingPlaces,
  removePendingPhoto,
  removePendingNote,
  removePendingPlace,
  getPendingCounts,
  type PendingCounts,
} from "@/lib/offline-db";

interface OfflineSyncBannerProps {
  travelId: string;
  userId: string;
  onSynced?: () => void;
}

export default function OfflineSyncBanner({
  travelId,
  userId,
  onSynced,
}: OfflineSyncBannerProps) {
  const [counts, setCounts] = useState<PendingCounts>({
    photos: 0,
    notes: 0,
    places: 0,
    total: 0,
  });
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const refreshCount = useCallback(async () => {
    setCounts(await getPendingCounts(travelId));
  }, [travelId]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    refreshCount();
    const handleOnline = () => refreshCount();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [travelId, refreshCount]);

  const syncAll = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);

    try {
      const photoIdByLocalId = new Map<string, string>();

      const pendingPhotos = await getPendingPhotos(travelId);
      if (pendingPhotos.length) {
        const formData = new FormData();
        formData.append("travelId", travelId);
        formData.append("userId", userId);
        formData.append(
          "pendingPhotos",
          JSON.stringify(
            pendingPhotos.map((p) => ({
              localId: p.localId,
              exifDateTime: p.exifDateTime,
              latitude: p.latitude,
              longitude: p.longitude,
              selected: p.selected,
              isTransportStart: p.isTransportStart,
              isTransportEnd: p.isTransportEnd,
              filename: p.filename,
            }))
          )
        );

        for (const p of pendingPhotos) {
          formData.append(`file_${p.localId}`, p.fileBlob, p.filename);
        }

        const res = await fetch("/api/sync", { method: "POST", body: formData });
        if (res.ok) {
          const data = (await res.json()) as {
            synced?: Array<{ id: string; localId: string | null }>;
          };
          for (const photo of data.synced ?? []) {
            if (photo.localId) {
              photoIdByLocalId.set(photo.localId, photo.id);
            }
          }
          for (const p of pendingPhotos) {
            await removePendingPhoto(p.localId);
          }
        }
      }

      const pendingPlaces = await getPendingPlaces(travelId);
      const placeIdByLocalId = new Map<string, string>();
      for (const place of pendingPlaces) {
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
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            place?: { id: string; localId?: string | null };
          };
          if (data.place?.id) {
            placeIdByLocalId.set(place.localId, data.place.id);
          }
          await removePendingPlace(place.localId);
        }
      }

      const pendingNotes = await getPendingNotes(travelId);
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
        if (res.ok) await removePendingNote(note.localId);
      }

      await refreshCount();
      onSynced?.();
    } finally {
      setSyncing(false);
    }
  }, [travelId, userId, onSynced, refreshCount]);

  useEffect(() => {
    if (navigator.onLine && counts.total > 0) {
      syncAll();
    }
  }, [counts.total, syncAll]);

  if (counts.total === 0) return null;

  const parts: string[] = [];
  if (counts.photos) parts.push(`${counts.photos} foto${counts.photos > 1 ? "s" : ""}`);
  if (counts.notes) parts.push(`${counts.notes} nota${counts.notes > 1 ? "s" : ""}`);
  if (counts.places) parts.push(`${counts.places} lugar${counts.places > 1 ? "es" : ""}`);

  return (
    <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span>
        Pendiente: {parts.join(", ")}
        {!isOnline && " — esperando conexión"}
      </span>
      <button
        type="button"
        onClick={syncAll}
        disabled={syncing || !isOnline}
        className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {syncing ? "Sincronizando…" : "Sincronizar ahora"}
      </button>
    </div>
  );
}
