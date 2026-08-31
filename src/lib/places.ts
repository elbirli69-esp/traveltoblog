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
