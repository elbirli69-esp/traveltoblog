import { marked } from "marked";
import JSZip from "jszip";
import path from "path";
import { readFile } from "fs/promises";
import type { Photo, Travel, User } from "@prisma/client";

export type ExportTemplateId = "editorial-clean" | "dark-photo-journey";
export type ExportFormat = "html" | "zip";

export interface MapPoint {
  lat: number;
  lng: number;
  label: string;
  photoPath: string | null;
  date: string;
  emoji?: string;
  kind?: "photo" | "place" | "flight-out" | "flight-in";
}

export interface ExportPhoto {
  id: string;
  url: string;
  localPath: string;
  latitude: number | null;
  longitude: number | null;
  exifDateTime: Date | null;
  alias: string;
  isTransportStart: boolean;
  isTransportEnd: boolean;
}

export interface ExportContext {
  travel: Pick<Travel, "id" | "title" | "startDate" | "endDate" | "journalMarkdown">;
  users: User[];
  photos: ExportPhoto[];
  places?: ExportPlace[];
  template: ExportTemplateId;
}

const TEMPLATE_LABELS: Record<ExportTemplateId, string> = {
  "editorial-clean": "Editorial Clean",
  "dark-photo-journey": "Dark Photo Journey",
};

export function getTemplateLabel(id: ExportTemplateId): string {
  return TEMPLATE_LABELS[id];
}

export function buildFlightMapPoints(photos: ExportPhoto[]): MapPoint[] {
  const points: MapPoint[] = [];

  const outbound = photos.find(
    (p) => p.isTransportStart && p.latitude != null && p.longitude != null
  );
  if (outbound) {
    points.push({
      lat: outbound.latitude!,
      lng: outbound.longitude!,
      label: `Vuelo de ida — ${outbound.alias}`,
      photoPath: outbound.localPath,
      date: (outbound.exifDateTime ?? new Date()).toISOString(),
      emoji: "✈️",
      kind: "flight-out",
    });
  }

  const inbound = photos.find(
    (p) => p.isTransportEnd && p.latitude != null && p.longitude != null
  );
  if (inbound) {
    points.push({
      lat: inbound.latitude!,
      lng: inbound.longitude!,
      label: `Vuelo de vuelta — ${inbound.alias}`,
      photoPath: inbound.localPath,
      date: (inbound.exifDateTime ?? new Date()).toISOString(),
      emoji: "🛬",
      kind: "flight-in",
    });
  }

  return points;
}

export function buildPhotoRoutePoints(photos: ExportPhoto[]): MapPoint[] {
  return photos
    .filter(
      (p) =>
        !p.isTransportStart &&
        !p.isTransportEnd &&
        p.latitude != null &&
        p.longitude != null
    )
    .sort(
      (a, b) =>
        new Date(a.exifDateTime ?? 0).getTime() -
        new Date(b.exifDateTime ?? 0).getTime()
    )
    .map((p, i) => ({
      lat: p.latitude!,
      lng: p.longitude!,
      label: `Foto ${i + 1} — ${p.alias}`,
      photoPath: p.localPath,
      date: (p.exifDateTime ?? new Date()).toISOString(),
      kind: "photo" as const,
    }));
}

/** @deprecated Use buildPhotoRoutePoints — kept for tests/compatibility */
export function buildMapPoints(photos: ExportPhoto[]): MapPoint[] {
  return buildPhotoRoutePoints(photos);
}

export interface ExportPlace {
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  comment: string | null;
  alias: string;
}

export function buildPlaceMapPoints(places: ExportPlace[]): MapPoint[] {
  return places.map((p) => ({
    lat: p.latitude,
    lng: p.longitude,
    label: `${p.name}${p.comment ? ` — ${p.comment}` : ""} (${p.alias})`,
    photoPath: null,
    date: new Date().toISOString(),
    emoji: placeEmojiFromType(p.type),
    kind: "place" as const,
  }));
}

