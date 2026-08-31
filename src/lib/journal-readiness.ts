import { isoToDateKey, resolveTravelDayRange } from "@/lib/travel-dates";

export type ReadinessActionKind = "photo" | "place" | "day" | "trip";

export interface ReadinessItem {
  id: string;
  message: string;
  /** Shorter label for the fix button */
  actionLabel: string;
  actionKind: ReadinessActionKind;
  /** Optional YYYY-MM-DD for day-scoped actions */
  dayDate?: string;
}

interface TravelReadinessInput {
  startDate: string | null;
  endDate: string | null;
  photos: {
    exifDateTime: string | null;
    isTransportStart: boolean;
    isTransportEnd: boolean;
  }[];
  dayNotes: { dayDate: string | null }[];
  tripNoteCount: number;
}

export function buildJournalReadinessItems(
  input: TravelReadinessInput
): ReadinessItem[] {
  const items: ReadinessItem[] = [];

  if (input.tripNoteCount === 0) {
    items.push({
      id: "no-trip-notes",
      message: "Aún no hay notas del viaje (útiles para intro y conclusión de la crónica).",
      actionLabel: "Nota del viaje",
      actionKind: "trip",
    });
  }

  const hasOutbound = input.photos.some((p) => p.isTransportStart);
  const hasInbound = input.photos.some((p) => p.isTransportEnd);

  if (input.photos.length > 0 && !hasOutbound) {
    items.push({
      id: "no-outbound",
      message: "No hay foto de ida marcada — la crónica usará fechas menos precisas.",
      actionLabel: "Marcar ida",
      actionKind: "photo",
    });
  }

  if (input.photos.length > 0 && !hasInbound) {
    items.push({
      id: "no-inbound",
      message: "No hay foto de vuelta marcada.",
      actionLabel: "Marcar vuelta",
      actionKind: "photo",
    });
  }

  const { dayKeys } = resolveTravelDayRange({
    startDate: input.startDate,
    endDate: input.endDate,
    photoExifDates: input.photos.map((p) => p.exifDateTime),
  });

  const daysWithNotes = new Set(
    input.dayNotes
      .filter((n) => n.dayDate)
      .map((n) => isoToDateKey(n.dayDate!))
  );

  const daysWithoutNotes = dayKeys.filter((key) => !daysWithNotes.has(key));

  if (dayKeys.length > 1 && daysWithoutNotes.length > 0) {
    const firstGap = daysWithoutNotes[0];
    items.push({
      id: "days-without-notes",
      message:
        daysWithoutNotes.length === 1
          ? "Hay 1 día del viaje sin nota de texto."
          : `Hay ${daysWithoutNotes.length} días del viaje sin nota de texto.`,
      actionLabel: "Nota del día",
      actionKind: "day",
      dayDate: firstGap,
    });
  }

  return items;
}
