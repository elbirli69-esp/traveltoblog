"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getSessionFromStorage,
  getTravelHistory,
  saveSession,
  type TravelHistoryEntry,
} from "@/lib/utils";

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
  const [history, setHistory] = useState<TravelHistoryEntry[]>([]);
  const [activeTravelId, setActiveTravelId] = useState<string | null>(null);

  useEffect(() => {
    setHistory(getTravelHistory());
    setActiveTravelId(getSessionFromStorage()?.travelId ?? null);
  }, []);

  if (history.length === 0) return null;

  const resume = (entry: TravelHistoryEntry) => {
    saveSession({
      userId: entry.userId,
      alias: entry.alias,
      travelId: entry.travelId,
    });
    setActiveTravelId(entry.travelId);
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
                <Link href={`/travel/${entry.travelId}`} className="btn-primary px-3 py-1.5 text-xs">
                  Abrir
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