function placeEmojiFromType(type: string): string {
  const map: Record<string, string> = {
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
  return map[type] ?? "📍";
}

export function mergeMapPoints(photos: ExportPhoto[], places: ExportPlace[]): MapPoint[] {
  return [
    ...buildFlightMapPoints(photos),
    ...buildPhotoRoutePoints(photos),
    ...buildPlaceMapPoints(places),
  ];
}

function rewriteMarkdownImagePaths(markdown: string, urlToLocal: Map<string, string>): string {
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
    const local = urlToLocal.get(url) ?? urlToLocal.get(url.replace(/^\//, "")) ?? url;
    return `![${alt}](${local})`;
  });
}

function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

function templateStyles(template: ExportTemplateId): string {
  if (template === "dark-photo-journey") {
    return `
:root {
  --bg: #0b1120;
  --surface: #111827;
  --text: #e5e7eb;
  --muted: #9ca3af;
  --accent: #fbbf24;
  --border: #1f2937;
}
body {
  margin: 0;
  font-family: "Segoe UI", system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.7;
}
.wrap { max-width: 920px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
header { margin-bottom: 2.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; }
h1 { font-size: 2.4rem; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 0.5rem; color: #fff; }
.meta { color: var(--muted); font-size: 0.95rem; }
.map-section { margin: 2rem 0 3rem; }
.map-section h2 { color: var(--accent); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 0.12em; }
#map {
  height: 420px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: #1e293b;
  overflow: hidden;
}
article { font-size: 1.05rem; }
article h2, article h3 { color: #fff; margin-top: 2rem; }
article img { width: 100%; border-radius: 12px; margin: 1.5rem 0; box-shadow: 0 20px 50px rgba(0,0,0,.45); }
article a { color: var(--accent); }
article p { color: #d1d5db; }
footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.85rem; }
.leaflet-container { background: #1e293b !important; font-family: inherit; }
`;
  }

  return `
:root {
  --bg: #fafaf9;
  --text: #1c1917;
  --muted: #78716c;
  --accent: #0d9488;
  --border: #e7e5e4;
}
body {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.75;
}
.wrap { max-width: 760px; margin: 0 auto; padding: 3rem 1.5rem 4rem; }
header { text-align: center; margin-bottom: 2.5rem; padding-bottom: 2rem; border-bottom: 1px solid var(--border); }
h1 { font-size: 2.6rem; font-weight: 400; margin: 0 0 0.75rem; letter-spacing: -0.02em; }
.meta { color: var(--muted); font-size: 0.95rem; font-family: system-ui, sans-serif; }
.map-section { margin: 2.5rem 0; font-family: system-ui, sans-serif; }
.map-section h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--accent); font-weight: 600; }
#map {
  height: 380px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: #f5f5f4;
}
article { font-size: 1.125rem; }
article h2 { font-size: 1.5rem; font-weight: 400; margin-top: 2.5rem; color: var(--text); }
article h3 { font-size: 1.2rem; font-weight: 400; }
article img { width: 100%; border-radius: 4px; margin: 1.75rem 0; }
article p { margin: 1rem 0; }
footer { margin-top: 3rem; text-align: center; color: var(--muted); font-size: 0.85rem; font-family: system-ui, sans-serif; }
.leaflet-container { background: #f5f5f4 !important; }
`;
}

function buildMapScript(points: MapPoint[], assetPrefix = "assets/images"): string {
  const data = JSON.stringify(points);
  return `
(function () {
  var points = ${data};
  if (!points.length || typeof L === "undefined") return;

  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl: "${assetPrefix}/marker-icon.png",
    iconRetinaUrl: "${assetPrefix}/marker-icon-2x.png",
    shadowUrl: "${assetPrefix}/marker-shadow.png"
  });

  var map = L.map("map", { scrollWheelZoom: true, zoomControl: true });
  var flightOut = points.find(function (p) { return p.kind === "flight-out"; });
  var flightIn = points.find(function (p) { return p.kind === "flight-in"; });
  var latLngs = points.filter(function (p) { return p.kind === "photo"; }).map(function (p) { return [p.lat, p.lng]; });
  var bounds = L.latLngBounds(points.map(function (p) { return [p.lat, p.lng]; }));
  map.fitBounds(bounds.pad(0.15));

  if (latLngs.length > 1) {
    L.polyline(latLngs, { color: "#0d9488", weight: 3, opacity: 0.85 }).addTo(map);
  }

  if (flightOut && flightIn) {
    L.polyline(
      [[flightOut.lat, flightOut.lng], [flightIn.lat, flightIn.lng]],
      { color: "#6366f1", weight: 3, opacity: 0.85, dashArray: "10 8" }
    ).addTo(map);
  }

  points.forEach(function (p, i) {
    var marker;
    if (p.emoji) {
      var size = (p.kind === "flight-out" || p.kind === "flight-in") ? "28" : "22";
      var icon = L.divIcon({
        html: '<div style="font-size:' + size + 'px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))">' + p.emoji + '</div>',
        className: "",
        iconSize: [0, 0],
        iconAnchor: [14, 14]
      });
      marker = L.marker([p.lat, p.lng], { icon: icon }).addTo(map);
    } else {
      marker = L.marker([p.lat, p.lng]).addTo(map);
    }
    var popup = "<strong>" + escapeHtml(p.label) + "</strong>";
    if (p.photoPath) {
      popup += '<br><img src="' + escapeHtml(p.photoPath) + '" alt="" style="max-width:180px;margin-top:8px;border-radius:6px">';
    }
    popup += '<br><small>' + new Date(p.date).toLocaleString("es-ES") + "</small>";
    marker.bindPopup(popup);
  });

  function escapeHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
})();
`;
}

export function buildExportHtml(ctx: ExportContext): string {
  const { travel, users, photos, places = [], template } = ctx;
  const mapPoints = mergeMapPoints(photos, places);
  const markdown = travel.journalMarkdown ?? buildFallbackMarkdown(travel, users, photos);
  const urlToLocal = new Map(photos.map((p) => [p.url, p.localPath]));
  const contentHtml = markdownToHtml(rewriteMarkdownImagePaths(markdown, urlToLocal));
  const dateRange = formatDateRange(travel.startDate, travel.endDate);
  const hasMap = mapPoints.length > 0;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(travel.title)} — TravelToBlog</title>
  <link rel="stylesheet" href="assets/leaflet.css">
  <style>${templateStyles(template)}</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${escapeHtml(travel.title)}</h1>
      <p class="meta">${escapeHtml(dateRange)} · ${users.map((u) => escapeHtml(u.alias)).join(", ")}</p>
    </header>
    ${
      hasMap
        ? `<section class="map-section">
      <h2>Recorrido</h2>
      <div id="map"></div>
    </section>`
        : ""
    }
    <article>${contentHtml}</article>
    <footer>Exportado con TravelToBlog · Plantilla ${escapeHtml(getTemplateLabel(template))}</footer>
  </div>
  ${hasMap ? `<script src="assets/leaflet.js"></script><script>${buildMapScript(mapPoints, "assets/images")}</script>` : ""}
</body>
</html>`;
}

function buildFallbackMarkdown(
  travel: Pick<Travel, "title">,
  users: User[],
  photos: ExportPhoto[]
): string {
  const lines = [
    `# ${travel.title}`,
    "",
    `Participantes: ${users.map((u) => u.alias).join(", ")}`,
    "",
    "## Galería del viaje",
    "",
  ];
  for (const photo of photos) {
    lines.push(`![Foto de ${photo.alias}](${photo.localPath})`, "");
  }
  return lines.join("\n");
}

