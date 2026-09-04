import { marked } from "marked";
import JSZip from "jszip";
import path from "path";
import { readFile } from "fs/promises";
import type { Photo, Travel, TravelType, User } from "@prisma/client";
import { formatDateKey, isoToDateKey } from "@/lib/travel-dates";
import { buildTimeline, type TimelineEvent } from "@/lib/timeline";
import { resolveTravelType } from "@/lib/export/detect-travel-type";
import { getTypologyProfile } from "@/lib/export/typologies/registry";
import { simplifyIfNeeded } from "@/lib/export/polyline";
import { distanceMeters } from "@/lib/geo";
import {
  buildGpsTrailPolylines,
  gpsTrailMapColor,
  gpsTrailsHaveGeometry,
  selectExportGpsTracks,
  type GpsTrailPolyline,
} from "@/lib/gps-track-map";
import {
  buildDayLegend,
  buildDirectRouteGeometry,
  buildRouteNodesFromPhotosAndPlaces,
  coalesceRouteNodes,
  resolveDayLegend,
  resolveSegmentedRouteGeometry,
  type SegmentedRouteGeometry,
} from "@/lib/mapbox-route";
import { isValidGps, sanitizeGpsPair } from "@/lib/exif";
import { compareHighlightScore } from "@/lib/highlight-score";
import { resolvePhotoExifFromFile } from "@/lib/photo-gps";
import {
  buildFlightsSectionHtml,
  buildPlayModeScript,
  buildPlayModeSectionHtml,
  buildStatsSectionHtml,
  buildTimelineSectionHtml,
  buildTimelineSyncScript,
  playModeStyles,
  timelineExportStyles,
} from "@/lib/export/timeline-html";
import {
  extractJournalStoryProse,
  resolveDayNarrativeHtml,
} from "@/lib/export/journal-prose";
import {
  buildClosingSectionHtml,
  buildHeadMeta,
  buildMagazineHero,
  buildMagazineInteractiveScript,
  buildMagazineNav,
  buildPlaceCalloutsHtml,
  buildTocHtml,
  extractDeck,
  findTripNote,
  magazineStyles,
} from "@/lib/export/magazine-html";
import { buildGallerySection, galleryExportStyles } from "@/lib/export/gallery-html";
import { buildMapTileLayerScript } from "@/lib/export/map-tiles";
import { fetchHtmlStaticMapImages } from "@/lib/export-html-map";
import { exportPhotoPaths, EXPORT_IMAGE_MIME } from "@/lib/export-images";
import { getOrCreateExportImageSet } from "@/lib/export-image-cache";
import {
  buildExportPhotoBootScript,
  buildExportPhotoRegistryScript,
} from "@/lib/export-photo-html";
import type { ExportProgressCallback } from "@/lib/export-pipeline";

export type ExportTypologyId = TravelType | "auto";
export type ExportTemplateId = "magazine" | "visual-journey" | "editorial-clean" | "dark-photo-journey";
export type ExportFormat = "html" | "zip";

export interface MapPoint {
  lat: number;
  lng: number;
  label: string;
  photoPath: string | null;
  /** Extra thumbs for place popups (nearby or assigned photos). */
  photoPaths?: string[];
  date: string;
  emoji?: string;
  kind?: "photo" | "place" | "flight-out" | "flight-in";
  dayKey?: string;
  dayLabel?: string;
  placeId?: string;
  placeType?: string;
}

export interface ExportMapDayGroup {
  id: string;
  label: string;
  bounds: [[number, number], [number, number]] | null;
  photoCount: number;
}

export interface ExportPhoto {
  id: string;
  url: string;
  /** Optimized JPEG for lightbox, hero and crónica (~1600px). */
  localPath: string;
  /** Small JPEG for grids, timeline and map popups (~480px). */
  thumbPath: string;
  latitude: number | null;
  longitude: number | null;
  /** Explicit place link for guía categories (preferred over GPS proximity). */
  placeId?: string | null;
  mediaType?: "IMAGE" | "VIDEO";
  durationMs?: number | null;
  /** Relative path inside ZIP for original video (not embedded in single HTML). */
  videoPath?: string | null;
  /** Disk URL for poster still (videos) or original image. */
  exportSourceUrl?: string;
  exifDateTime: Date | null;
  alias: string;
  isTransportStart: boolean;
  isTransportEnd: boolean;
  /** 0–10 prominence (5 = neutral) */
  highlightScore: number;
}

export interface ExportContext {
  travel: Pick<
    Travel,
    "id" | "title" | "startDate" | "endDate" | "journalMarkdown" | "travelType"
  >;
  users: User[];
  photos: ExportPhoto[];
  /** All travel photos with GPS for the interactive map (may exceed `photos` when only a subset is exported). */
  mapPhotos?: ExportPhoto[];
  places?: ExportPlace[];
  notes?: ExportNote[];
  gpsTracks?: ExportGpsTrack[];
  template: ExportTemplateId;
  typology?: ExportTypologyId;
  includeGpsTrail?: boolean;
  /** Precomputed road + flight segments for the interactive map (from Mapbox Directions). */
  mapRouteGeometry?: SegmentedRouteGeometry;
  /** Static Mapbox PNG for offline fallback (destination / combined). */
  mapStaticLocalPath?: string | null;
  /** Static Mapbox PNG for flight overview when dual maps apply. */
  mapStaticFlightPath?: string | null;
}

export function getExportMapPhotos(ctx: ExportContext): ExportPhoto[] {
  return ctx.mapPhotos ?? ctx.photos;
}

const TEMPLATE_LABELS: Record<ExportTemplateId, string> = {
  magazine: "Magazine",
  "visual-journey": "Visual Journey",
  "editorial-clean": "Editorial Clean",
  "dark-photo-journey": "Dark Photo Journey",
};

export function getTemplateLabel(id: ExportTemplateId): string {
  return TEMPLATE_LABELS[id];
}

export function buildFlightMapPoints(photos: ExportPhoto[]): MapPoint[] {
  const points: MapPoint[] = [];

  const outbound = photos.find(
    (p) =>
      p.isTransportStart &&
      isValidGps(p.latitude, p.longitude)
  );
  if (outbound) {
    points.push({
      lat: outbound.latitude!,
      lng: outbound.longitude!,
      label: `Vuelo de ida — ${outbound.alias}`,
      photoPath: outbound.thumbPath,
      date: (outbound.exifDateTime ?? new Date()).toISOString(),
      emoji: "✈️",
      kind: "flight-out",
    });
  }

  const inbound = photos.find(
    (p) =>
      p.isTransportEnd &&
      isValidGps(p.latitude, p.longitude)
  );
  if (inbound) {
    points.push({
      lat: inbound.latitude!,
      lng: inbound.longitude!,
      label: `Vuelo de vuelta — ${inbound.alias}`,
      photoPath: inbound.thumbPath,
      date: (inbound.exifDateTime ?? new Date()).toISOString(),
      emoji: "🛬",
      kind: "flight-in",
    });
  }

  return points;
}

export function buildPhotoRoutePoints(photos: ExportPhoto[]): MapPoint[] {
  const raw = photos
    .filter(
      (p) =>
        !p.isTransportStart &&
        !p.isTransportEnd &&
        isValidGps(p.latitude, p.longitude)
    )
    .sort(
      (a, b) =>
        new Date(a.exifDateTime ?? 0).getTime() -
        new Date(b.exifDateTime ?? 0).getTime()
    );

  const coords = simplifyIfNeeded(
    raw.map((p) => ({ lat: p.latitude!, lng: p.longitude! }))
  );
  const simplified =
    coords.length < raw.length
      ? raw.filter((p) =>
          coords.some(
            (c) =>
              Math.abs(c.lat - p.latitude!) < 1e-6 && Math.abs(c.lng - p.longitude!) < 1e-6
          )
        )
      : raw;

  return simplified.map((p, i) => {
    const dayKey = p.exifDateTime ? isoToDateKey(p.exifDateTime.toISOString()) : undefined;
    return {
      lat: p.latitude!,
      lng: p.longitude!,
      label: `Foto ${i + 1} — ${p.alias}`,
      photoPath: p.thumbPath,
      date: (p.exifDateTime ?? new Date()).toISOString(),
      kind: "photo" as const,
      dayKey,
      dayLabel: dayKey ? formatDateKey(dayKey) : undefined,
    };
  });
}

/** @deprecated Use buildPhotoRoutePoints — kept for tests/compatibility */
export function buildMapPoints(photos: ExportPhoto[]): MapPoint[] {
  return buildPhotoRoutePoints(photos);
}

export interface ExportPlace {
  id?: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  comment: string | null;
  alias: string;
  visitedAt?: Date | string | null;
  highlightScore?: number;
}

export interface ExportNote {
  id: string;
  type: string;
  text: string;
  dayDate: Date | null;
  photoId: string | null;
  placeId: string | null;
  createdAt: Date;
  alias: string;
}

export interface ExportGpsTrack {
  id: string;
  points: { lat: number; lng: number; at: string }[];
  includeInExport: boolean;
  alias: string;
  startedAt: Date;
}

const PLACE_PHOTO_RADIUS_M = 500;

export function photosForPlace(
  place: Pick<ExportPlace, "id" | "latitude" | "longitude">,
  photos: ExportPhoto[]
): ExportPhoto[] {
  const linked = photos.filter(
    (p) =>
      place.id &&
      p.placeId === place.id &&
      !p.isTransportStart &&
      !p.isTransportEnd
  );
  if (linked.length > 0) return linked;

  const candidates = photos.filter(
    (p) =>
      !p.isTransportStart &&
      !p.isTransportEnd &&
      isValidGps(p.latitude, p.longitude)
  );

  return candidates
    .map((photo) => ({
      photo,
      distanceM: distanceMeters(
        place.latitude,
        place.longitude,
        photo.latitude!,
        photo.longitude!
      ),
    }))
    .filter(
      ({ photo, distanceM }) =>
        distanceM <= PLACE_PHOTO_RADIUS_M ||
        (Math.abs(photo.latitude! - place.latitude) < 1e-5 &&
          Math.abs(photo.longitude! - place.longitude) < 1e-5)
    )
    .sort((a, b) => a.distanceM - b.distanceM)
    .map(({ photo }) => photo);
}

export function buildPlaceMapPoints(
  places: ExportPlace[],
  photos: ExportPhoto[] = []
): MapPoint[] {
  return places
    .filter((p) => isValidGps(p.latitude, p.longitude))
    .map((p) => {
      const linked = photosForPlace(p, photos);
      const photoPaths = linked.slice(0, 4).map((photo) => photo.thumbPath);
      const dayKey = p.visitedAt
        ? isoToDateKey(new Date(p.visitedAt).toISOString())
        : undefined;

      return {
        lat: p.latitude,
        lng: p.longitude,
        label: `${p.name}${p.comment ? ` — ${p.comment}` : ""} (${p.alias})`,
        photoPath: photoPaths[0] ?? null,
        photoPaths: photoPaths.length ? photoPaths : undefined,
        date: (p.visitedAt ? new Date(p.visitedAt) : new Date()).toISOString(),
        emoji: placeEmojiFromType(p.type),
        kind: "place" as const,
        placeId: p.id,
        placeType: p.type,
        dayKey,
        dayLabel: dayKey ? formatDateKey(dayKey) : undefined,
      };
    });
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
    ...buildPlaceMapPoints(places, photos),
  ];
}

