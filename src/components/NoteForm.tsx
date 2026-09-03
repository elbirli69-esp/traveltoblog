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
  /** Called after a successful save. Prefer unlocking the button before heavy parent work. */
  onCreated?: (note?: {
    id: string;
    text: string;
    type: string;
    photoId?: string | null;
    placeId?: string | null;
    user: { alias: string };
  }) => void;
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
        // Unlock before parent refresh (can be slow on NAS).
        setLoading(false);
        onCreated?.();
        return;
      }

      if (!travelId || !userId || !type) {
        setError("Faltan datos para guardar la nota");
        setLoading(false);
        return;
      }

      if (!navigator.onLine) {
        const { savePendingNote } = await import("@/lib/offline-db");
        const localId = createLocalId();
        await savePendingNote({
          localId,
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
        setLoading(false);
        onCreated?.({
          id: localId,
          text: text.trim(),
          type,
          photoId: type === "PHOTO" ? (photoId ?? null) : null,
          placeId: type === "PLACE" ? (placeId ?? null) : null,
          user: { alias: "Tú" },
        });
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
      const data = (await res.json()) as {
        note?: {
          id: string;
          text: string;
          type: string;
          photoId?: string | null;
          placeId?: string | null;
          user: { alias: string };
        };
      };

      setText("");
      setLoading(false);
      onCreated?.(data.note);
    } catch {
      setError("Error al guardar la nota");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label className="text-sm font-medium text-fg-secondary">{resolvedLabel}</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="form-input input-focus"
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
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        type="submit"
        disabled={loading || !text.trim()}
        className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50"
      >
        {loading ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
