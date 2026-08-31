type MapboxGL = typeof import("mapbox-gl").default;

let mapboxPromise: Promise<MapboxGL> | null = null;

export const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || "";

/** Same light streets style used by DogTrainer (dogaze). */
export const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";

export function loadMapbox(): Promise<MapboxGL> {
  if (!mapboxPromise) {
    mapboxPromise = import("mapbox-gl").then((module) => module.default);
  }
  return mapboxPromise;
}

export function createEmojiMarkerElement(
  emoji: string,
  sizePx = 28
): HTMLDivElement {
  const el = document.createElement("div");
  el.style.fontSize = `${sizePx}px`;
  el.style.lineHeight = "1";
  el.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,.35))";
  el.style.cursor = "pointer";
  el.textContent = emoji;
  return el;
}
