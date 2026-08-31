export const FLIGHT_OUT_EMOJI = "✈️";
export const FLIGHT_IN_EMOJI = "🛬";

export interface FlightLegPhoto {
  id: string;
  url: string;
  latitude: number | null;
  longitude: number | null;
  isTransportStart: boolean;
  isTransportEnd: boolean;
  exifDateTime: string | null;
  user: { alias: string };
}

export interface FlightLeg {
  kind: "out" | "in";
  label: string;
  emoji: string;
  photo: FlightLegPhoto;
  hasGps: boolean;
}

export function resolveFlightLegs(photos: FlightLegPhoto[]): {
  outbound: FlightLeg | null;
  inbound: FlightLeg | null;
} {
  const outboundPhoto = photos.find((p) => p.isTransportStart) ?? null;
  const inboundPhoto = photos.find((p) => p.isTransportEnd) ?? null;

  return {
    outbound: outboundPhoto
      ? {
          kind: "out",
          label: "Vuelo de ida",
          emoji: FLIGHT_OUT_EMOJI,
          photo: outboundPhoto,
          hasGps: outboundPhoto.latitude != null && outboundPhoto.longitude != null,
        }
      : null,
    inbound: inboundPhoto
      ? {
          kind: "in",
          label: "Vuelo de vuelta",
          emoji: FLIGHT_IN_EMOJI,
          photo: inboundPhoto,
          hasGps: inboundPhoto.latitude != null && inboundPhoto.longitude != null,
        }
      : null,
  };
}

export function formatFlightDate(iso: string | null): string {
  if (!iso) return "Sin fecha EXIF";
  return new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** GPS reference points excluding transport legs (shown separately). */
export function photoGpsPoints(
  photos: { latitude: number | null; longitude: number | null; isTransportStart?: boolean; isTransportEnd?: boolean }[]
) {
  return photos.filter(
    (p) =>
      p.latitude != null &&
      p.longitude != null &&
      !p.isTransportStart &&
      !p.isTransportEnd
  );
}
