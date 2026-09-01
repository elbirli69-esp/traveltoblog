"use client";

import { useState } from "react";
import { createLocalId } from "@/lib/utils";
import MemoryDateTimeField from "@/components/MemoryDateTimeField";
import { todayKey } from "@/lib/travel-dates";

const DEFAULT_LABELS = {
  PHOTO: "Nota para esta foto",
  DAY: "Nota del día",
  TRIP: "Nota del viaje",
  PLACE: "Nota del lugar",
} as const;

type NoteFormType = keyof typeof DEFAULT_LABELS;

interface NoteFormProps {
  travelId?: string;
  userId?: string;
  photoId?: string | null;
  placeId?: string | null;
  /** When the place is still offline-pending */
  placeLocalId?: string | null;
  type?: NoteFormType;
  dayDate?: string;
  /** Suggested default for TRIP note date (e.g. travel start). */
  defaultTripDate?: string;
  onCreated?: () => void;
  /** Overrides the default label for `type`, or required when using `onPersist`. */
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  rows?: number;
  /**
   * Custom persistence. When set, skips POST /api/notes.
   * Prefer type=PLACE + placeId for new code.
   */
  onPersist?: (text: string) => Promise<void>;
}

export default function NoteForm({
  travelId,
  userId,
  photoId,
  placeId,
  placeLocalId,
  type,
  dayDate,
  defaultTripDate,
  onCreated,
  label,
  placeholder = "Escribe tu anécdota, impresión o detalle…",
  submitLabel = "Añadir nota",
  rows = 3,
  onPersist,
}: NoteFormProps) {
  const [text, setText] = useState("");
  const [tripDate, setTripDate] = useState(defaultTripDate ?? todayKey());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedLabel =
    label ?? (type ? DEFAULT_LABELS[type] : "Nota");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setError(null);

    try {
      if (onPersist) {
        await onPersist(text.trim());
        setText("");
        onCreated?.();
        return;
      }

      if (!travelId || !userId || !type) {
        setError("Faltan datos para guardar la nota");
        return;
      }

      if (!navigator.onLine) {
        const { savePendingNote } = await import("@/lib/offline-db");
        await savePendingNote({
          localId: createLocalId(),
          travelId,
          userId,
          photoLocalId: type === "PHOTO" ? (photoId ?? null) : null,
          placeId: type === "PLACE" ? (placeId ?? null) : null,
          placeLocalId: type === "PLACE" ? (placeLocalId ?? null) : null,
          type,
          dayDate: type === "TRIP" ? tripDate : (dayDate ?? null),
          text: text.trim(),
          createdAt: new Date().toISOString(),
        });
        setText("");
        onCreated?.();
        return;
      }

      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelId,
          userId,
          photoId,
          placeId,
          placeLocalId,
          type,
          dayDate: type === "TRIP" ? tripDate : dayDate,
          text: text.trim(),
        }),
      });
      if (!res.ok) throw new Error("No se pudo guardar");

      setText("");
      onCreated?.();
    } catch {
      setError("Error al guardar la nota");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{resolvedLabel}</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
      />
      {type === "TRIP" && (
        <MemoryDateTimeField
          label="¿Cuándo ocurrió? (opcional)"
          date={tripDate}
          onDateChange={setTripDate}
          showTime={false}
          hint="Si no indicas fecha, se usará el inicio del viaje en la cronología."
        />
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading || !text.trim()}
        className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
      >
        {loading ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
