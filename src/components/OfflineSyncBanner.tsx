"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPendingQueueSnapshot,
  PENDING_CHANGED_EVENT,
  type PendingCounts,
  type PendingQueueItem,
} from "@/lib/offline-db";
import {
  discardPendingItem,
  retryAllFailed,
  retryPendingItem,
  syncTravelPending,
} from "@/lib/offline-sync";

interface OfflineSyncBannerProps {
  travelId: string;
  userId: string;
  onSynced?: () => void;
}

const EMPTY_COUNTS: PendingCounts = {
  photos: 0,
  notes: 0,
  places: 0,
  total: 0,
  errors: 0,
  ready: 0,
};

export default function OfflineSyncBanner({
  travelId,
  userId,
  onSynced,
}: OfflineSyncBannerProps) {
  const [counts, setCounts] = useState<PendingCounts>(EMPTY_COUNTS);
  const [items, setItems] = useState<PendingQueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    const snapshot = await getPendingQueueSnapshot(travelId);
    setCounts(snapshot.counts);
    setItems(snapshot.items);
    if (snapshot.counts.total === 0) {
      setExpanded(false);
      setLastResult(null);
    }
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
    void refresh();
    const onPendingChanged = (event: Event) => {
      const detailTravelId = (event as CustomEvent<{ travelId?: string | null }>).detail
        ?.travelId;
      if (detailTravelId && detailTravelId !== travelId) return;
      void refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener(PENDING_CHANGED_EVENT, onPendingChanged);
    window.addEventListener("online", onPendingChanged);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(PENDING_CHANGED_EVENT, onPendingChanged);
      window.removeEventListener("online", onPendingChanged);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [travelId, refresh]);

  const syncAll = useCallback(
    async (includeErrors = false) => {
      if (!navigator.onLine || syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      setLastResult(null);
      try {
        if (includeErrors) {
          await retryAllFailed(travelId);
        }
        const result = await syncTravelPending(travelId, userId, { includeErrors });
        await refresh();
        const synced =
          result.syncedPhotos + result.syncedNotes + result.syncedPlaces;
        if (synced > 0) {
          onSynced?.();
        }
        if (result.failed > 0 && synced > 0) {
          setLastResult(
            `Subidos ${synced}. ${result.failed} con error — revisa la cola.`
          );
          setExpanded(true);
        } else if (result.failed > 0) {
          setLastResult(`No se pudo sincronizar ${result.failed} elemento(s).`);
          setExpanded(true);
        } else if (synced > 0) {
          setLastResult(`Sincronizado: ${synced} elemento(s).`);
        }
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [travelId, userId, onSynced, refresh]
  );

  // Auto-sync only ready (non-error) items when coming online or new pending arrives.
  useEffect(() => {
    if (!isOnline || counts.ready === 0 || syncingRef.current) return;
    void syncAll(false);
  }, [isOnline, counts.ready, syncAll]);

  const handleRetryOne = async (item: PendingQueueItem) => {
    await retryPendingItem(item.kind, item.localId, travelId);
    await refresh();
    if (navigator.onLine) await syncAll(false);
  };

  const handleDiscardOne = async (item: PendingQueueItem) => {
    await discardPendingItem(item.kind, item.localId);
    await refresh();
  };

  if (counts.total === 0 && !lastResult) return null;

  const parts: string[] = [];
  if (counts.photos) parts.push(`${counts.photos} foto${counts.photos > 1 ? "s" : ""}`);
  if (counts.notes) parts.push(`${counts.notes} nota${counts.notes > 1 ? "s" : ""}`);
  if (counts.places) parts.push(`${counts.places} lugar${counts.places > 1 ? "es" : ""}`);

  const hasErrors = counts.errors > 0;
  const calloutClass = hasErrors ? "callout callout-error" : "callout callout-warning";

  return (
    <div className={`${calloutClass} space-y-2`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm">
          {counts.total > 0 ? (
            <>
              <span className="font-medium">
                Pendiente de subir: {parts.join(", ") || "elementos"}
              </span>
              {hasErrors && (
                <span className="ml-1">
                  · {counts.errors} con error
                </span>
              )}
              {!isOnline && <span className="ml-1">— sin conexión</span>}
            </>
          ) : (
            <span>{lastResult}</span>
          )}
          {lastResult && counts.total > 0 && (
            <p className="mt-0.5 text-xs opacity-90">{lastResult}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {counts.total > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="btn-secondary px-3 py-1 text-xs"
            >
              {expanded ? "Ocultar cola" : "Ver cola"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void syncAll(hasErrors)}
            disabled={syncing || !isOnline || counts.total === 0}
            className="btn-primary px-3 py-1 text-xs disabled:opacity-50"
          >
            {syncing
              ? "Sincronizando…"
              : hasErrors
                ? "Reintentar todo"
                : "Sincronizar ahora"}
          </button>
        </div>
      </div>

      {expanded && items.length > 0 && (
        <ul className="space-y-2 border-t border-[var(--border)] pt-2">
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.localId}`}
              className="flex flex-col gap-1 rounded-lg bg-[var(--surface-inset)] px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-fg">
                  {item.kind === "photo" ? "📷" : item.kind === "note" ? "📝" : "📍"}{" "}
                  {item.label}
                </p>
                {item.syncStatus === "error" ? (
                  <p className="mt-0.5 text-[var(--callout-error-fg)]">
                    {item.lastError ?? "Error al sincronizar"}
                    {item.attempts > 0 ? ` · ${item.attempts} intento(s)` : ""}
                  </p>
                ) : (
                  <p className="mt-0.5 text-fg-secondary">Listo para subir</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {item.syncStatus === "error" && (
                  <button
                    type="button"
                    onClick={() => void handleRetryOne(item)}
                    disabled={syncing || !isOnline}
                    className="btn-secondary px-2 py-1 text-[11px] disabled:opacity-50"
                  >
                    Reintentar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDiscardOne(item)}
                  disabled={syncing}
                  className="px-2 py-1 text-[11px] font-medium text-[var(--callout-error-fg)] disabled:opacity-50"
                >
                  Descartar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
