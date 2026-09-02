import {
  MAPBOX_STYLE_DARK,
  MAPBOX_STYLE_LIGHT,
  MAPBOX_TOKEN,
} from "@/lib/mapbox";

export type ExportMapTemplateId =
  | "magazine"
  | "visual-journey"
  | "editorial-clean"
  | "dark-photo-journey";

export interface ExportMapTileLayerConfig {
  url: string;
  attribution: string;
  options: Record<string, string | number>;
}

function mapboxStylePath(styleUrl: string): string {
  return styleUrl.replace(/^mapbox:\/\/styles\//, "");
}

export function resolveExportMapboxStyle(template: ExportMapTemplateId): string {
  if (template === "dark-photo-journey") {
    return MAPBOX_STYLE_DARK;
  }
  return MAPBOX_STYLE_LIGHT;
}

export function getExportMapTileLayerConfig(
  template: ExportMapTemplateId = "magazine"
): ExportMapTileLayerConfig {
  const token = MAPBOX_TOKEN;
  if (token) {
    const stylePath = mapboxStylePath(resolveExportMapboxStyle(template));
    return {
      url: `https://api.mapbox.com/styles/v1/${stylePath}/tiles/512/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(token)}`,
      attribution:
        '&copy; <a href="https://www.mapbox.com/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      options: { tileSize: 512, zoomOffset: -1, maxZoom: 22 },
    };
  }

  return {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    options: { maxZoom: 19 },
  };
}

/** Leaflet tile layer init for embedded export maps (Mapbox when token is set). */
export function buildMapTileLayerScript(template: ExportMapTemplateId = "magazine"): string {
  const { url, attribution, options } = getExportMapTileLayerConfig(template);
  return `L.tileLayer(${JSON.stringify(url)}, Object.assign(${JSON.stringify(options)}, { attribution: ${JSON.stringify(attribution)} })).addTo(map);`;
}
