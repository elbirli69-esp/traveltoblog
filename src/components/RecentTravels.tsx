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

type ServerTravel = {
  id: string;
  title: string;
  shareCode: string;
  createdAt?: string;
  _count?: { users: number; photos: number };
};

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
  const [serverTravels, setServerTravels] = useState<ServerTravel[]>([]);
  const [activeTravelId, setActiveTravelId] = useState<string | null>(null);
  const [pendingShare, setPendingShare] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const pruned = await pruneDeletedTravelHistory();
      if (cancelled) return;
      setHistory(pruned);
      setActiveTravelId(getSessionFromStorage()?.travelId ?? null);
      setPendingShare(Boolean(peekPendingShareId()));

      try {
        const res = await fetch("/api/travels", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { travels?: ServerTravel[] };
          if (!cancelled) setServerTravels(Array.isArray(data.travels) ? data.travels : []);
        }
      } catch {
        // Offline or server down: keep local history only
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void refresh();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onDeleted = (event: Event) => {
      const travelId = (event as CustomEvent<{ travelId: string }>).detail?.travelId;
      if (!travelId) return;
      setHistory((prev) => prev.filter((item) => item.travelId !== travelId));
      setServerTravels((prev) => prev.filter((item) => item.id !== travelId));
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

  const historyIds = new Set(history.map((item) => item.travelId));
  const orphanServer = serverTravels.filter((travel) => !historyIds.has(travel.id));

  if (!loaded) return null;
  if (history.length === 0 && orphanServer.length === 0) return null;

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
      <h2 className="heading-section mb-1 text-accent-cyan">Tus viajes</h2>
      <p className="mb-4 text-sm text-fg-secondary">
        {history.length > 0
          ? "En este dispositivo y en el servidor. Si no ves uno, únete de nuevo con su código."
          : "No hay historial en este dispositivo, pero estos viajes siguen en el servidor. Únete con el código para recuperarlos."}
      </p>

      {history.length > 0 && (
        <ul className="mb-4 space-y-2">
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
      )}

      {orphanServer.length > 0 && (
        <>
          {history.length > 0 && (
            <h3 className="mb-2 text-sm font-medium text-fg-secondary">
              Otros viajes en el servidor
            </h3>
          )}
          <ul className="space-y-2">
            {orphanServer.map((travel) => {
              const photos = travel._count?.photos ?? 0;
              const users = travel._count?.users ?? 0;
              return (
                <li
                  key={travel.id}
                  className="surface-inset flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{travel.title}</p>
                    <p className="text-xs text-fg-secondary">
                      código {travel.shareCode}
                      {photos > 0 || users > 0
                        ? ` · ${photos} foto${photos === 1 ? "" : "s"} · ${users} participante${users === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/join/${travel.shareCode}`}
                      className="btn-primary px-3 py-1.5 text-xs"
                    >
                      Unirme
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
