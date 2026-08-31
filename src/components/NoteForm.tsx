"use client";

import { useState } from "react";
import { createLocalId } from "@/lib/utils";

interface NoteFormProps {
  travelId: string;
  userId: string;
  photoId?: string | null;
  type: "PHOTO" | "DAY" | "TRIP";
  dayDate?: string;
  onCreated?: () => void;
}

export default function NoteForm({
  travelId,
  userId,
  photoId,
  type,
  dayDate,
  onCreated,
}: NoteFormProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const labels = {
    PHOTO: "Nota para esta foto",
    DAY: "Nota del día",
    TRIP: "Nota del viaje",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);

    if (!navigator.onLine) {
      const { savePendingNote } = await import("@/lib/offline-db");
      await savePendingNote({
        localId: createLocalId(),
        travelId,
        userId,
        photoLocalId: photoId ?? null,
        type,
        dayDate: dayDate ?? null,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      });
      setText("");
      setLoading(false);
      onCreated?.();
      return;
    }

    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        travelId,
        userId,
        photoId,
        type,
        dayDate,
        text,
      }),
    });

    setText("");
    setLoading(false);
    onCreated?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label className="text-sm font-medium text-slate-700">{labels[type]}</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Escribe tu anécdota, impresión o detalle…"
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
      />
      <button
        type="submit"
        disabled={loading || !text.trim()}
        className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
      >
        {loading ? "Guardando…" : "Añadir nota"}
      </button>
    </form>
  );
}
