"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearLocalTravelData,
  isTravelNotFoundResponse,
} from "@/lib/travel-local-cleanup";

interface TravelCollaborationBarProps {
  travelId: string;
  participantCount: number;
  lastUpdated: string | null;
  onRefresh: () => void;
  onTravelDeleted?: () => void;
}

const POLL_MS = 15_000;
const APPLY_NOTICE_MS = 6_000;

function isUserEditing(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

function isRemoteNewer(remote: string, local: string | null): boolean {
  if (!local) return false;
  return new Date(remote).getTime() > new Date(local).getTime();
}

export default function TravelCollaborationBar({
  travelId,
  participantCount,
  lastUpdated,
  onRefresh,
  onTravelDeleted,
}: TravelCollaborationBarProps) {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const inFlightRef = useRef(false);
  const lastAppliedRemoteRef = useRef<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const editDeferRef = useRef<number | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const onTravelDeletedRef = useRef(onTravelDeleted);
  onTravelDeletedRef.current = onTravelDeleted;
  const lastUpdatedRef = useRef(lastUpdated);
  lastUpdatedRef.current = lastUpdated;

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

  const applyRemote = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setRefreshing(true);
    onRefreshRef.current();
    window.setTimeout(() => {
      inFlightRef.current = false;
      setRefreshing(false);
    }, 800);

    setJustSynced(true);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setJustSynced(false);
      noticeTimerRef.current = null;
    }, APPLY_NOTICE_MS);
  }, []);

  const checkRemote = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!navigator.onLine) return;
      try {
        const res = await fetch(`/api/travels/${travelId}?meta=1`, { cache: "no-store" });
        if (isTravelNotFoundResponse(res)) {
          await clearLocalTravelData(travelId);
          onTravelDeletedRef.current?.();
          router.replace("/");
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { updatedAt?: string };
        if (!data.updatedAt) return;

        if (!isRemoteNewer(data.updatedAt, lastUpdatedRef.current)) return;
        if (lastAppliedRemoteRef.current === data.updatedAt) return;

        if (!opts?.force && isUserEditing()) {
          if (editDeferRef.current) window.clearTimeout(editDeferRef.current);
          editDeferRef.current = window.setTimeout(() => {
            editDeferRef.current = null;
            void checkRemote();
          }, 4_000);
          return;
        }

        lastAppliedRemoteRef.current = data.updatedAt;
        applyRemote();
      } catch {
        /* ignore poll errors */
      }
    },
    [travelId, router, applyRemote]
  );

  useEffect(() => {
    lastAppliedRemoteRef.current = null;
  }, [lastUpdated]);

  useEffect(() => {
    void checkRemote();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkRemote();
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [checkRemote]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkRemote();
    };
    const onOnline = () => void checkRemote();
    const onFocus = () => void checkRemote();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkRemote]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      if (editDeferRef.current) window.clearTimeout(editDeferRef.current);
    };
  }, []);

  const handleRefresh = () => {
    applyRemote();
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
        {justSynced && isOnline && (
          <span className="text-xs font-medium text-accent-cyan">
            {refreshing ? "Actualizando el grupo…" : "Sincronizado con el grupo"}
          </span>
        )}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={!isOnline || refreshing}
          className="btn-secondary px-3 py-1 text-xs disabled:opacity-50"
        >
          {refreshing ? "Actualizando…" : "Actualizar"}
        </button>
      </div>
    </div>
  );
}