function buildExportRouteNodes(
  photos: ExportPhoto[],
  places: ExportPlace[]
) {
  return coalesceRouteNodes(
    buildRouteNodesFromPhotosAndPlaces(
      photos.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        exifDateTime: p.exifDateTime,
        isTransportStart: p.isTransportStart,
        isTransportEnd: p.isTransportEnd,
      })),
      places
        .filter((p) => isValidGps(p.latitude, p.longitude))
        .map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
          visitedAt: p.visitedAt ?? null,
        }))
    )
  );
}

export async function prepareExportMapRouteGeometry(
  ctx: ExportContext
): Promise<ExportContext> {
  if (!exportHasMap(ctx)) return ctx;

  const mapPhotos = getExportMapPhotos(ctx);
  const nodes = buildExportRouteNodes(mapPhotos, ctx.places ?? []);
  if (nodes.length < 2) return ctx;

  const geometry = await resolveSegmentedRouteGeometry(nodes);
  if (!geometry) return ctx;

  return { ...ctx, mapRouteGeometry: geometry };
}

type LeafletRouteSegments = {
  roadSegments: {
    coords: [number, number][];
    color: string;
    dayKey: string | null;
    label: string;
  }[];
  flightLegs: [number, number][][];
  dayLegend: { dayKey: string | null; dayIndex: number; color: string; label: string }[];
};

function toLeafletRouteSegments(geometry: SegmentedRouteGeometry): LeafletRouteSegments {
  const roadSegments = geometry.roadSegments.map((seg) => ({
    coords: seg.coordinates.map((p) => [p.lat, p.lng] as [number, number]),
    color: seg.color,
    dayKey: seg.dayKey,
    label: seg.label,
  }));
  return {
    roadSegments,
    flightLegs: geometry.flightLegs.map((leg) =>
      leg.map((p) => [p.lat, p.lng] as [number, number])
    ),
    dayLegend: resolveDayLegend(geometry.dayLegend, geometry.roadSegments),
  };
}

function fallbackLeafletRouteSegments(
  photos: ExportPhoto[],
  places: ExportPlace[]
): LeafletRouteSegments {
  const nodes = buildExportRouteNodes(photos, places);
  const direct = buildDirectRouteGeometry(nodes);
  if (direct) return toLeafletRouteSegments(direct);
  return {
    roadSegments: [],
    flightLegs: [],
    dayLegend: buildDayLegend(nodes),
  };
}

function resolveLeafletRouteSegments(
  ctx: ExportContext,
  photos: ExportPhoto[],
  places: ExportPlace[]
): LeafletRouteSegments {
  if (ctx.mapRouteGeometry) {
    return toLeafletRouteSegments(ctx.mapRouteGeometry);
  }
  return fallbackLeafletRouteSegments(photos, places);
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

function pickCoverPhoto(photos: ExportPhoto[]): ExportPhoto | null {
  const candidates = photos.filter((p) => !p.isTransportStart && !p.isTransportEnd);
  const pool = candidates.length > 0 ? candidates : photos;
  if (pool.length === 0) return null;
  return [...pool].sort(
    (a, b) => compareHighlightScore(a.highlightScore, b.highlightScore)
  )[0];
}

function enhanceArticleHtml(html: string): string {
  let out = html
    .replace(/<h2([^>]*)>/g, '<h2 class="section-title"$1>')
    .replace(/<h3([^>]*)>/g, '<h3 class="day-marker"$1>')
    .replace(/<blockquote([^>]*)>/g, '<blockquote class="pull-quote"$1>')
    .replace(/<hr\s*\/?>/g, '<hr class="section-divider">');

  out = out.replace(/<img([^>]*?)src="([^"]+)"([^>]*)>/g, (_match, before, src, after) => {
    const altMatch = `${before}${after}`.match(/alt="([^"]*)"/);
    const alt = altMatch?.[1] ?? "Foto del viaje";
    return `<figure class="photo-block reveal"><div class="photo-frame"><img${before}src="${src}"${after} loading="lazy"></div><figcaption>${escapeHtml(alt)}</figcaption></figure>`;
  });

  return out.replace(/<p>\*([^*]+)\*<\/p>/g, '<p class="photo-credit">$1</p>');
}

function buildInteractiveScripts(template: ExportTemplateId): string {
  if (template === "editorial-clean") return "";

  return `
(function () {
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        revealBlock(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { observer.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("visible"); });
  }

  function revealBlock(el) {
    if (!el) return;
    el.classList.add("visible");
    el.querySelectorAll(".reveal").forEach(function (child) { child.classList.add("visible"); });
    if (el.id === "mapa" && window.__refreshTravelMap) {
      setTimeout(function () { window.__refreshTravelMap(); }, 80);
    }
  }

  document.querySelectorAll(".reveal.visible, .photo-block").forEach(function (el) {
    el.classList.add("visible");
  });
  setTimeout(function () {
    document.querySelectorAll(".reveal, .photo-block").forEach(function (el) {
      el.classList.add("visible");
    });
  }, 400);

  function scrollToAnchor(id) {
    var target = document.querySelector(id);
    if (!target) return;
    revealBlock(target);
    var nav = document.querySelector(".mag-section-nav, .section-nav");
    var offset = (nav ? nav.offsetHeight : 0) + 8;
    var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  document.querySelectorAll(".mag-section-nav, .section-nav").forEach(function (nav) {
    window.addEventListener("scroll", function () {
      nav.classList.toggle("scrolled", window.scrollY > 80);
    }, { passive: true });
    nav.querySelectorAll("a[href^='#']").forEach(function (link) {
      link.addEventListener("click", function (e) {
        var id = link.getAttribute("href");
        if (!id || id === "#") return;
        if (!document.querySelector(id)) return;
        e.preventDefault();
        scrollToAnchor(id);
        if (history.replaceState) history.replaceState(null, "", id);
      });
    });
  });

  if (location.hash) {
    window.addEventListener("load", function () {
      setTimeout(function () { scrollToAnchor(location.hash); }, 120);
    });
  }
})();
`;
}

export function mapExportStyles(): string {
  return `
.map-explorer {
  margin: 0 calc(50% - 50vw);
  width: 100vw;
  max-width: 100vw;
  padding: 2.5rem 1.25rem 1.5rem;
  background: linear-gradient(180deg, rgba(13,148,136,.08) 0%, transparent 100%);
}
.map-explorer-header {
  max-width: 1400px;
  margin: 0 auto 1.25rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
}
.map-explorer-header h2 {
  margin: 0 0 .35rem;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text);
}
.map-explorer-body {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 1rem;
  min-height: min(78vh, 720px);
}
.map-sidebar {
  display: flex;
  flex-direction: column;
  gap: .5rem;
  max-height: min(78vh, 720px);
  overflow-y: auto;
  padding: .75rem;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.map-day-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: .2rem;
  width: 100%;
  padding: .85rem 1rem;
  border: 1px solid transparent;
  border-radius: 12px;
  background: rgba(0,0,0,.03);
  color: var(--text);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background .2s, border-color .2s;
}
.map-day-item:hover { background: rgba(13,148,136,.06); }
.map-day-item.active {
  background: rgba(13,148,136,.12);
  border-color: rgba(13,148,136,.35);
}
.map-day-label { font-weight: 600; font-size: .92rem; }
.map-day-meta { font-size: .75rem; color: var(--muted); }
.map-canvas,
#map.map-canvas {
  height: min(78vh, 720px);
  min-height: 400px;
  border-radius: 16px;
  overflow: hidden;
  background: #292524;
  border: 1px solid var(--border);
  box-shadow: 0 25px 50px rgba(0,0,0,.12);
}
.map-section {
  margin: 2.5rem -1.25rem;
  padding: 0 1.25rem 1.5rem;
}
.map-section-inner {
  padding: 1.5rem;
  border-radius: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 25px 50px rgba(0,0,0,.08);
}
.map-section h2 {
  margin: 0 0 .35rem;
  font-size: .8rem;
  text-transform: uppercase;
  letter-spacing: .14em;
  color: var(--accent);
}
.map-lead { margin: 0 0 1rem; color: var(--muted); font-size: .9rem; }
.map-legend {
  display: flex;
  flex-wrap: wrap;
  gap: .75rem 1.25rem;
  margin-bottom: 1rem;
  font-size: .8rem;
  color: var(--muted);
}
.map-legend span { display: inline-flex; align-items: center; gap: .35rem; }
.legend-line { display: inline-block; width: 22px; height: 3px; border-radius: 2px; background: #0d9488; }
.legend-route { display: inline-block; width: 22px; height: 0; border-top: 3px dashed #f59e0b; }
.legend-dash { display: inline-block; width: 22px; height: 0; border-top: 3px dashed #818cf8; }
.legend-gps { display: inline-block; width: 22px; height: 0; border-top: 3px dotted #64748b; }
.map-frame-wrap { position: relative; }
.map-static-fallback {
  display: none;
  width: 100%;
  height: auto;
  max-height: min(62vh, 520px);
  object-fit: cover;
  border-radius: 14px;
  background: #292524;
}
.map-static-fallback.is-visible { display: block; }
.map-offline-note {
  display: none;
  margin: .65rem 0 0;
  font-size: .8rem;
  color: var(--muted);
}
.map-offline-note.is-visible { display: block; }
#map {
  height: min(62vh, 520px);
  min-height: 320px;
  border-radius: 14px;
  overflow: hidden;
  background: #292524;
}
#map.map-canvas--hidden { display: none; }
.route-pin-wrap { background: none; border: none; }
.route-pin {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, #2dd4bf, #0d9488);
  color: #042f2e;
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 4px 14px rgba(45,212,191,.45);
  border: 2px solid rgba(255,255,255,.85);
}
.place-pin-wrap { background: none; border: none; }
.place-pin {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: rgba(255,255,255,.95);
  font-size: 18px;
  line-height: 1;
  box-shadow: 0 4px 16px rgba(0,0,0,.28);
  border: 2px solid rgba(245,158,11,.75);
}
.map-load-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  padding: 1.5rem;
  text-align: center;
  color: var(--muted);
  font-family: system-ui, sans-serif;
  font-size: .92rem;
  line-height: 1.5;
}
@media (max-width: 900px) {
  .map-explorer-body { grid-template-columns: 1fr; min-height: auto; }
  .map-sidebar { max-height: 220px; }
  .map-canvas, #map.map-canvas { height: min(55vh, 480px); min-height: 320px; }
}
`;
}

