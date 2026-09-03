"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getSessionFromStorage,
  saveSession,
  type TravelHistoryEntry,
} from "@/lib/utils";
import {
  pruneDeletedTravelHistory,
  TRAVEL_DELETED_EVENT,
} from "@/lib/travel-local-cleanup";
import { peekPendingShareId, travelUrlWithShare } from "@/lib/share-client";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RecentTravels() {
  const router = useRouter();
  const [history, setHistory] = useState<TravelHistoryEntry[]>([]);
  const [activeTravelId, setActiveTravelId] = useState<string | null>(null);
  const [pendingShare, setPendingShare] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const pruned = await pruneDeletedTravelHistory();
      if (cancelled) return;
      setHistory(pruned);
      setActiveTravelId(getSessionFromStorage()?.travelId ?? null);
      setPendingShare(Boolean(peekPendingShareId()));
    };

    void refresh();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onDeleted = (event: Event) => {
      const travelId = (event as CustomEvent<{ travelId: string }>).detail?.travelId;
      if (!travelId) return;
      setHistory((prev) => prev.filter((item) => item.travelId !== travelId));
      setActiveTravelId((current) => (current === travelId ? null : current));
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(TRAVEL_DELETED_EVENT, onDeleted);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(TRAVEL_DELETED_EVENT, onDeleted);
    };
  }, []);

  if (history.length === 0) return null;

  const resume = (entry: TravelHistoryEntry) => {
    saveSession({
      userId: entry.userId,
      alias: entry.alias,
      travelId: entry.travelId,
    });
    setActiveTravelId(entry.travelId);
    if (pendingShare) {
      router.push(travelUrlWithShare(entry.travelId));
    }
  };

  return (
    <section className="surface mb-6 p-6">
      <h2 className="heading-section mb-1 text-accent-cyan">Tus viajes en este dispositivo</h2>
      <p className="mb-4 text-sm text-fg-secondary">
        Cada viaje tiene su propia sala. Si creas otro con el mismo nombre, no recupera el anterior.
      </p>
      <ul className="space-y-2">
        {history.map((entry) => {
          const isActive = entry.travelId === activeTravelId;
          return (
            <li
              key={entry.travelId}
              className="surface-inset flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-fg">{entry.title}</p>
                <p className="text-xs text-fg-secondary">
                  {entry.alias} · código {entry.shareCode} · {formatWhen(entry.lastVisited)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {!isActive ? (
                  <button
                    type="button"
                    onClick={() => resume(entry)}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Activar sesión
                  </button>
                ) : (
                  <span className="tag-mint px-3 py-1.5 text-xs">Sesión activa</span>
                )}
                <Link
                  href={travelUrlWithShare(entry.travelId)}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  {pendingShare ? "Añadir fotos" : "Abrir"}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
