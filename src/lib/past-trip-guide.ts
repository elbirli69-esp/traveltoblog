import type { AddMemoryKind } from "@/components/AddMemorySheet";
import { isoToDateKey } from "@/lib/travel-dates";

export type PastTripStepId = "dates" | "photos" | "places" | "days" | "trip";

export interface PastTripStep {
  id: PastTripStepId;
  title: string;
  description: string;
  actionLabel: string;
  actionKind: AddMemoryKind | null;
  /** First calendar day for day-scoped actions */
  dayDate?: string;
}

export interface PastTripGuideInput {
  startDate: string | null;
  endDate: string | null;
  photoCount: number;
  placeCount: number;
  dayNoteCount: number;
  tripNoteCount: number;
}

export function buildPastTripSteps(input: PastTripGuideInput): PastTripStep[] {
  const firstDay = input.startDate ? isoToDateKey(input.startDate) : undefined;

  return [
    {
      id: "dates",
      title: "Fechas del viaje",
      description: "Define el calendario real del viaje (aunque subas fotos hoy).",
      actionLabel: "Revisar fechas",
      actionKind: null,
    },
    {
      id: "photos",
      title: "Fotos",
      description: "Sube recuerdos del álbum. Revisa la fecha si el EXIF no coincide.",
      actionLabel: "Subir fotos",
      actionKind: "photo",
    },
    {
      id: "places",
      title: "Lugares",
      description: "Marca hoteles, restaurantes o miradores con la fecha de la visita.",
      actionLabel: "Marcar lugar",
      actionKind: "place",
    },
    {
      id: "days",
      title: "Vivencias por día",
      description: "Resume cómo fue cada jornada; la crónica lo usará capítulo a capítulo.",
      actionLabel: "Nota del día",
      actionKind: "day",
      dayDate: firstDay,
    },
    {
      id: "trip",
      title: "Sobre el viaje",
      description: "Anécdotas generales, impresiones o conclusiones del viaje completo.",
      actionLabel: "Nota del viaje",
      actionKind: "trip",
    },
  ];
}

export function isPastTripStepDone(
  stepId: PastTripStepId,
  input: PastTripGuideInput
): boolean {
  switch (stepId) {
    case "dates":
      return Boolean(input.startDate && input.endDate);
    case "photos":
      return input.photoCount > 0;
    case "places":
      return input.placeCount > 0;
    case "days":
      return input.dayNoteCount > 0;
    case "trip":
      return input.tripNoteCount > 0;
    default:
      return false;
  }
}

export function pastTripGuideProgress(input: PastTripGuideInput): {
  done: number;
  total: number;
  complete: boolean;
} {
  const steps = buildPastTripSteps(input);
  const done = steps.filter((s) => isPastTripStepDone(s.id, input)).length;
  return { done, total: steps.length, complete: done === steps.length };
}

export const PAST_GUIDE_DISMISS_KEY = (travelId: string) =>
  `traveltoblog_past_guide_dismissed_${travelId}`;

export function isPastTripCandidate(input: PastTripGuideInput): boolean {
  return Boolean(input.startDate && input.endDate);
}