function formatDateRange(start: Date | null, end: Date | null): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(d);
  if (start && end) return `${fmt(start)} — ${fmt(end)}`;
  if (start) return `Desde ${fmt(start)}`;
  if (end) return `Hasta ${fmt(end)}`;
  return "Viaje";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function loadPhotoFiles(
  photos: (Photo & { user: User })[]
): Promise<ExportPhoto[]> {
  const selected = photos.filter((p) => p.selected);
  return Promise.all(
    selected.map(async (photo, index) => {
      const ext = path.extname(photo.filename) || ".jpg";
      const localPath = `photos/${String(index + 1).padStart(3, "0")}${ext}`;
      return {
        id: photo.id,
        url: photo.url,
        localPath,
        latitude: photo.latitude,
        longitude: photo.longitude,
        exifDateTime: photo.exifDateTime,
        alias: photo.user.alias,
        isTransportStart: photo.isTransportStart,
        isTransportEnd: photo.isTransportEnd,
      };
    })
  );
}

export async function readPhotoBuffer(photoUrl: string): Promise<Buffer | null> {
  const relative = photoUrl.startsWith("/") ? photoUrl.slice(1) : photoUrl;
  const filepath = path.join(process.cwd(), "public", relative);
  try {
    return await readFile(filepath);
  } catch {
    return null;
  }
}

