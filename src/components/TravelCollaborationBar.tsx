"use client";

import { useCallback, useEffect, useState } from "react";

interface TravelCollaborationBarProps {
  travelId: string;
  participantCount: number;
  lastUpdated: string | null;
  onRefresh: () => void;
}

export default function TravelCollaborationBar({
  travelId,
  participantCount,
  lastUpdated,
  onRefresh,
}: TravelCollaborationBarProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [remoteUpdatedAt, setRemoteUpdatedAt] = useState<string | null>(null);
  const [hasRemoteUpdates, setHasRemoteUpdates] = useState(false);

  useEffect(() => {
    const syncOnline = () => setIsOnline(navigator.onLine);
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, []);

  const checkRemote = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const res = await fetch(`/api/travels/${travelId}?meta=1`);
      if (!res.ok) return;
      const data = (await res.json()) as { updatedAt?: string };
      if (!data.updatedAt) return;

      setRemoteUpdatedAt(data.updatedAt);

      if (lastUpdated && new Date(data.updatedAt).getTime() > new Date(lastUpdated).getTime()) {
        setHasRemoteUpdates(true);
      }
    } catch {
      /* ignore poll errors */
    }
  }, [travelId, lastUpdated]);

  useEffect(() => {
    checkRemote();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") checkRemote();
    }, 30_000);
    return () => clearInterval(interval);
  }, [checkRemote]);

  useEffect(() => {
    if (lastUpdated && remoteUpdatedAt) {
      setHasRemoteUpdates(
        new Date(remoteUpdatedAt).getTime() > new Date(lastUpdated).getTime()
      );
    }
  }, [lastUpdated, remoteUpdatedAt]);

  const handleRefresh = () => {
    setHasRemoteUpdates(false);
    onRefresh();
    checkRemote();
  };

  const formattedUpdate =
    lastUpdated &&
    new Intl.DateTimeFormat("es-ES", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(lastUpdated));

  return (
    <div className="surface flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-3 text-fg-secondary">
        <span className={isOnline ? "badge-online" : "badge-offline"}>
          <span className={isOnline ? "badge-dot-online" : "badge-dot-offline"} />
          {isOnline ? "En línea" : "Sin conexión"}
        </span>
        <span className="text-xs text-fg-secondary">
          {participantCount} colaborador{participantCount !== 1 ? "es" : ""}
        </span>
        {formattedUpdate && (
          <span className="text-xs text-fg-tertiary">Actualizado {formattedUpdate}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasRemoteUpdates && isOnline && (
          <span className="text-xs font-medium text-accent-cyan">Hay novedades del grupo</span>
        )}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={!isOnline}
          className="btn-secondary px-3 py-1 text-xs disabled:opacity-50"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}
