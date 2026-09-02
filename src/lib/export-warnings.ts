import { formatDateKey, isoToDateKey, resolveTravelDayRange } from "@/lib/travel-dates";

export interface ExportWarning {
  level: "info" | "warning";
  message: string;
}

export interface ExportWarningsInput {
  startDate: Date | null;
  endDate: Date | null;
  journalMarkdown: string | null;
  placeCount?: number;
  photos: {
    latitude: number | null;
    longitude: number | null;
    exifDateTime: Date | null;
    placeId?: string | null;
    isTransportStart?: boolean;
    isTransportEnd?: boolean;
    mediaType?: "IMAGE" | "VIDEO";
    /** Approximate original file size when known (videos). */
    fileSizeBytes?: number | null;
  }[];
  notes: {
    type: string;
    dayDate: Date | null;
  }[];
}

export function buildExportWarnings(input: ExportWarningsInput): ExportWarning[] {
  const warnings: ExportWarning[] = [];
  const photoCount = input.photos.length;

  if (photoCount === 0) {
    warnings.push({
      level: "warning",
      message: "No hay fotos seleccionadas. Marca fotos en el viaje antes de exportar.",
    });
    return warnings;
  }

  if (!input.journalMarkdown?.trim()) {
    warnings.push({
      level: "info",
      message: "Sin crónica IA: el export usará cronología unificada y galería.",
    });
  }

  const noGps = input.photos.filter(
    (p) => p.latitude == null || p.longitude == null
  ).length;
  if (noGps > 0) {
    warnings.push({
      level: noGps === photoCount ? "warning" : "info",
      message:
        noGps === photoCount
          ? "Ninguna foto tiene GPS: el mapa no aparecerá en el export."
          : `${noGps} de ${photoCount} fotos sin GPS — el mapa puede quedar incompleto.`,
    });
  }

  if ((input.placeCount ?? 0) > 0) {
    const linkable = input.photos.filter(
      (p) => !p.isTransportStart && !p.isTransportEnd
    );
    const noPlace = linkable.filter((p) => !p.placeId).length;
    if (noPlace > 0) {
      warnings.push({
        level: noPlace === linkable.length ? "warning" : "info",
        message:
          noPlace === linkable.length
            ? `Ninguna foto seleccionada está vinculada a un lugar (${input.placeCount} lugares en el viaje).`
            : `${noPlace} de ${linkable.length} fotos seleccionadas sin lugar vinculado — el export puede perder contexto de sitios.`,
      });
    }
  }

  const { dayKeys } = resolveTravelDayRange({
    startDate: input.startDate?.toISOString() ?? null,
    endDate: input.endDate?.toISOString() ?? null,
    photoExifDates: input.photos.map((p) => p.exifDateTime?.toISOString() ?? null),
  });

  const daysWithNotes = new Set(
    input.notes
      .filter((n) => n.type === "DAY" && n.dayDate)
      .map((n) => isoToDateKey(n.dayDate!.toISOString()))
  );
  const missingDayNotes = dayKeys.filter((key) => !daysWithNotes.has(key));
  if (missingDayNotes.length > 0 && dayKeys.length > 1) {
    const sample = formatDateKey(missingDayNotes[0], "short");
    warnings.push({
      level: "info",
      message: `${missingDayNotes.length} día${missingDayNotes.length !== 1 ? "s" : ""} sin nota DAY (p. ej. ${sample}).`,
    });
  }

  if (photoCount >= 40) {
    warnings.push({
      level: "warning",
      message: `Muchas fotos (${photoCount}): la primera exportación puede tardar; las siguientes serán más rápidas gracias a la caché.`,
    });
  } else if (photoCount >= 20) {
    warnings.push({
      level: "info",
      message: `${photoCount} fotos seleccionadas. Las re-exportaciones reutilizan imágenes optimizadas en caché.`,
    });
  }

  const videos = input.photos.filter((p) => p.mediaType === "VIDEO");
  if (videos.length > 0) {
    const totalVideoBytes = videos.reduce((sum, p) => sum + (p.fileSizeBytes ?? 0), 0);
    warnings.push({
      level: "info",
      message: `${videos.length} vídeo${videos.length === 1 ? "" : "s"}: el ZIP incluye el original en videos/; el HTML único solo incrusta la miniatura (poster).`,
    });
    if (totalVideoBytes >= 200 * 1024 * 1024) {
      warnings.push({
        level: "warning",
        message: `Los vídeos suman ~${(totalVideoBytes / (1024 * 1024)).toFixed(0)} MB: el ZIP puede ser muy pesado para enviar por móvil.`,
      });
    }
  }

  return warnings;
}
