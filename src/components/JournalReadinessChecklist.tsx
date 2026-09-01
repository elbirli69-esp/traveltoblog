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
      <div className="callout callout-success mb-4 text-sm">
        Listo para generar: fotos, notas y fechas cubren lo esencial.
      </div>
    );
  }

  return (
    <div className="callout callout-warning mb-4">
      <p className="text-sm font-semibold">Antes de la crónica (opcional)</p>
      <p className="mt-1 text-xs opacity-90">Puedes generar ya; estos puntos mejoran el resultado.</p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-sm opacity-95">{item.message}</span>
            <button
              type="button"
              onClick={() => onFix(item.actionKind, item.dayDate)}
              className="btn-secondary shrink-0 self-start px-3 py-1.5 text-xs sm:self-auto"
            >
              {item.actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
