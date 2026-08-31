"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getPendingPhotos,
  getPendingNotes,
  removePendingPhoto,
  removePendingNote,
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
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    const [photos, notes] = await Promise.all([
      getPendingPhotos(travelId),
      getPendingNotes(travelId),
    ]);
    setPendingCount(photos.length + notes.length);
  }, [travelId]);

  useEffect(() => {
    refreshCount();
    const handleOnline = () => refreshCount();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [travelId, refreshCount]);

  const syncAll = async () => {
    if (!navigator.onLine) return;
    setSyncing(true);

    try {
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
          for (const p of pendingPhotos) {
            await removePendingPhoto(p.localId);
          }
        }
      }

      const pendingNotes = await getPendingNotes(travelId);
      for (const note of pendingNotes) {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            travelId: note.travelId,
            userId: note.userId,
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
  };

  useEffect(() => {
    if (navigator.onLine && pendingCount > 0) {
      syncAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCount]);

  if (pendingCount === 0) return null;

  return (
    <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span>
        {pendingCount} elemento{pendingCount > 1 ? "s" : ""} pendiente
        {pendingCount > 1 ? "s" : ""} de sincronizar
      </span>
      <button
        type="button"
        onClick={syncAll}
        disabled={syncing || !navigator.onLine}
        className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {syncing ? "Sincronizando…" : "Sincronizar ahora"}
      </button>
    </div>
  );
}
