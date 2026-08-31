import type { PlaceType } from "@prisma/client";

export const PLACE_TYPE_EMOJI: Record<PlaceType, string> = {
  HOTEL: "🏨",
  RESTAURANT: "🍽️",
  CAFE: "☕",
  MUSEUM: "🏛️",
  PARK: "🌳",
  BEACH: "🏖️",
  VIEWPOINT: "🏔️",
  TRANSPORT: "✈️",
  SHOP: "🛍️",
  OTHER: "📍",
};

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  HOTEL: "Hotel / alojamiento",
  RESTAURANT: "Restaurante",
  CAFE: "Cafetería",
  MUSEUM: "Museo / cultura",
  PARK: "Parque / naturaleza",
  BEACH: "Playa",
  VIEWPOINT: "Mirador",
  TRANSPORT: "Transporte",
  SHOP: "Tienda",
  OTHER: "Otro",
};

export const PLACE_TYPES = Object.keys(PLACE_TYPE_LABELS) as PlaceType[];

export function placeEmoji(type: PlaceType): string {
  return PLACE_TYPE_EMOJI[type] ?? "📍";
}

export function placeLabel(type: PlaceType): string {
  return PLACE_TYPE_LABELS[type] ?? "Otro";
}

/** CartoDB Voyager — same tile set referenced in the product plan */
export const MAP_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export type GeolocationFailure =
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "insecure";

export function isGeolocationSecureContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext === true;
}

export function geolocationErrorMessage(code: GeolocationFailure): string {
  const messages: Record<GeolocationFailure, string> = {
    unsupported: "Tu navegador no soporta geolocalización",
    denied: "Permiso de ubicación denegado. Actívalo en los ajustes del navegador.",
    unavailable: "No se pudo obtener tu ubicación",
    timeout: "Tiempo agotado al buscar tu ubicación",
    insecure:
      "El GPS del móvil solo funciona por HTTPS. Abre TravelToBlog con la URL segura de Tailscale (no con http://100.x…).",
  };
  return messages[code];
}

export function getCurrentPosition(
  options?: PositionOptions
): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unsupported" satisfies GeolocationFailure));
      return;
    }

    if (!isGeolocationSecureContext()) {
      reject(new Error("insecure" satisfies GeolocationFailure));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("denied" satisfies GeolocationFailure));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new Error("unavailable" satisfies GeolocationFailure));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error("timeout" satisfies GeolocationFailure));
        } else {
          reject(new Error("unavailable" satisfies GeolocationFailure));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
        ...options,
      }
    );
  });
}

export function computeMapCenter(
  places: { latitude: number; longitude: number }[],
  photos: { latitude: number | null; longitude: number | null }[]
): [number, number] {
  const coords: [number, number][] = [
    ...places.map((p) => [p.latitude, p.longitude] as [number, number]),
    ...photos
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => [p.latitude!, p.longitude!] as [number, number]),
  ];

  if (coords.length === 0) return [40.4168, -3.7038];

  const lat = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
  const lng = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
  return [lat, lng];
}