async function getLeafletAssets(): Promise<Record<string, Buffer>> {
  const base = path.join(process.cwd(), "node_modules", "leaflet", "dist");
  const files = [
    "leaflet.css",
    "leaflet.js",
    "images/marker-icon.png",
    "images/marker-icon-2x.png",
    "images/marker-shadow.png",
  ];
  const out: Record<string, Buffer> = {};
  for (const file of files) {
    out[file] = await readFile(path.join(base, file));
  }
  return out;
}

/** Fix Leaflet CSS image paths for zip bundle layout */
function patchLeafletCss(css: string): string {
  return css.replace(/url\(([^)]*images\/[^)]+)\)/g, (_m, p) => {
    const filename = path.basename(String(p).replace(/["']/g, ""));
    return `url(images/${filename})`;
  });
}

export async function buildExportZip(ctx: ExportContext): Promise<Buffer> {
  const zip = new JSZip();
  const html = buildExportHtml(ctx);
  zip.file("index.html", html);

  const leaflet = await getLeafletAssets();
  zip.file("assets/leaflet.css", patchLeafletCss(leaflet["leaflet.css"].toString("utf-8")));
  zip.file("assets/leaflet.js", leaflet["leaflet.js"]);
  zip.folder("assets/images")?.file("marker-icon.png", leaflet["images/marker-icon.png"]);
  zip.folder("assets/images")?.file("marker-icon-2x.png", leaflet["images/marker-icon-2x.png"]);
  zip.folder("assets/images")?.file("marker-shadow.png", leaflet["images/marker-shadow.png"]);

  for (const photo of ctx.photos) {
    const buf = await readPhotoBuffer(photo.url);
    if (buf) zip.file(photo.localPath, buf);
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function buildSingleFileHtml(ctx: ExportContext): Promise<Buffer> {
  const zipBuffer = await buildExportZip(ctx);
  const zip = await JSZip.loadAsync(zipBuffer);
  const leafletCss = await zip.file("assets/leaflet.css")!.async("string");
  const leafletJs = await zip.file("assets/leaflet.js")!.async("string");
  const markerIcon = await zip.file("assets/images/marker-icon.png")!.async("base64");
  const markerIcon2x = await zip.file("assets/images/marker-icon-2x.png")!.async("base64");
  const markerShadow = await zip.file("assets/images/marker-shadow.png")!.async("base64");

  let html = await zip.file("index.html")!.async("string");
  html = html.replace(
    '<link rel="stylesheet" href="assets/leaflet.css">',
    `<style>${leafletCss}
.leaflet-marker-icon { background-image: url(data:image/png;base64,${markerIcon}) !important; }
.leaflet-marker-icon.leaflet-marker-icon-2x { background-image: url(data:image/png;base64,${markerIcon2x}) !important; }
.leaflet-marker-shadow { background-image: url(data:image/png;base64,${markerShadow}) !important; }
</style>`
  );

  const photoDataUrls = new Map<string, string>();
  for (const photo of ctx.photos) {
    const file = zip.file(photo.localPath);
    if (!file) continue;
    const b64 = await file.async("base64");
    const ext = path.extname(photo.localPath).toLowerCase();
    const mime =
      ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    photoDataUrls.set(photo.localPath, `data:${mime};base64,${b64}`);
  }

  for (const [localPath, dataUrl] of photoDataUrls) {
    html = html.split(localPath).join(dataUrl);
  }

  const mapPoints = buildMapPoints(ctx.photos).map((p) => ({
    ...p,
    photoPath: p.photoPath ? photoDataUrls.get(p.photoPath) ?? p.photoPath : null,
  }));

  const iconScript = `delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "data:image/png;base64,${markerIcon}",
  iconRetinaUrl: "data:image/png;base64,${markerIcon2x}",
  shadowUrl: "data:image/png;base64,${markerShadow}"
});`;

  const mapScriptBody = buildMapScript(mapPoints, "assets/images")
    .replace(
      /delete L\.Icon\.Default\.prototype\._getIconUrl;[\s\S]*?}\);/,
      iconScript
    );

  html = html.replace(
    /<script src="assets\/leaflet.js"><\/script><script>[\s\S]*?<\/script>/,
    `<script>${leafletJs}\n${mapScriptBody}</script>`
  );

  return Buffer.from(html, "utf-8");
}