function templateStyles(template: ExportTemplateId): string {
  if (template === "magazine") {
    return magazineStyles();
  }
  if (template === "visual-journey") {
    return `
:root {
  --bg: #0c0a09;
  --surface: #1c1917;
  --text: #fafaf9;
  --muted: #a8a29e;
  --accent: #2dd4bf;
  --accent-2: #f59e0b;
  --border: rgba(255,255,255,.08);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.65;
}
.hero {
  position: relative;
  min-height: 72vh;
  display: flex;
  align-items: flex-end;
  background: linear-gradient(135deg, #134e4a 0%, #0c0a09 50%, #1e1b4b 100%);
  background-size: cover;
  background-position: center;
  overflow: hidden;
}
.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(12,10,9,.92) 0%, rgba(12,10,9,.35) 55%, rgba(12,10,9,.15) 100%);
}
.hero-content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 3rem 1.5rem 2.5rem;
}
.hero-badge {
  display: inline-block;
  padding: .35rem .85rem;
  border-radius: 999px;
  background: rgba(45,212,191,.15);
  border: 1px solid rgba(45,212,191,.35);
  color: var(--accent);
  font-size: .75rem;
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  margin-bottom: 1rem;
}
.hero h1 {
  font-size: clamp(2.2rem, 6vw, 3.8rem);
  font-weight: 800;
  letter-spacing: -.03em;
  line-height: 1.05;
  margin: 0 0 .75rem;
  text-shadow: 0 4px 30px rgba(0,0,0,.4);
}
.hero-meta { color: var(--muted); font-size: 1.05rem; margin: 0 0 1.5rem; }
.hero-stats {
  display: flex;
  flex-wrap: wrap;
  gap: .75rem;
}
.stat-pill {
  padding: .5rem 1rem;
  border-radius: 999px;
  background: rgba(255,255,255,.06);
  border: 1px solid var(--border);
  font-size: .85rem;
  backdrop-filter: blur(8px);
}
.section-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  gap: .5rem;
  padding: .75rem 1.25rem;
  background: rgba(12,10,9,.75);
  border-bottom: 1px solid transparent;
  backdrop-filter: blur(12px);
  overflow-x: auto;
  transition: border-color .2s, background .2s;
}
.section-nav.scrolled { border-bottom-color: var(--border); background: rgba(12,10,9,.92); }
.section-nav a {
  color: var(--muted);
  text-decoration: none;
  font-size: .85rem;
  font-weight: 600;
  white-space: nowrap;
  padding: .4rem .85rem;
  border-radius: 999px;
  transition: color .2s, background .2s;
}
.section-nav a:hover { color: var(--text); background: rgba(255,255,255,.06); }
.wrap { max-width: 920px; margin: 0 auto; padding: 0 1.25rem 4rem; }
${mapExportStyles().replace(/rgba\(13,148,136/g, "rgba(45,212,191").replace(/#0d9488/g, "#2dd4bf")}
.map-explorer {
  background: linear-gradient(180deg, rgba(28,25,23,.55) 0%, transparent 100%);
}
.map-day-item { background: rgba(255,255,255,.03); }
.map-day-item:hover { background: rgba(255,255,255,.06); }
.map-day-item.active {
  background: rgba(45,212,191,.12);
  border-color: rgba(45,212,191,.35);
}
.map-canvas, #map.map-canvas { box-shadow: 0 25px 50px rgba(0,0,0,.3); }
.map-section-inner { box-shadow: 0 25px 50px rgba(0,0,0,.25); }
.legend-line { background: #2dd4bf; }
.timeline-section { margin: 2rem 0 2.5rem; }
.timeline-lead { color: var(--muted); margin: -.25rem 0 1.25rem; font-size: .9rem; }
.timeline-track {
  display: flex;
  gap: .75rem;
  overflow-x: auto;
  padding-bottom: .5rem;
  scroll-snap-type: x mandatory;
}
.timeline-chip {
  flex: 0 0 auto;
  min-width: 180px;
  padding: 1rem 1.1rem;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  scroll-snap-align: start;
}
.timeline-day { display: block; font-weight: 700; color: #fde68a; font-size: .95rem; }
.timeline-meta { display: block; margin-top: .35rem; font-size: .8rem; color: var(--muted); }
article { font-size: 1.08rem; padding-top: 1rem; }
article .section-title {
  font-size: 1.6rem;
  font-weight: 700;
  margin: 2.5rem 0 1.25rem;
  padding-bottom: .5rem;
  border-bottom: 2px solid rgba(45,212,191,.3);
}
article .day-marker {
  position: relative;
  font-size: 1.25rem;
  font-weight: 700;
  margin: 2rem 0 1rem;
  padding-left: 1rem;
  border-left: 4px solid var(--accent-2);
  color: #fde68a;
}
article .section-divider {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border), transparent);
  margin: 2.5rem 0;
}
article .pull-quote {
  margin: 1.75rem 0;
  padding: 1.25rem 1.5rem;
  border-left: 4px solid var(--accent);
  background: rgba(45,212,191,.08);
  border-radius: 0 12px 12px 0;
  font-size: 1.05rem;
  font-style: italic;
  color: #e7e5e4;
}
article p { margin: 1rem 0; color: #d6d3d1; }
article .photo-credit { text-align: center; font-size: .85rem; color: var(--muted); font-style: italic; }
.photo-block {
  margin: 2rem 0;
  opacity: 1;
  transform: none;
}
.photo-block.visible { opacity: 1; transform: translateY(0); }
.photo-frame {
  border-radius: 16px;
  overflow: hidden;
  cursor: zoom-in;
  box-shadow: 0 20px 50px rgba(0,0,0,.45);
  transition: transform .35s ease, box-shadow .35s ease;
}
.photo-frame:hover { transform: scale(1.015); box-shadow: 0 28px 60px rgba(0,0,0,.55); }
.photo-block img { width: 100%; display: block; aspect-ratio: 4/3; object-fit: cover; }
.photo-block figcaption {
  margin-top: .65rem;
  text-align: center;
  font-size: .9rem;
  color: var(--muted);
}
${galleryExportStyles()}
.reveal { opacity: 1; transform: none; }
.reveal.visible { opacity: 1; transform: translateY(0); }
#lightbox {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(0,0,0,.92);
  opacity: 0;
  pointer-events: none;
  transition: opacity .25s ease;
}
#lightbox.open { opacity: 1; pointer-events: auto; }
#lightbox img {
  max-width: min(96vw, 1100px);
  max-height: 80vh;
  border-radius: 8px;
  box-shadow: 0 30px 80px rgba(0,0,0,.6);
}
.lightbox-caption { margin-top: 1rem; color: #d6d3d1; font-size: .95rem; text-align: center; max-width: 640px; }
footer {
  text-align: center;
  padding: 2rem 1rem 3rem;
  color: var(--muted);
  font-size: .85rem;
  border-top: 1px solid var(--border);
}
.leaflet-container { background: #292524 !important; font-family: inherit; }
@media (max-width: 768px) {
  .map-explorer-body {
    grid-template-columns: 1fr;
    min-height: auto;
  }
  .map-sidebar {
    flex-direction: row;
    flex-wrap: nowrap;
    overflow-x: auto;
    max-height: none;
  }
  .map-day-item {
    flex: 0 0 auto;
    min-width: 140px;
  }
  .map-canvas { height: min(55vh, 480px); min-height: 320px; }
}
@media (max-width: 640px) {
  .hero { min-height: 60vh; }
}
`;
  }

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
article .section-title { color: #fff; font-size: 1.5rem; border-bottom: 2px solid rgba(251,191,36,.35); padding-bottom: .4rem; }
article .day-marker { color: #fde68a; border-left: 4px solid var(--accent); padding-left: .85rem; }
article .pull-quote { border-left-color: var(--accent); background: rgba(251,191,36,.08); }
.photo-block { margin: 2rem 0; opacity: 1; transform: none; }
.photo-block.visible { opacity: 1; transform: none; }
.photo-frame { border-radius: 14px; overflow: hidden; cursor: zoom-in; box-shadow: 0 20px 50px rgba(0,0,0,.45); }
.photo-block img { width: 100%; display: block; margin: 0; border-radius: 0; box-shadow: none; }
.photo-block figcaption { text-align: center; color: var(--muted); font-size: .9rem; margin-top: .5rem; }
.reveal { opacity: 1; transform: none; }
.reveal.visible { opacity: 1; transform: none; }
#lightbox { position: fixed; inset: 0; z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5rem; background: rgba(0,0,0,.92); opacity: 0; pointer-events: none; transition: opacity .25s; }
#lightbox.open { opacity: 1; pointer-events: auto; }
#lightbox img { max-width: min(96vw, 1000px); max-height: 80vh; border-radius: 8px; }
.lightbox-caption { margin-top: 1rem; color: #d1d5db; text-align: center; }
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

function extractDayLabelsFromMarkdown(markdown: string): string[] {
  return [...markdown.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim()).filter(Boolean);
}

function buildDayTimelineSection(markdown: string, photos: ExportPhoto[]): string {
  const days = extractDayLabelsFromMarkdown(markdown);
  const photoDays = new Map<string, number>();

  for (const photo of photos) {
    if (!photo.exifDateTime) continue;
    const key = new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(photo.exifDateTime);
    photoDays.set(key, (photoDays.get(key) ?? 0) + 1);
  }

  const items =
    days.length > 0
      ? days.map((day) => ({ label: day, photos: photoDays.get(day) ?? 0 }))
      : [...photoDays.entries()].map(([label, count]) => ({ label, photos: count }));

  if (items.length === 0) return "";

  const chips = items
    .map(
      (item, i) =>
        `<div class="timeline-chip reveal" style="animation-delay:${i * 60}ms"><span class="timeline-day">${escapeHtml(item.label)}</span>${item.photos > 0 ? `<span class="timeline-meta">${item.photos} foto${item.photos === 1 ? "" : "s"}</span>` : ""}</div>`
    )
    .join("");

  return `
<section id="cronologia" class="timeline-section reveal">
  <h2 class="section-title">Cronología del viaje</h2>
  <p class="timeline-lead">Recorrido día a día (sin coordenadas GPS en las fotos)</p>
  <div class="timeline-track">${chips}</div>
</section>`;
}

function boundsFromPoints(pts: MapPoint[]): [[number, number], [number, number]] | null {
  const valid = pts.filter((p) => isValidGps(p.lat, p.lng));
  if (!valid.length) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of valid) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

export function buildMapDayGroups(points: MapPoint[]): ExportMapDayGroup[] {
  const groups: ExportMapDayGroup[] = [];
  const allBounds = boundsFromPoints(points);

  groups.push({
    id: "all",
    label: "Todo el viaje",
    bounds: allBounds,
    photoCount: points.filter((p) => p.kind === "photo").length,
  });

  const dayKeys = [
    ...new Set(points.filter((p) => p.dayKey).map((p) => p.dayKey as string)),
  ].sort();

  for (const dayKey of dayKeys) {
    const dayPoints = points.filter((p) => p.dayKey === dayKey);
    const label = dayPoints.find((p) => p.dayLabel)?.dayLabel ?? formatDateKey(dayKey);
    groups.push({
      id: dayKey,
      label,
      bounds: boundsFromPoints(dayPoints),
      photoCount: dayPoints.filter((p) => p.kind === "photo").length,
    });
  }

  const placePoints = points.filter((p) => p.kind === "place");
  if (placePoints.length) {
    groups.push({
      id: "places",
      label: "Lugares",
      bounds: boundsFromPoints(placePoints),
      photoCount: placePoints.length,
    });
  }

  const flightPoints = points.filter((p) => p.kind === "flight-out" || p.kind === "flight-in");
  if (flightPoints.length) {
    groups.push({
      id: "flights",
      label: "Vuelos",
      bounds: boundsFromPoints(flightPoints),
      photoCount: flightPoints.length,
    });
  }

  return groups;
}

function buildMapSidebarHtml(dayGroups: ExportMapDayGroup[]): string {
  const items = dayGroups
    .map(
      (group, i) =>
        `<button type="button" class="map-day-item${i === 0 ? " active" : ""}" data-day="${escapeHtml(group.id)}"><span class="map-day-label">${escapeHtml(group.label)}</span><span class="map-day-meta">${group.photoCount} punto${group.photoCount === 1 ? "" : "s"}</span></button>`
    )
    .join("");

  return `<aside class="map-sidebar" aria-label="Días del viaje">${items}</aside>`;
}

function buildMapDayLegendHtml(dayLegend: LeafletRouteSegments["dayLegend"]): string {
  const entries = resolveDayLegend(dayLegend);
  if (entries.length === 0) {
    return `<span><i class="legend-line"></i> Ruta por carretera</span>`;
  }
  return entries
    .map(
      (entry) =>
        `<span><i class="legend-line" style="background:${escapeHtml(entry.color)}"></i> ${escapeHtml(entry.label)}</span>`
    )
    .join("");
}

function resolveExportGpsTrails(ctx: ExportContext): GpsTrailPolyline[] {
  const selected = selectExportGpsTracks(ctx.gpsTracks ?? [], Boolean(ctx.includeGpsTrail));
  return buildGpsTrailPolylines(selected);
}

function buildMapStaticFallbackHtml(
  staticPath: string | null | undefined,
  alt: string
): string {
  if (!staticPath) return "";
  return `
<img class="map-static-fallback" data-export-src="${escapeHtml(staticPath)}" alt="${escapeHtml(alt)}" width="1280" height="720">
<p class="map-offline-note">Sin conexión a tiles: mostrando mapa estático incluido en el export.</p>`;
}

function buildFlightOverviewSection(
  mapLead: string,
  staticPath?: string | null
): string {
  return `
<section class="map-section reveal" id="mapa-trayecto">
  <div class="map-section-inner">
    <h2>Trayecto / llegada</h2>
    <p class="map-lead">${escapeHtml(mapLead)}</p>
    <div class="map-legend">
      <span><i class="legend-dash"></i> Vuelo ida/vuelta</span>
      <span>✈️ Aeropuertos</span>
    </div>
    <div class="map-frame-wrap">
      ${buildMapStaticFallbackHtml(staticPath, "Mapa estático del trayecto aéreo")}
      <div id="map-trayecto" class="map-canvas" style="min-height:300px;height:320px;border-radius:16px"></div>
    </div>
  </div>
</section>`;
}

function buildFullscreenMapSection(
  dayGroups: ExportMapDayGroup[],
  mapLead: string,
  dayLegend: LeafletRouteSegments["dayLegend"] = [],
  hasGpsTrails = false,
  options?: { localOnly?: boolean; staticPath?: string | null }
): string {
  const localOnly = Boolean(options?.localOnly);
  return `
<section class="map-explorer reveal" id="mapa">
  <div class="map-explorer-header">
    <div>
      <h2>${localOnly ? "En destino" : "Mapa del viaje"}</h2>
      <p class="map-lead">${escapeHtml(mapLead)}</p>
    </div>
    <div class="map-legend">
      ${buildMapDayLegendHtml(dayLegend)}
      ${localOnly ? "" : "<span><i class=\"legend-dash\"></i> Vuelos</span>"}
      ${hasGpsTrails ? '<span><i class="legend-gps"></i> Recorrido GPS</span>' : ""}
      <span>📍 Lugares · nº = orden</span>
    </div>
  </div>
  <div class="map-explorer-body">
    ${buildMapSidebarHtml(dayGroups)}
    <div class="map-frame-wrap" style="min-height:420px">
      ${buildMapStaticFallbackHtml(options?.staticPath, "Mapa estático del viaje")}
      <div id="map" class="map-canvas"></div>
    </div>
  </div>
</section>`;
}

function buildCompactMapSection(
  mapLead: string,
  dayLegend: LeafletRouteSegments["dayLegend"] = [],
  hasGpsTrails = false,
  options?: { localOnly?: boolean; staticPath?: string | null }
): string {
  const localOnly = Boolean(options?.localOnly);
  return `
<section class="map-section reveal" id="mapa">
  <div class="map-section-inner">
    <h2>${localOnly ? "En destino" : "Mapa del viaje"}</h2>
    <p class="map-lead">${escapeHtml(mapLead)}</p>
    <div class="map-legend">
      ${buildMapDayLegendHtml(dayLegend)}
      ${localOnly ? "" : "<span><i class=\"legend-dash\"></i> Vuelo ida/vuelta</span>"}
      ${hasGpsTrails ? '<span><i class="legend-gps"></i> Recorrido GPS</span>' : ""}
      <span>📍 Lugares · nº = orden</span>
    </div>
    <div class="map-frame-wrap">
      ${buildMapStaticFallbackHtml(options?.staticPath, "Mapa estático del viaje")}
      <div id="map"></div>
    </div>
  </div>
</section>`;
}

function buildMapScript(
  points: MapPoint[],
  dayGroups: ExportMapDayGroup[],
  routeSegments: LeafletRouteSegments,
  assetPrefix = "assets/images",
  template: ExportTemplateId = "magazine",
  gpsTrails: GpsTrailPolyline[] = [],
  options?: {
    dualMaps?: boolean;
    flightPoints?: MapPoint[];
    flightLegs?: [number, number][][];
    showRoute?: boolean;
  }
): string {
  const dualMaps = Boolean(options?.dualMaps);
  const showRoute = options?.showRoute !== false;
  const flightPoints = options?.flightPoints ?? [];
  const flightOnlyLegs = options?.flightLegs ?? routeSegments.flightLegs;
  const localPoints = dualMaps
    ? points.filter((p) => p.kind !== "flight-out" && p.kind !== "flight-in")
    : points;
  const localSegments: LeafletRouteSegments = dualMaps
    ? {
        roadSegments: showRoute ? routeSegments.roadSegments : [],
        flightLegs: [],
        dayLegend: routeSegments.dayLegend,
      }
    : {
        ...routeSegments,
        roadSegments: showRoute ? routeSegments.roadSegments : [],
      };

  const data = JSON.stringify(localPoints);
  const groupsData = JSON.stringify(
    dualMaps
      ? dayGroups.filter((g) => g.id !== "flights")
      : dayGroups
  );
  const roadData = JSON.stringify(localSegments.roadSegments);
  const flightData = JSON.stringify(localSegments.flightLegs);
  const gpsData = JSON.stringify(gpsTrails);
  const flightPointsData = JSON.stringify(flightPoints);
  const flightLegsData = JSON.stringify(flightOnlyLegs);
  const gpsColor = gpsTrailMapColor();
  const tileLayerScript = buildMapTileLayerScript(template);
  const dayColors = ["#2dd4bf", "#f59e0b", "#818cf8", "#f472b6", "#34d399", "#fb7185"];
  const dualFlag = dualMaps ? "true" : "false";

  return `
(function () {
  function showMapLoadError(mapEl, message) {
    if (!mapEl || mapEl.dataset.mapError) return;
    mapEl.dataset.mapError = "1";
    mapEl.innerHTML = '<div class="map-load-error">' + message + "</div>";
  }

  function showStaticFallback(mapEl) {
    if (!mapEl) return false;
    var wrap = mapEl.closest(".map-frame-wrap") || mapEl.parentElement;
    if (!wrap) return false;
    var fallback = wrap.querySelector(".map-static-fallback");
    var note = wrap.querySelector(".map-offline-note");
    if (!fallback) return false;
    if (window.__resolveExportAsset) {
      var key = fallback.getAttribute("data-export-src");
      if (key && !fallback.getAttribute("src")) fallback.src = window.__resolveExportAsset(key);
    } else if (!fallback.getAttribute("src")) {
      var raw = fallback.getAttribute("data-export-src");
      if (raw) fallback.src = raw;
    }
    fallback.classList.add("is-visible");
    if (note) note.classList.add("is-visible");
    mapEl.classList.add("map-canvas--hidden");
    return true;
  }

  function preferStaticOffline(mapEl) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return showStaticFallback(mapEl);
    }
    return false;
  }

  function watchTileErrors(map, mapEl) {
    var errors = 0;
    map.on("tileerror", function () {
      errors += 1;
      if (errors >= 4) showStaticFallback(mapEl);
    });
  }

  function initFlightOverviewMap() {
    if (!${dualFlag}) return;
    var mapEl = document.getElementById("map-trayecto");
    if (!mapEl || window.__travelFlightMap) return;
    if (preferStaticOffline(mapEl)) return;
    var points = ${flightPointsData}.filter(function (p) {
      return typeof p.lat === "number" && typeof p.lng === "number" && isFinite(p.lat) && isFinite(p.lng);
    });
    var flightLegs = ${flightLegsData};
    if (!points.length && !flightLegs.length) return;
    if (typeof L === "undefined") {
      if (!showStaticFallback(mapEl)) {
        showMapLoadError(mapEl, "No se pudo cargar el motor del mapa.");
      }
      return;
    }
    var map = L.map(mapEl, { scrollWheelZoom: true, zoomControl: true });
    window.__travelFlightMap = map;
    ${tileLayerScript.replace(/\.addTo\(map\)/g, ".addTo(map)")}
    watchTileErrors(map, mapEl);
    flightLegs.forEach(function (leg) {
      if (leg.length > 1) {
        L.polyline(leg, { color: "#818cf8", weight: 3, opacity: 0.85, dashArray: "10 8", lineJoin: "round" }).addTo(map);
      }
    });
    points.forEach(function (p) {
      var size = "28";
      var emojiIcon = L.divIcon({
        html: '<div style="font-size:' + size + 'px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))">' + (p.emoji || "✈️") + '</div>',
        className: "",
        iconSize: [0, 0],
        iconAnchor: [14, 14]
      });
      L.marker([p.lat, p.lng], { icon: emojiIcon }).addTo(map).bindPopup("<strong>" + (p.label || "Vuelo") + "</strong>");
    });
    var latLngs = points.map(function (p) { return [p.lat, p.lng]; });
    flightLegs.forEach(function (leg) { leg.forEach(function (c) { latLngs.push(c); }); });
    if (latLngs.length === 1) map.setView(latLngs[0], 5);
    else if (latLngs.length > 1) {
      var b = L.latLngBounds(latLngs);
      if (b.isValid()) map.fitBounds(b.pad(0.25));
    }
  }

  function initTravelMap() {
    var rawPoints = ${data};
    var points = rawPoints.filter(function (p) {
      return typeof p.lat === "number" && typeof p.lng === "number" && isFinite(p.lat) && isFinite(p.lng);
    });
    var gpsTrails = ${gpsData};
    var dayGroups = ${groupsData};
    var mapEl = document.getElementById("map");
    if (!mapEl || window.__travelMap) return;
    if (preferStaticOffline(mapEl)) return;

    var hasGpsTrails = gpsTrails.some(function (t) { return t.coords && t.coords.length > 1; });
    if (!points.length && !hasGpsTrails) {
      if (!showStaticFallback(mapEl)) {
        showMapLoadError(
          mapEl,
          "No hay coordenadas GPS en las fotos de este export. Comprueba que las fotos tengan ubicación en la app."
        );
      }
      return;
    }
    if (typeof L === "undefined") {
      if (!showStaticFallback(mapEl)) {
        showMapLoadError(
          mapEl,
          "No se pudo cargar el motor del mapa. Vuelve a exportar o abre el archivo en Chrome/Firefox de un ordenador."
        );
      }
      return;
    }

    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: "${assetPrefix}/marker-icon.png",
      iconRetinaUrl: "${assetPrefix}/marker-icon-2x.png",
      shadowUrl: "${assetPrefix}/marker-shadow.png"
    });

    var map = L.map(mapEl, { scrollWheelZoom: true, zoomControl: true });
    window.__travelMap = map;
    var bounds = null;

    function resolveAsset(path) {
      if (!path) return "";
      if (window.__resolveExportAsset) return window.__resolveExportAsset(path);
      return path;
    }

    function fitAllPoints() {
      var latLngs = points.map(function (p) { return [p.lat, p.lng]; });
      gpsTrails.forEach(function (trail) {
        (trail.coords || []).forEach(function (c) { latLngs.push(c); });
      });
      if (!latLngs.length) return;
      if (latLngs.length === 1) {
        map.setView(latLngs[0], 14);
        return;
      }
      bounds = L.latLngBounds(latLngs);
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.18));
    }

    function refreshMap() {
      map.invalidateSize(true);
      fitAllPoints();
      if (window.__travelFlightMap) window.__travelFlightMap.invalidateSize(true);
    }
    window.__refreshTravelMap = refreshMap;
    window.addEventListener("load", function () { setTimeout(refreshMap, 150); });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refreshMap();
    });
    ${tileLayerScript}
    watchTileErrors(map, mapEl);

    var flightOut = points.find(function (p) { return p.kind === "flight-out"; });
    var flightIn = points.find(function (p) { return p.kind === "flight-in"; });
    var photoPoints = points.filter(function (p) { return p.kind === "photo"; });
    fitAllPoints();

    var roadSegments = ${roadData};
    roadSegments.forEach(function (seg) {
      var coords = seg.coords || seg;
      var color = seg.color || "#2dd4bf";
      if (coords.length > 1) {
        L.polyline(coords, { color: color, weight: 4, opacity: 0.92, lineJoin: "round" }).addTo(map);
      }
    });

    var flightLegs = ${flightData};
    flightLegs.forEach(function (leg) {
      if (leg.length > 1) {
        L.polyline(leg, { color: "#818cf8", weight: 3, opacity: 0.85, dashArray: "10 8", lineJoin: "round" }).addTo(map);
      }
    });

    gpsTrails.forEach(function (trail) {
      if (trail.coords && trail.coords.length > 1) {
        L.polyline(trail.coords, {
          color: "${gpsColor}",
          weight: 3,
          opacity: 0.88,
          dashArray: "2 8",
          lineJoin: "round"
        }).addTo(map).bindPopup("Recorrido GPS · " + (trail.alias || ""));
      }
    });

    if (roadSegments.length === 0 && photoPoints.length > 1 && ${showRoute ? "true" : "false"}) {
      L.polyline(photoPoints.map(function (p) { return [p.lat, p.lng]; }), { color: "#2dd4bf", weight: 4, opacity: 0.9, lineJoin: "round" }).addTo(map);
    }

    if (flightLegs.length === 0 && flightOut && flightIn) {
      L.polyline(
        [[flightOut.lat, flightOut.lng], [flightIn.lat, flightIn.lng]],
        { color: "#818cf8", weight: 3, opacity: 0.85, dashArray: "10 8" }
      ).addTo(map);
    }

    var photoIndex = 0;
    var markersByDay = {};
    var dayColorIndex = {};
    var colorIdx = 0;
    photoPoints.forEach(function (p) {
      if (p.dayKey && dayColorIndex[p.dayKey] === undefined) {
        dayColorIndex[p.dayKey] = dayColors[colorIdx % dayColors.length];
        colorIdx += 1;
      }
    });

    function buildPopup(p) {
      var popup = "<strong>" + escapeHtml(p.label) + "</strong>";
      var thumbs = Array.isArray(p.photoPaths) && p.photoPaths.length ? p.photoPaths : (p.photoPath ? [p.photoPath] : []);
      thumbs.forEach(function (src) {
        var resolved = resolveAsset(src);
        if (!resolved) return;
        popup += '<br><img src="' + escapeHtml(resolved) + '" alt="" style="max-width:220px;margin-top:8px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.3)">';
      });
      popup += '<br><small style="color:#78716c">' + new Date(p.date).toLocaleString("es-ES") + "</small>";
      return popup;
    }

    points.forEach(function (p) {
      var marker;
      if (p.kind === "photo") {
        photoIndex += 1;
        var pinColor = p.dayKey && dayColorIndex[p.dayKey] ? dayColorIndex[p.dayKey] : "#2dd4bf";
        var icon = L.divIcon({
          html: '<div class="route-pin" style="background:linear-gradient(135deg,' + pinColor + ',#0d9488)">' + photoIndex + '</div>',
          className: "route-pin-wrap",
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        marker = L.marker([p.lat, p.lng], { icon: icon, zIndexOffset: 100 }).addTo(map);
        if (p.dayKey) {
          if (!markersByDay[p.dayKey]) markersByDay[p.dayKey] = [];
          markersByDay[p.dayKey].push(marker);
        }
      } else if (p.kind === "place" && p.emoji) {
        var placeIcon = L.divIcon({
          html: '<div class="place-pin">' + p.emoji + '</div>',
          className: "place-pin-wrap",
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
        marker = L.marker([p.lat, p.lng], { icon: placeIcon, zIndexOffset: 500 }).addTo(map);
      } else if (p.emoji) {
        var size = (p.kind === "flight-out" || p.kind === "flight-in") ? "28" : "24";
        var emojiIcon = L.divIcon({
          html: '<div style="font-size:' + size + 'px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))">' + p.emoji + '</div>',
          className: "",
          iconSize: [0, 0],
          iconAnchor: [14, 14]
        });
        marker = L.marker([p.lat, p.lng], { icon: emojiIcon }).addTo(map);
      } else {
        marker = L.marker([p.lat, p.lng]).addTo(map);
      }
      marker.bindPopup(function () { return buildPopup(p); }, { maxWidth: 280 });
    });

    function flyToGroup(group) {
      if (!group || !group.bounds) return;
      var b = L.latLngBounds(group.bounds);
      if (!b.isValid()) return;
      map.flyToBounds(b, { padding: [52, 52], duration: 1.15, maxZoom: group.id === "all" ? 12 : 15 });
    }

    document.querySelectorAll(".map-day-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var dayId = btn.getAttribute("data-day");
        document.querySelectorAll(".map-day-item").forEach(function (el) { el.classList.remove("active"); });
        btn.classList.add("active");
        var group = dayGroups.find(function (g) { return g.id === dayId; });
        flyToGroup(group);
      });
    });

    function escapeHtml(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }
  }

  function scheduleMapInit() {
    initFlightOverviewMap();
    initTravelMap();
    if (!window.__travelMap) {
      window.setTimeout(initTravelMap, 350);
      window.setTimeout(initTravelMap, 1500);
    }
    if (${dualFlag} && !window.__travelFlightMap) {
      window.setTimeout(initFlightOverviewMap, 350);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleMapInit);
  } else {
    scheduleMapInit();
  }

  window.addEventListener("load", function () {
    window.setTimeout(scheduleMapInit, 200);
  });

  if ("IntersectionObserver" in window) {
    var mapObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        scheduleMapInit();
        if (window.__refreshTravelMap) {
          window.setTimeout(function () { window.__refreshTravelMap(); }, 120);
        }
        if (window.__travelFlightMap) {
          window.setTimeout(function () { window.__travelFlightMap.invalidateSize(true); }, 120);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -5% 0px" });
    ["mapa", "mapa-trayecto"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) mapObs.observe(el);
    });
  }
})();
`;
}

function buildExportTimelineEvents(ctx: ExportContext): TimelineEvent[] {
  const urlToThumb = new Map(ctx.photos.map((p) => [p.url, p.thumbPath]));
  const timelineInput = {
    photos: ctx.photos.map((p) => ({
      id: p.id,
      url: p.url,
      exifDateTime: p.exifDateTime,
      latitude: p.latitude,
      longitude: p.longitude,
      isTransportStart: p.isTransportStart,
      isTransportEnd: p.isTransportEnd,
      selected: true,
      alias: p.alias,
      mediaType: p.mediaType,
      videoPath: p.videoPath,
      durationMs: p.durationMs,
    })),
    places: (ctx.places ?? []).map((p) => ({
      id: p.id ?? p.name,
      name: p.name,
      type: p.type,
      latitude: p.latitude,
      longitude: p.longitude,
      visitedAt: p.visitedAt ?? null,
      createdAt: p.visitedAt ?? new Date(),
      alias: p.alias,
      comment: p.comment,
    })),
    notes: (ctx.notes ?? []).map((n) => ({
      id: n.id,
      type: n.type as "PHOTO" | "DAY" | "TRIP" | "PLACE",
      text: n.text,
      dayDate: n.dayDate,
      photoId: n.photoId,
      placeId: n.placeId,
      createdAt: n.createdAt,
      alias: n.alias,
    })),
    journalMarkdown: ctx.travel.journalMarkdown,
    startDate: ctx.travel.startDate,
    endDate: ctx.travel.endDate,
    gpsTracks: (ctx.gpsTracks ?? [])
      .filter((t) => ctx.includeGpsTrail || t.includeInExport)
      .map((t) => ({
        id: t.id,
        startedAt: t.startedAt,
        endedAt: null,
        points: t.points,
        includeInExport: true,
        alias: t.alias,
      })),
    selectedPhotosOnly: true,
  };

  const { events } = buildTimeline(timelineInput);
  const placeThumbById = new Map(
    (ctx.places ?? [])
      .filter((p) => p.id && isValidGps(p.latitude, p.longitude))
      .map((p) => [p.id!, photosForPlace(p, ctx.photos)[0]?.thumbPath] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
  );

  return events.map((ev) => ({
    ...ev,
    mediaUrl: ev.mediaUrl
      ? urlToThumb.get(ev.mediaUrl) ?? ev.mediaUrl
      : ev.kind === "place" && ev.meta?.placeId
        ? placeThumbById.get(ev.meta.placeId)
        : undefined,
  }));
}

function estimateRouteKm(photos: ExportPhoto[]): number | undefined {
  const gps = photos
    .filter(
      (p) =>
        !p.isTransportStart &&
        !p.isTransportEnd &&
        p.latitude != null &&
        p.longitude != null
    )
    .sort(
      (a, b) =>
        new Date(a.exifDateTime ?? 0).getTime() - new Date(b.exifDateTime ?? 0).getTime()
    );
  if (gps.length < 2) return undefined;
  let total = 0;
  for (let i = 1; i < gps.length; i++) {
    total += distanceMeters(
      gps[i - 1].latitude!,
      gps[i - 1].longitude!,
      gps[i].latitude!,
      gps[i].longitude!
    );
  }
  return total / 1000;
}

export function buildExportHtml(ctx: ExportContext): string {
  const { travel, users, photos, places = [], template } = ctx;
  const explicitType =
    ctx.typology && ctx.typology !== "auto" ? ctx.typology : travel.travelType ?? null;
  const resolvedType = resolveTravelType(
    explicitType,
    {
      photos: photos.map((p) => ({
        id: p.id,
        url: p.url,
        exifDateTime: p.exifDateTime,
        latitude: p.latitude,
        longitude: p.longitude,
        isTransportStart: p.isTransportStart,
        isTransportEnd: p.isTransportEnd,
        alias: p.alias,
      })),
      places: places.map((p) => ({
        id: p.id ?? p.name,
        name: p.name,
        type: p.type,
        latitude: p.latitude,
        longitude: p.longitude,
        visitedAt: p.visitedAt ?? null,
        createdAt: p.visitedAt ?? new Date(),
        alias: p.alias,
      })),
      notes: [],
    }
  );
  const profile = getTypologyProfile(resolvedType);
  const timelineEvents = buildExportTimelineEvents(ctx);
  const markdown = travel.journalMarkdown ?? buildFallbackMarkdown(travel, users, photos);
  const mapPhotos = getExportMapPhotos(ctx);
  const mapPoints = mergeMapPoints(mapPhotos, places);
  const routeSegments = resolveLeafletRouteSegments(ctx, mapPhotos, places);
  const gpsTrails = resolveExportGpsTrails(ctx);
  const hasGpsTrails = gpsTrailsHaveGeometry(gpsTrails);
  const mapPhotoGpsCount = mapPhotos.filter((p) => isValidGps(p.latitude, p.longitude)).length;
  const selectedPhotoGpsCount = photos.filter((p) => isValidGps(p.latitude, p.longitude)).length;
  const placeCount = places.filter((p) => isValidGps(p.latitude, p.longitude)).length;
  const mapLead =
    mapPhotoGpsCount === 0 && placeCount > 0 && !hasGpsTrails
      ? `${placeCount} lugar${placeCount === 1 ? "" : "es"} marcado${placeCount === 1 ? "" : "s"} en el mapa. Pulsa un pin para ver fotos y notas.`
      : mapPhotoGpsCount === 0 && hasGpsTrails
        ? `Mapa con recorrido GPS grabado${gpsTrails.length > 1 ? "s" : ""}${placeCount > 0 ? " y lugares" : ""}.`
        : mapPhotoGpsCount === 0 && photos.length > 0
        ? "Las fotos no tienen GPS en los metadatos; se muestran lugares y vuelos marcados."
        : mapPhotoGpsCount > selectedPhotoGpsCount && photos.length < mapPhotos.length
          ? `${mapPhotoGpsCount} fotos con ubicación GPS en el mapa (${photos.length} incluidas en la crónica). Pulsa un día o «Lugares» para hacer zoom.`
          : mapPhotoGpsCount < photos.length
            ? `${mapPhotoGpsCount} de ${photos.length} fotos con ubicación GPS. Pulsa un día o «Lugares» para hacer zoom.`
            : "Pulsa un día o «Lugares» para hacer zoom en ese tramo del recorrido";
  const urlToLocal = new Map(photos.map((p) => [p.url, p.localPath]));
  const rawHtml = markdownToHtml(rewriteMarkdownImagePaths(markdown, urlToLocal));
  const contentHtml =
    template === "editorial-clean" ? rawHtml : enhanceArticleHtml(rawHtml);
  const dateRange = formatDateRange(travel.startDate, travel.endDate);
  const hasMap = mapPoints.length > 0 || hasGpsTrails;
  const isMagazine = template === "magazine";
  const isVisual = template === "visual-journey" || template === "dark-photo-journey";
  const isInteractive = template !== "editorial-clean";
  const coverPhoto = pickCoverPhoto(photos);
  const notes = ctx.notes ?? [];
  const tripNote = findTripNote(notes);
  const deck = extractDeck(travel.journalMarkdown, tripNote);
  const hasJournalArticle = Boolean(travel.journalMarkdown?.trim());
  const hasGuide = isMagazine && places.length > 0;
  const useUnifiedStory = isMagazine || isVisual;
  const storyProse = useUnifiedStory
    ? extractJournalStoryProse(travel.journalMarkdown)
    : null;
  const dayProseByKey = new Map<string, string>();
  if (storyProse?.hasProse) {
    const dayKeys = [
      ...new Set(
        timelineEvents
          .filter((e) => e.kind === "day-boundary")
          .map((e) => e.dayKey)
      ),
    ];
    dayKeys.forEach((dayKey, index) => {
      const dayTitle =
        dayKey === "sin-fecha" ? "Recuerdos" : formatDateKey(dayKey, "long");
      const html = resolveDayNarrativeHtml(
        dayKey,
        dayTitle,
        index,
        storyProse.days
      );
      if (html) dayProseByKey.set(dayKey, html);
    });
  }
  const storyTimelineOptions = useUnifiedStory
    ? {
        excludeJournalChunks: true,
        title: "El viaje",
        eyebrow: storyProse?.hasProse ? "Crónica y recorrido" : "Recorrido",
        introHtml: storyProse?.introHtml,
        conclusionHtml: storyProse?.conclusionHtml,
        dayProseByKey,
        dayProseOrdered: storyProse?.days.ordered,
      }
    : { excludeJournalChunks: hasJournalArticle };
  const dayCount = timelineEvents.filter((e) => e.kind === "day-boundary").length;
  const distanceKm = estimateRouteKm(photos);
  const travelers = users.map((u) => u.alias).join(", ");

  const heroGradient = coverPhoto
    ? isMagazine
      ? "linear-gradient(to top, rgba(250,249,247,.92), rgba(250,249,247,.4))"
      : "linear-gradient(to top, rgba(12,10,9,.88), rgba(12,10,9,.25))"
    : "";
  const heroPhotoPath = coverPhoto?.localPath ?? null;

  const mapDayGroups = hasMap ? buildMapDayGroups(mapPoints) : [];
  const flightPoints = buildFlightMapPoints(mapPhotos);
  const dualMaps =
    flightPoints.length > 0 &&
    routeSegments.flightLegs.length > 0 &&
    (routeSegments.roadSegments.length > 0 ||
      mapPoints.some((p) => p.kind === "photo" || p.kind === "place") ||
      hasGpsTrails);
  const mapNavLinks = hasMap
    ? dualMaps
      ? '<a href="#mapa-trayecto">Trayecto</a><a href="#mapa">En destino</a>'
      : '<a href="#mapa">Mapa</a>'
    : "";

  const headerBlock = isMagazine
    ? `${buildMagazineHero({
        title: travel.title,
        deck,
        dateRange,
        travelers,
        typologyLabel: profile.label,
        coverPhotoPath: heroPhotoPath,
        heroGradient,
      })}
${buildTocHtml(timelineEvents)}
${buildMagazineNav(hasMap, hasGuide, dualMaps, photos.length > 0)}`
    : isVisual
      ? `<header class="hero"${heroPhotoPath ? ` data-export-hero="${escapeHtml(heroPhotoPath)}" data-export-hero-gradient="${escapeHtml(heroGradient)}"` : ""}>
      <div class="hero-content reveal">
        <span class="hero-badge">${escapeHtml(profile.label)} · ${escapeHtml(getTemplateLabel(template))}</span>
        <h1>${escapeHtml(travel.title)}</h1>
        <p class="hero-meta">${escapeHtml(dateRange)} · ${users.map((u) => escapeHtml(u.alias)).join(", ")}</p>
        <div class="hero-stats">
          <span class="stat-pill">📷 ${photos.length} fotos</span>
          <span class="stat-pill">👥 ${users.length} viajeros</span>
          ${places.length > 0 ? `<span class="stat-pill">📍 ${places.length} lugares</span>` : ""}
        </div>
      </div>
    </header>
    <nav class="section-nav">
      ${mapNavLinks}
      <a href="#cronologia">El viaje</a>
      <a href="#galeria">Galería</a>
      ${profile.playProfile.showScrubber ? '<a href="#reproducir">Reproducir</a>' : ""}
    </nav>`
      : `<header>
      <h1>${escapeHtml(travel.title)}</h1>
      <p class="meta">${escapeHtml(dateRange)} · ${users.map((u) => escapeHtml(u.alias)).join(", ")} · ${escapeHtml(profile.label)}</p>
    </header>`;
  const localMapLead = dualMaps
    ? "Recorrido en destino — sin el zoom de los vuelos. Pulsa un día o «Lugares» para acercarte."
    : mapLead;
  const flightMapLead =
    "Trayecto aéreo de ida y vuelta — contexto del destino del viaje.";
  const useExplorerMap =
    (isVisual || isMagazine) && profile.mapConfig.showDaySidebar;
  const localMapBlock = hasMap
    ? useExplorerMap
      ? buildFullscreenMapSection(
          dualMaps ? mapDayGroups.filter((g) => g.id !== "flights") : mapDayGroups,
          localMapLead,
          routeSegments.dayLegend,
          hasGpsTrails,
          {
            localOnly: dualMaps,
            staticPath: ctx.mapStaticLocalPath,
          }
        )
      : buildCompactMapSection(localMapLead, routeSegments.dayLegend, hasGpsTrails, {
          localOnly: dualMaps,
          staticPath: ctx.mapStaticLocalPath,
        })
    : "";
  const mapBlock = hasMap
    ? `${dualMaps ? buildFlightOverviewSection(flightMapLead, ctx.mapStaticFlightPath) : ""}${localMapBlock}`
    : "";

  const galleryBlock = isVisual || isMagazine
    ? buildGallerySection(
        photos.map((p) => ({
          localPath: p.localPath,
          thumbPath: p.thumbPath,
          exifDateTime: p.exifDateTime,
          alias: p.alias,
          isTransportStart: p.isTransportStart,
          isTransportEnd: p.isTransportEnd,
          highlightScore: p.highlightScore,
          mediaType: p.mediaType,
          videoPath: p.videoPath,
          durationMs: p.durationMs,
        })),
        travel.startDate,
        travel.endDate
      )
    : "";
  const storyAnchor = "";
  const timelineBlock = buildTimelineSectionHtml(timelineEvents, storyTimelineOptions);
  const hasFlightsInTimeline = timelineEvents.some(
    (e) => e.kind === "flight-out" || e.kind === "flight-in"
  );
  const flightsBlock =
    hasFlightsInTimeline ? "" : buildFlightsSectionHtml(timelineEvents);
  const statsBlock = buildStatsSectionHtml({
    photoCount: photos.length,
    placeCount: places.length,
    dayCount,
    distanceKm,
    profile,
  });
  const calloutPlaces = [...places]
    .sort((a, b) => compareHighlightScore(a.highlightScore ?? 5, b.highlightScore ?? 5))
    .map((p) => {
    const linked = [...photosForPlace(p, mapPhotos)].sort((a, b) =>
      compareHighlightScore(a.highlightScore, b.highlightScore)
    );
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      comment: p.comment,
      alias: p.alias,
      highlightScore: p.highlightScore ?? 5,
      photoPaths: linked.slice(0, 4).map((photo) => photo.thumbPath),
    };
  });
  const calloutsBlock = isMagazine ? buildPlaceCalloutsHtml(calloutPlaces) : "";
  const closingBlock = isMagazine
    ? buildClosingSectionHtml(tripNote, {
        photoCount: photos.length,
        placeCount: places.length,
        dayCount,
        distanceKm,
        travelers: users.map((u) => u.alias),
      })
    : "";
  const playBlock = profile.playProfile.showScrubber && !isMagazine ? buildPlayModeSectionHtml() : "";

  // Magazine: El viaje → Galería → Guía → Cierre (gallery right after timeline).
  const magazineSectionOrder = (() => {
    const base = profile.sectionOrder.filter(
      (id) => id !== "hero" && id !== "play"
    );
    const withoutGallery = base.filter((id) => id !== "gallery");
    const timelineIdx = withoutGallery.indexOf("timeline");
    if (timelineIdx >= 0) {
      return [
        ...withoutGallery.slice(0, timelineIdx + 1),
        "gallery" as const,
        ...withoutGallery.slice(timelineIdx + 1),
      ];
    }
    return galleryBlock ? [...withoutGallery, "gallery" as const] : withoutGallery;
  })();

  const sectionBlocks: Record<string, string> = {
    hero: "",
    stats: statsBlock,
    flights: flightsBlock,
    map: mapBlock,
    timeline: timelineBlock,
    gallery: galleryBlock,
    // Magazine/visual: crónica lives inside timeline (El viaje). Editorial keeps article.
    journal:
      useUnifiedStory || !hasJournalArticle
        ? ""
        : `<section class="journal-section reveal visible"><h2 class="section-title">Crónica del viaje</h2><article${storyAnchor}>${contentHtml}</article></section>`,
    play: playBlock,
    guide: calloutsBlock,
    closing: closingBlock,
  };

  const sectionOrder = isMagazine
    ? [...magazineSectionOrder, "guide", "closing"]
    : profile.sectionOrder;
  // Visual templates keep a full-bleed top map; Magazine/Editorial place map via sectionOrder.
  const showMapOuter = isVisual && hasMap;

  const orderedMiddle = [
    ...sectionOrder
      .filter((id) => id !== "hero" && sectionBlocks[id as keyof typeof sectionBlocks])
      .filter((id) => !(showMapOuter && id === "map"))
      .map((id) => sectionBlocks[id as keyof typeof sectionBlocks]),
    ...(isMagazine ? [] : [calloutsBlock, closingBlock]),
  ]
    .filter(Boolean)
    .join("\n");

  const lightboxBlock = isInteractive
    ? `<div id="lightbox" role="dialog" aria-modal="true" aria-label="Visor de fotos">
  <button type="button" class="lightbox-prev" aria-label="Foto anterior" hidden>‹</button>
  <button type="button" class="lightbox-next" aria-label="Foto siguiente" hidden>›</button>
  <img src="" alt="">
  <p class="lightbox-counter" aria-live="polite"></p>
  <p class="lightbox-caption"></p>
</div>`
    : "";

  const timelineJson = JSON.stringify(timelineEvents).replace(/</g, "\\u003c");
  const extraStyles =
    (isMagazine || isVisual ? timelineExportStyles() : "") +
    (hasMap && (isMagazine || isVisual) ? mapExportStyles() : "") +
    playModeStyles();
  const interactiveScript = isInteractive
    ? `<script>${buildInteractiveScripts(template)}${isMagazine ? buildMagazineInteractiveScript() : ""}</script>`
    : "";
  const timelineScript = `<script>window.__TRAVEL_TIMELINE__=${timelineJson};</script><script>${buildTimelineSyncScript()}</script>`;
  const playScript =
    profile.playProfile.showScrubber && isInteractive && !isMagazine
      ? `<script>${buildPlayModeScript(timelineEvents, profile)}</script>`
      : "";

  const mapOuter = showMapOuter ? mapBlock : "";
  const mapInner = "";
  const headMeta = isMagazine
    ? buildHeadMeta({
        title: travel.title,
        deck,
        dateRange,
        coverImagePath: coverPhoto?.localPath ?? null,
      })
    : "";

  const exportBootScript = `<script>${buildExportPhotoBootScript()}</script>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(travel.title)} — TravelToBlog</title>
  ${headMeta}
  ${hasMap ? '<link rel="stylesheet" href="assets/leaflet.css">' : ""}
  <style>${templateStyles(template)}${extraStyles}</style>
</head>
<body>
  ${headerBlock}
  ${mapOuter}
  <div class="wrap">
    ${mapInner}
    ${orderedMiddle}
    <footer>Exportado con TravelToBlog · ${escapeHtml(profile.label)} · ${escapeHtml(getTemplateLabel(template))}</footer>
  </div>
  ${lightboxBlock}
  ${timelineScript}
  ${hasMap ? `<script src="assets/leaflet.js"></script><script>${buildMapScript(mapPoints, mapDayGroups, routeSegments, "assets/images", template, gpsTrails, {
    dualMaps,
    flightPoints,
    flightLegs: routeSegments.flightLegs,
    showRoute: profile.mapConfig.showRoute,
  })}</script>` : ""}
  ${playScript}
  ${interactiveScript}
  ${exportBootScript}
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

export function buildMapPhotoList(
  allPhotos: (Photo & { user: User })[],
  selectedPhotos: ExportPhoto[]
): ExportPhoto[] {
  const selectedById = new Map(selectedPhotos.map((p) => [p.id, p]));
  return allPhotos.map((photo) => {
    const selected = selectedById.get(photo.id);
    if (selected) return selected;
    const isVideo = photo.mediaType === "VIDEO";
    return {
      id: photo.id,
      url: photo.url,
      localPath: `map/${photo.id}.webp`,
      thumbPath: `map/${photo.id}-thumb.webp`,
      latitude: photo.latitude,
      longitude: photo.longitude,
      placeId: photo.placeId ?? null,
      mediaType: isVideo ? "VIDEO" : "IMAGE",
      durationMs: photo.durationMs ?? null,
      videoPath: null,
      exportSourceUrl:
        isVideo && photo.posterFilename
          ? `/uploads/${photo.travelId}/${photo.posterFilename}`
          : photo.url,
      exifDateTime: photo.exifDateTime,
      alias: photo.user.alias,
      isTransportStart: photo.isTransportStart,
      isTransportEnd: photo.isTransportEnd,
      highlightScore: photo.highlightScore ?? 5,
    };
  });
}

export async function loadPhotoFiles(
  photos: (Photo & { user: User })[]
): Promise<ExportPhoto[]> {
  const selected = photos.filter((p) => p.selected);
  return Promise.all(
    selected.map(async (photo, index) => {
      const { localPath, thumbPath } = exportPhotoPaths(index);
      const isVideo = photo.mediaType === "VIDEO";
      const videoExt = path.extname(photo.filename) || ".mp4";
      const resolved = await resolvePhotoExifFromFile({
        url: photo.url,
        exifDateTime: photo.exifDateTime,
        latitude: photo.latitude,
        longitude: photo.longitude,
      });
      return {
        id: photo.id,
        url: photo.url,
        localPath,
        thumbPath,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        placeId: photo.placeId ?? null,
        mediaType: isVideo ? ("VIDEO" as const) : ("IMAGE" as const),
        durationMs: photo.durationMs ?? null,
        videoPath: isVideo
          ? `videos/${String(index + 1).padStart(3, "0")}${videoExt}`
          : null,
        exportSourceUrl:
          isVideo && photo.posterFilename
            ? `/uploads/${photo.travelId}/${photo.posterFilename}`
            : photo.url,
        exifDateTime: resolved.dateTime,
        alias: photo.user.alias,
        isTransportStart: photo.isTransportStart,
        isTransportEnd: photo.isTransportEnd,
        highlightScore: photo.highlightScore ?? 5,
      };
    })
  );
}

export async function readPhotoBuffer(photoUrl: string): Promise<Buffer | null> {
  const { readStoredPhotoBuffer } = await import("@/lib/photo-gps");
  return readStoredPhotoBuffer(photoUrl);
}

async function getLeafletAssets(): Promise<Record<string, Buffer>> {
  const candidates = [
    path.join(process.cwd(), "public", "export-assets", "leaflet"),
    path.join(process.cwd(), "node_modules", "leaflet", "dist"),
  ];

  const files = [
    "leaflet.css",
    "leaflet.js",
    "images/marker-icon.png",
    "images/marker-icon-2x.png",
    "images/marker-shadow.png",
  ];

  for (const base of candidates) {
    try {
      const out: Record<string, Buffer> = {};
      for (const file of files) {
        out[file] = await readFile(path.join(base, file));
      }
      return out;
    } catch {
      continue;
    }
  }

  throw new Error("Leaflet assets not found (public/export-assets/leaflet or node_modules/leaflet/dist)");
}

function exportHasMap(ctx: ExportContext): boolean {
  if (mergeMapPoints(getExportMapPhotos(ctx), ctx.places ?? []).length > 0) return true;
  return gpsTrailsHaveGeometry(resolveExportGpsTrails(ctx));
}

/** Fix Leaflet CSS image paths for zip bundle layout */
function patchLeafletCss(css: string): string {
  return css.replace(/url\(([^)]*images\/[^)]+)\)/g, (_m, p) => {
    const filename = path.basename(String(p).replace(/["']/g, ""));
    return `url(images/${filename})`;
  });
}

const EXPORT_PHOTO_CONCURRENCY = 4;

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function prepareExportPhotoBuffers(
  travelId: string,
  photos: ExportPhoto[],
  onPhotoProgress?: (current: number, total: number) => void,
  options?: { includeVideoOriginals?: boolean }
): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const total = photos.length;
  let completed = 0;
  const includeVideoOriginals = options?.includeVideoOriginals ?? false;

  await runWithConcurrency(photos, EXPORT_PHOTO_CONCURRENCY, async (photo) => {
    const sourceUrl = photo.exportSourceUrl ?? photo.url;
    const set = await getOrCreateExportImageSet(travelId, photo.id, sourceUrl);
    if (set) {
      files.set(photo.localPath, set.display);
      files.set(photo.thumbPath, set.thumb);
    }

    if (
      includeVideoOriginals &&
      photo.mediaType === "VIDEO" &&
      photo.videoPath
    ) {
      const videoBuf = await readPhotoBuffer(photo.url);
      if (videoBuf) files.set(photo.videoPath, videoBuf);
    }

    completed += 1;
    onPhotoProgress?.(completed, total);
  });

  return files;
}

function buildPhotoRegistry(files: Map<string, Buffer>): Record<string, string> {
  const registry: Record<string, string> = {};
  for (const [filePath, buffer] of files) {
    const mime = filePath.endsWith(".png")
      ? "image/png"
      : filePath.match(/\.(mp4|webm|mov|m4v)$/i)
        ? "video/mp4"
        : EXPORT_IMAGE_MIME;
    registry[filePath] = `data:${mime};base64,${buffer.toString("base64")}`;
  }
  return registry;
}

function addCommonZipFiles(zip: JSZip, ctx: ExportContext, html: string): void {
  zip.file("index.html", html);

  const explicitType =
    ctx.typology && ctx.typology !== "auto" ? ctx.typology : ctx.travel.travelType ?? "GENERIC";
  const staticNote = ctx.mapStaticLocalPath
    ? "\nMapa: interactivo online + PNG estático offline (map/*.png)."
    : "";
  zip.file(
    "README.txt",
    `TravelToBlog export\nTipología: ${explicitType}\nPlantilla: ${ctx.template}\nGenerado: ${new Date().toISOString()}${staticNote}\nLos vídeos del ZIP se reproducen en Recorrido y Galería (carpeta videos/).\n`
  );

  const timelineEvents = buildExportTimelineEvents(ctx);
  zip.file("assets/timeline.json", JSON.stringify(timelineEvents, null, 2));
}

async function addLeafletToZip(zip: JSZip): Promise<void> {
  const leaflet = await getLeafletAssets();
  zip.file("assets/leaflet.css", patchLeafletCss(leaflet["leaflet.css"].toString("utf-8")));
  zip.file("assets/leaflet.js", leaflet["leaflet.js"]);
  zip.folder("assets/images")?.file("marker-icon.png", leaflet["images/marker-icon.png"]);
  zip.folder("assets/images")?.file("marker-icon-2x.png", leaflet["images/marker-icon-2x.png"]);
  zip.folder("assets/images")?.file("marker-shadow.png", leaflet["images/marker-shadow.png"]);
}

async function inlineMapAssetsInHtml(
  html: string,
  ctx: ExportContext,
  registry?: Record<string, string>
): Promise<string> {
  if (!exportHasMap(ctx)) return html;

  const leaflet = await getLeafletAssets();
  const leafletCss = patchLeafletCss(leaflet["leaflet.css"].toString("utf-8"));
  const leafletJs = leaflet["leaflet.js"].toString("utf-8");
  const markerIcon = leaflet["images/marker-icon.png"].toString("base64");
  const markerIcon2x = leaflet["images/marker-icon-2x.png"].toString("base64");
  const markerShadow = leaflet["images/marker-shadow.png"].toString("base64");

  let out = html.replace(
    '<link rel="stylesheet" href="assets/leaflet.css">',
    `<style>${leafletCss}
.leaflet-marker-icon { background-image: url(data:image/png;base64,${markerIcon}) !important; }
.leaflet-marker-icon.leaflet-marker-icon-2x { background-image: url(data:image/png;base64,${markerIcon2x}) !important; }
.leaflet-marker-shadow { background-image: url(data:image/png;base64,${markerShadow}) !important; }
</style>`
  );

  const mapPhotos = getExportMapPhotos(ctx);
  const mapPoints = mergeMapPoints(mapPhotos, ctx.places ?? []).map((p) => {
    if (!registry) return p;
    return {
      ...p,
      photoPath: p.photoPath ? registry[p.photoPath] ?? p.photoPath : null,
      photoPaths: p.photoPaths?.map((path) => registry[path] ?? path),
    };
  });

  const iconScript = `delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "data:image/png;base64,${markerIcon}",
  iconRetinaUrl: "data:image/png;base64,${markerIcon2x}",
  shadowUrl: "data:image/png;base64,${markerShadow}"
});`;

  const mapDayGroups = buildMapDayGroups(mapPoints);
  const routeSegments = resolveLeafletRouteSegments(ctx, mapPhotos, ctx.places ?? []);
  const gpsTrails = resolveExportGpsTrails(ctx);
  const flightPoints = buildFlightMapPoints(mapPhotos);
  const dualMaps =
    flightPoints.length > 0 &&
    routeSegments.flightLegs.length > 0 &&
    (routeSegments.roadSegments.length > 0 ||
      mapPoints.some((p) => p.kind === "photo" || p.kind === "place") ||
      gpsTrailsHaveGeometry(gpsTrails));
  const explicitType =
    ctx.typology && ctx.typology !== "auto"
      ? ctx.typology
      : (ctx.travel.travelType ?? "GENERIC");
  const profile = getTypologyProfile(explicitType);
  const mapScriptBody = buildMapScript(
    mapPoints,
    mapDayGroups,
    routeSegments,
    "assets/images",
    ctx.template,
    gpsTrails,
    {
      dualMaps,
      flightPoints,
      flightLegs: routeSegments.flightLegs,
      showRoute: profile.mapConfig.showRoute,
    }
  ).replace(
    /delete L\.Icon\.Default\.prototype\._getIconUrl;[\s\S]*?}\);/,
    iconScript
  );

  out = out.replace(
    /<script src="assets\/leaflet.js"><\/script><script>[\s\S]*?<\/script>/,
    `<script>${leafletJs}\n${mapScriptBody}</script>`
  );

  return out;
}

function injectPhotoRegistry(html: string, registry: Record<string, string>): string {
  const bootScriptTag = `<script>${buildExportPhotoBootScript()}</script>`;
  return html.replace(
    bootScriptTag,
    `${buildExportPhotoRegistryScript(registry)}${bootScriptTag}`
  );
}

export async function buildExportZip(
  ctx: ExportContext,
  onProgress?: ExportProgressCallback
): Promise<Buffer> {
  const emit = (event: Parameters<ExportProgressCallback>[0]) => onProgress?.(event);

  emit({ step: "html", status: "running", message: "Generando HTML del diario…" });
  const zip = new JSZip();
  let preparedCtx = ctx;
  if (exportHasMap(ctx)) {
    emit({ step: "map", status: "running", message: "Calculando ruta del mapa…" });
    preparedCtx = await prepareExportMapRouteGeometry(ctx);
    emit({ step: "map", status: "done" });
  }

  let staticMapFiles = new Map<string, Buffer>();
  if (exportHasMap(preparedCtx)) {
    emit({ step: "map", status: "running", message: "Generando mapas estáticos offline…" });
    const staticMaps = await fetchHtmlStaticMapImages(
      getExportMapPhotos(preparedCtx),
      preparedCtx.places ?? [],
      preparedCtx.gpsTracks ?? [],
      Boolean(preparedCtx.includeGpsTrail)
    );
    staticMapFiles = staticMaps.files;
    preparedCtx = {
      ...preparedCtx,
      mapStaticLocalPath: staticMaps.localPath,
      mapStaticFlightPath: staticMaps.flightPath,
    };
    emit({ step: "map", status: "done" });
  }

  let html = buildExportHtml(preparedCtx);

  if (exportHasMap(ctx)) {
    emit({ step: "map", status: "running", message: "Preparando mapa interactivo…" });
    html = await inlineMapAssetsInHtml(html, preparedCtx);
    emit({ step: "map", status: "done" });
  }

  addCommonZipFiles(zip, preparedCtx, html);
  emit({ step: "html", status: "done" });

  if (exportHasMap(ctx)) {
    await addLeafletToZip(zip);
  }

  for (const [filePath, buffer] of staticMapFiles) {
    zip.file(filePath, buffer, { compression: "STORE" });
  }

  const total = ctx.photos.length;
  emit({
    step: "pack",
    status: "running",
    message: total > 0 ? `Optimizando fotos (0/${total})…` : "Empaquetando…",
  });

  const photoFiles = await prepareExportPhotoBuffers(
    ctx.travel.id,
    ctx.photos,
    (current, photoTotal) => {
      emit({
        step: "pack",
        status: "running",
        message: `Optimizando fotos (${current}/${photoTotal})…`,
      });
    },
    { includeVideoOriginals: true }
  );

  for (const [filePath, buffer] of photoFiles) {
    zip.file(filePath, buffer, { compression: "STORE" });
  }

  emit({ step: "pack", status: "running", message: "Comprimiendo ZIP…" });
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  emit({ step: "pack", status: "done" });
  return buffer;
}

export async function buildSingleFileHtml(
  ctx: ExportContext,
  onProgress?: ExportProgressCallback
): Promise<Buffer> {
  const emit = (event: Parameters<ExportProgressCallback>[0]) => onProgress?.(event);

  emit({ step: "html", status: "running", message: "Generando HTML del diario…" });
  let preparedCtx = ctx;
  if (exportHasMap(ctx)) {
    emit({ step: "map", status: "running", message: "Calculando ruta del mapa…" });
    preparedCtx = await prepareExportMapRouteGeometry(ctx);
    emit({ step: "map", status: "done" });
  }

  let staticMapFiles = new Map<string, Buffer>();
  if (exportHasMap(preparedCtx)) {
    emit({ step: "map", status: "running", message: "Generando mapas estáticos offline…" });
    const staticMaps = await fetchHtmlStaticMapImages(
      getExportMapPhotos(preparedCtx),
      preparedCtx.places ?? [],
      preparedCtx.gpsTracks ?? [],
      Boolean(preparedCtx.includeGpsTrail)
    );
    staticMapFiles = staticMaps.files;
    preparedCtx = {
      ...preparedCtx,
      mapStaticLocalPath: staticMaps.localPath,
      mapStaticFlightPath: staticMaps.flightPath,
    };
    emit({ step: "map", status: "done" });
  }

  let html = buildExportHtml(preparedCtx);
  emit({ step: "html", status: "done" });

  const total = ctx.photos.length;
  emit({
    step: "pack",
    status: "running",
    message: total > 0 ? `Optimizando fotos (0/${total})…` : "Preparando fotos…",
  });

  const photoFiles = await prepareExportPhotoBuffers(
    ctx.travel.id,
    ctx.photos,
    (current, photoTotal) => {
      emit({
        step: "pack",
        status: "running",
        message: `Optimizando fotos (${current}/${photoTotal})…`,
      });
    },
    { includeVideoOriginals: false }
  );
  for (const [filePath, buffer] of staticMapFiles) {
    photoFiles.set(filePath, buffer);
  }
  emit({ step: "pack", status: "done" });

  emit({
    step: "embed",
    status: "running",
    message: exportHasMap(ctx)
      ? "Incrustando fotos y mapa en un solo HTML…"
      : "Incrustando fotos en un solo HTML…",
  });
  const registry = buildPhotoRegistry(photoFiles);
  if (exportHasMap(ctx)) {
    emit({ step: "map", status: "running", message: "Preparando mapa interactivo…" });
    html = await inlineMapAssetsInHtml(html, preparedCtx, registry);
    emit({ step: "map", status: "done" });
  }
  html = injectPhotoRegistry(html, registry);
  emit({ step: "embed", status: "done" });

  return Buffer.from(html, "utf-8");
}
