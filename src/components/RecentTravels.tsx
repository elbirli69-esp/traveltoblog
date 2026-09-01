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
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-6 shadow-sm dark:shadow-black/20">
      <h2 className="mb-1 text-lg font-semibold text-amber-950">Tus viajes en este dispositivo</h2>
      <p className="mb-4 text-sm text-amber-900/80">
        Cada viaje tiene su propia sala. Si creas otro con el mismo nombre, no recupera el anterior.
      </p>
      <ul className="space-y-2">
        {history.map((entry) => {
          const isActive = entry.travelId === activeTravelId;
          return (
            <li
              key={entry.travelId}
              className="flex flex-col gap-2 rounded-xl border border-amber-200/80 bg-white dark:bg-slate-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900 dark:text-slate-100">{entry.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  {entry.alias} · código {entry.shareCode} · {formatWhen(entry.lastVisited)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {!isActive ? (
                  <button
                    type="button"
                    onClick={() => resume(entry)}
                    className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50"
                  >
                    Activar sesión
                  </button>
                ) : (
                  <span className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900">
                    Sesión activa
                  </span>
                )}
                <Link
                  href={`/travel/${entry.travelId}`}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                >
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
