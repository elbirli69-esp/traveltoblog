"use client";

import {
  buildJournalReadinessItems,
  type ReadinessActionKind,
} from "@/lib/journal-readiness";

interface JournalReadinessChecklistProps {
  startDate: string | null;
  endDate: string | null;
  photos: {
    exifDateTime: string | null;
    isTransportStart: boolean;
    isTransportEnd: boolean;
  }[];
  dayNotes: { dayDate: string | null }[];
  tripNoteCount: number;
  onFix: (kind: ReadinessActionKind, dayDate?: string) => void;
}

export default function JournalReadinessChecklist({
  startDate,
  endDate,
  photos,
  dayNotes,
  tripNoteCount,
  onFix,
}: JournalReadinessChecklistProps) {
  const items = buildJournalReadinessItems({
    startDate,
    endDate,
    photos,
    dayNotes,
    tripNoteCount,
  });

  if (items.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
        Listo para generar: fotos, notas y fechas cubren lo esencial.
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
      <p className="text-sm font-semibold text-amber-950">
        Antes de la crónica (opcional)
      </p>
      <p className="mt-1 text-xs text-amber-900/80">
        Puedes generar ya; estos puntos mejoran el resultado.
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-sm text-amber-950/90">{item.message}</span>
            <button
              type="button"
              onClick={() => onFix(item.actionKind, item.dayDate)}
              className="shrink-0 self-start rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50 sm:self-auto"
            >
              {item.actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
