"use client";

import { useCallback, useEffect, useState } from "react";
import type { TimelineEvent } from "@/lib/timeline";
import { formatDateKey } from "@/lib/travel-dates";

const KIND_ICONS: Record<string, string> = {
  photo: "📷",
  place: "📍",
  note: "📝",
  "flight-out": "✈️",
  "flight-in": "🛬",
  "journal-chunk": "📖",
  "gps-segment": "🛤️",
};

interface TravelTimelineProps {
  travelId: string;
  activeEventId?: string | null;
  onEventSelect?: (event: TimelineEvent) => void;
}

export default function TravelTimeline({
  travelId,
  activeEventId,
  onEventSelect,
}: TravelTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [days, setDays] = useState<{ dayKey: string; label: string; eventCount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/travels/${travelId}/timeline`);
      if (!res.ok) throw new Error("No se pudo cargar la cronología");
      const data = await res.json();
      setEvents(data.events ?? []);
      setDays(data.days ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [travelId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-fg-secondary">Cargando cronología…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-danger">
        {error}{" "}
        <button type="button" onClick={() => void load()} className="underline">
          Reintentar
        </button>
      </p>
    );
  }

  if (events.length === 0) {
    return (
      <p className="empty-state text-sm text-fg-secondary">
        Aún no hay eventos en la cronología. Añade fotos, lugares o notas.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="mb-3 flex flex-wrap gap-2 text-xs text-fg-secondary">
        <span>{days.length} día{days.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{events.filter((e) => e.kind !== "day-boundary").length} eventos</span>
      </div>
      <div className="max-h-[520px] space-y-1 overflow-y-auto pr-1">
        {events.map((ev) => {
          if (ev.kind === "day-boundary") {
            return (
              <div
                key={ev.id}
                id={`tl-day-${ev.dayKey}`}
                className="sticky top-0 z-10 bg-[var(--card)]/95 py-2 text-sm font-bold text-accent-cyan backdrop-blur"
              >
                {formatDateKey(ev.dayKey)}
              </div>
            );
          }

          const icon = KIND_ICONS[ev.kind] ?? "•";
          const isActive = activeEventId === ev.id;
          const time = new Intl.DateTimeFormat("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(ev.at));

          return (
            <button
              key={ev.id}
              type="button"
              data-day={ev.dayKey}
              onClick={() => onEventSelect?.(ev)}
              className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                isActive
                  ? "timeline-active"
                  : "surface-inset hover:border-[var(--border-strong)]"
              }`}
            >
              <span className="text-lg leading-none">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold text-fg">{ev.title}</span>
                  <span className="text-xs text-fg-tertiary">{time}</span>
                </div>
                {ev.body && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-fg-secondary">{ev.body}</p>
                )}
                {ev.author && (
                  <p className="mt-0.5 text-xs text-fg-tertiary">{ev.author}</p>
                )}
              </div>
              {ev.mediaUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ev.mediaUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
