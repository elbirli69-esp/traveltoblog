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

export type ExportTypologyId = TravelType | "auto";
export type ExportTemplateId = "magazine" | "visual-journey" | "editorial-clean" | "dark-photo-journey";
export type ExportFormat = "html" | "zip";

export interface MapPoint {
  lat: number;
  lng: number;
  label: string;
  photoPath: string | null;
  date: string;
  emoji?: string;
  kind?: "photo" | "place" | "flight-out" | "flight-in";
  dayKey?: string;
  dayLabel?: string;
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
  localPath: string;
  latitude: number | null;
  longitude: number | null;
  exifDateTime: Date | null;
  alias: string;
  isTransportStart: boolean;
  isTransportEnd: boolean;
}

export interface ExportContext {
  travel: Pick<
    Travel,
    "id" | "title" | "startDate" | "endDate" | "journalMarkdown" | "travelType"
  >;
  users: User[];
  photos: ExportPhoto[];
  places?: ExportPlace[];
  notes?: ExportNote[];
  gpsTracks?: ExportGpsTrack[];
  template: ExportTemplateId;
  typology?: ExportTypologyId;
  includeGpsTrail?: boolean;
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
  const raw = photos
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
      photoPath: p.localPath,
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

export function buildPlaceMapPoints(places: ExportPlace[]): MapPoint[] {
  return places.map((p) => ({
    lat: p.latitude,
    lng: p.longitude,
    label: `${p.name}${p.comment ? ` — ${p.comment}` : ""} (${p.alias})`,
    photoPath: null,
    date: (p.visitedAt ? new Date(p.visitedAt) : new Date()).toISOString(),
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

function pickCoverPhoto(photos: ExportPhoto[]): ExportPhoto | null {
  const candidates = photos.filter((p) => !p.isTransportStart && !p.isTransportEnd);
  return candidates[0] ?? photos[0] ?? null;
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
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = lightbox && lightbox.querySelector("img");
  var lightboxCap = lightbox && lightbox.querySelector(".lightbox-caption");

  document.querySelectorAll(".photo-block img, .gallery-tile img").forEach(function (img) {
    img.addEventListener("click", function () {
      if (!lightbox || !lightboxImg) return;
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt || "";
      if (lightboxCap) {
        var fig = img.closest("figure");
        var cap = fig && fig.querySelector("figcaption");
        lightboxCap.textContent = cap ? cap.textContent : "";
      }
      lightbox.classList.add("open");
      document.body.style.overflow = "hidden";
    });
  });

  if (lightbox) {
    lightbox.addEventListener("click", function () {
      lightbox.classList.remove("open");
      document.body.style.overflow = "";
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        lightbox.classList.remove("open");
        document.body.style.overflow = "";
      }
    });
  }

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.classList.add("visible");
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { observer.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("visible"); });
  }

  var nav = document.querySelector(".section-nav");
  if (nav) {
    window.addEventListener("scroll", function () {
      nav.classList.toggle("scrolled", window.scrollY > 80);
    });
    nav.querySelectorAll("a[href^='#']").forEach(function (link) {
      link.addEventListener("click", function (e) {
        var id = link.getAttribute("href");
        if (!id || id === "#") return;
        var target = document.querySelector(id);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }
})();
`;
}

function buildGallerySection(photos: ExportPhoto[]): string {
  const galleryPhotos = photos
    .filter((p) => !p.isTransportStart && !p.isTransportEnd)
    .sort(
      (a, b) =>
        new Date(a.exifDateTime ?? 0).getTime() - new Date(b.exifDateTime ?? 0).getTime()
    );
  if (galleryPhotos.length === 0) return "";

  const tiles = galleryPhotos
    .map((p, i) => {
      const when = p.exifDateTime
        ? new Intl.DateTimeFormat("es-ES", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(p.exifDateTime)
        : "";
      const caption = when ? `${p.alias} · ${when}` : p.alias;
      return `<figure class="gallery-tile reveal" style="animation-delay:${Math.min(i * 40, 400)}ms"><img src="${escapeHtml(p.localPath)}" alt="Foto de ${escapeHtml(p.alias)}" loading="lazy"><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
    })
    .join("\n");

  return `
<section id="galeria" class="gallery-section reveal">
  <h2 class="section-title">Galería completa</h2>
  <p class="gallery-lead">${galleryPhotos.length} momentos en orden cronológico</p>
  <div class="gallery-grid">${tiles}</div>
</section>`;
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
.map-explorer {
  margin: 0 calc(50% - 50vw);
  width: 100vw;
  max-width: 100vw;
  padding: 2.5rem 1.25rem 1.5rem;
  background: linear-gradient(180deg, rgba(28,25,23,.55) 0%, transparent 100%);
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
  background: rgba(255,255,255,.03);
  color: var(--text);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background .2s, border-color .2s;
}
.map-day-item:hover { background: rgba(255,255,255,.06); }
.map-day-item.active {
  background: rgba(45,212,191,.12);
  border-color: rgba(45,212,191,.35);
}
.map-day-label { font-weight: 600; font-size: .92rem; }
.map-day-meta { font-size: .75rem; color: var(--muted); }
.map-canvas {
  height: min(78vh, 720px);
  min-height: 400px;
  border-radius: 16px;
  overflow: hidden;
  background: #292524;
  border: 1px solid var(--border);
  box-shadow: 0 25px 50px rgba(0,0,0,.3);
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
  box-shadow: 0 25px 50px rgba(0,0,0,.25);
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
.legend-line { display: inline-block; width: 22px; height: 3px; border-radius: 2px; background: #2dd4bf; }
.legend-dash { display: inline-block; width: 22px; height: 0; border-top: 3px dashed #818cf8; }
#map {
  height: min(62vh, 520px);
  border-radius: 14px;
  overflow: hidden;
  background: #292524;
}
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
  opacity: 0;
  transform: translateY(24px);
  transition: opacity .6s ease, transform .6s ease;
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
.gallery-section { margin: 3rem 0 1rem; }
.gallery-lead { color: var(--muted); margin: -.5rem 0 1.5rem; }
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: .75rem;
}
.gallery-tile {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  aspect-ratio: 1;
  opacity: 0;
  transform: scale(.96);
  transition: opacity .5s ease, transform .5s ease;
}
.gallery-tile.visible { opacity: 1; transform: scale(1); }
.gallery-tile img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .4s ease; }
.gallery-tile:hover img { transform: scale(1.08); }
.gallery-tile figcaption {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: .5rem .65rem;
  background: linear-gradient(transparent, rgba(0,0,0,.75));
  font-size: .75rem;
  color: #fff;
}
.reveal { opacity: 0; transform: translateY(20px); transition: opacity .6s ease, transform .6s ease; }
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
  .gallery-grid { grid-template-columns: repeat(2, 1fr); }
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
.photo-block { margin: 2rem 0; opacity: 0; transform: translateY(20px); transition: opacity .5s ease, transform .5s ease; }
.photo-block.visible { opacity: 1; transform: none; }
.photo-frame { border-radius: 14px; overflow: hidden; cursor: zoom-in; box-shadow: 0 20px 50px rgba(0,0,0,.45); }
.photo-block img { width: 100%; display: block; margin: 0; border-radius: 0; box-shadow: none; }
.photo-block figcaption { text-align: center; color: var(--muted); font-size: .9rem; margin-top: .5rem; }
.reveal { opacity: 0; transform: translateY(16px); transition: opacity .5s ease, transform .5s ease; }
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
  if (!pts.length) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of pts) {
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

function buildFullscreenMapSection(dayGroups: ExportMapDayGroup[], mapLead: string): string {
  return `
<section class="map-explorer reveal" id="mapa">
  <div class="map-explorer-header">
    <div>
      <h2>Mapa del viaje</h2>
      <p class="map-lead">${escapeHtml(mapLead)}</p>
    </div>
    <div class="map-legend">
      <span><i class="legend-line"></i> Ruta</span>
      <span><i class="legend-dash"></i> Vuelos</span>
      <span>📍 Lugares</span>
    </div>
  </div>
  <div class="map-explorer-body">
    ${buildMapSidebarHtml(dayGroups)}
    <div id="map" class="map-canvas"></div>
  </div>
</section>`;
}

function buildCompactMapSection(mapLead: string): string {
  return `
<section class="map-section reveal" id="mapa">
  <div class="map-section-inner">
    <h2>Mapa del viaje</h2>
    <p class="map-lead">${escapeHtml(mapLead)}</p>
    <div class="map-legend">
      <span><i class="legend-line"></i> Ruta fotos</span>
      <span><i class="legend-dash"></i> Vuelo ida/vuelta</span>
      <span>📍 Lugares</span>
    </div>
    <div id="map"></div>
  </div>
</section>`;
}

function buildMapScript(
  points: MapPoint[],
  dayGroups: ExportMapDayGroup[],
  assetPrefix = "assets/images"
): string {
  const data = JSON.stringify(points);
  const groupsData = JSON.stringify(dayGroups);
  const tileUrl = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  const tileAttr = "&copy; OpenStreetMap &copy; CARTO";
  const dayColors = ["#2dd4bf", "#f59e0b", "#818cf8", "#f472b6", "#34d399", "#fb7185"];

  return `
(function () {
  var points = ${data};
  var dayGroups = ${groupsData};
  if (!points.length || typeof L === "undefined") return;

  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl: "${assetPrefix}/marker-icon.png",
    iconRetinaUrl: "${assetPrefix}/marker-icon-2x.png",
    shadowUrl: "${assetPrefix}/marker-shadow.png"
  });

  var map = L.map("map", { scrollWheelZoom: true, zoomControl: true });
  window.__travelMap = map;
  L.tileLayer("${tileUrl}", {
    attribution: "${tileAttr}",
    subdomains: "abcd",
    maxZoom: 20
  }).addTo(map);

  var flightOut = points.find(function (p) { return p.kind === "flight-out"; });
  var flightIn = points.find(function (p) { return p.kind === "flight-in"; });
  var photoPoints = points.filter(function (p) { return p.kind === "photo"; });
  var bounds = L.latLngBounds(points.map(function (p) { return [p.lat, p.lng]; }));
  map.fitBounds(bounds.pad(0.18));

  var dayColorIndex = {};
  var colorIdx = 0;
  photoPoints.forEach(function (p) {
    if (p.dayKey && dayColorIndex[p.dayKey] === undefined) {
      dayColorIndex[p.dayKey] = dayColors[colorIdx % dayColors.length];
      colorIdx += 1;
    }
  });

  Object.keys(dayColorIndex).forEach(function (dayKey) {
    var seg = photoPoints.filter(function (p) { return p.dayKey === dayKey; }).map(function (p) { return [p.lat, p.lng]; });
    if (seg.length > 1) {
      L.polyline(seg, { color: dayColorIndex[dayKey], weight: 4, opacity: 0.92, lineJoin: "round" }).addTo(map);
    }
  });

  if (photoPoints.length > 1 && Object.keys(dayColorIndex).length === 0) {
    L.polyline(photoPoints.map(function (p) { return [p.lat, p.lng]; }), { color: "#2dd4bf", weight: 4, opacity: 0.9, lineJoin: "round" }).addTo(map);
  }

  if (flightOut && flightIn) {
    L.polyline(
      [[flightOut.lat, flightOut.lng], [flightIn.lat, flightIn.lng]],
      { color: "#818cf8", weight: 3, opacity: 0.85, dashArray: "10 8" }
    ).addTo(map);
  }

  var photoIndex = 0;
  var markersByDay = {};

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
      marker = L.marker([p.lat, p.lng], { icon: icon }).addTo(map);
      if (p.dayKey) {
        if (!markersByDay[p.dayKey]) markersByDay[p.dayKey] = [];
        markersByDay[p.dayKey].push(marker);
      }
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
    var popup = "<strong>" + escapeHtml(p.label) + "</strong>";
    if (p.photoPath) {
      popup += '<br><img src="' + escapeHtml(p.photoPath) + '" alt="" style="max-width:220px;margin-top:8px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.3)">';
    }
    popup += '<br><small style="color:#78716c">' + new Date(p.date).toLocaleString("es-ES") + "</small>";
    marker.bindPopup(popup, { maxWidth: 260 });
  });

  function flyToGroup(group) {
    if (!group || !group.bounds) return;
    var b = L.latLngBounds(group.bounds);
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
})();
`;
}

function buildExportTimelineEvents(ctx: ExportContext): TimelineEvent[] {
  const urlToLocal = new Map(ctx.photos.map((p) => [p.url, p.localPath]));
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
  return events.map((ev) => ({
    ...ev,
    mediaUrl: ev.mediaUrl ? urlToLocal.get(ev.mediaUrl) ?? ev.mediaUrl : undefined,
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
  const mapPoints = mergeMapPoints(photos, places);
  const photoGpsCount = photos.filter((p) => p.latitude != null && p.longitude != null).length;
  const mapLead =
    photoGpsCount === 0 && photos.length > 0
      ? "Las fotos no tienen GPS en los metadatos; se muestran lugares y vuelos marcados."
      : photoGpsCount < photos.length
        ? `${photoGpsCount} de ${photos.length} fotos con ubicación GPS. Pulsa un día para hacer zoom en ese tramo.`
        : "Pulsa un día para hacer zoom en ese tramo del recorrido";
  const urlToLocal = new Map(photos.map((p) => [p.url, p.localPath]));
  const rawHtml = markdownToHtml(rewriteMarkdownImagePaths(markdown, urlToLocal));
  const contentHtml =
    template === "editorial-clean" ? rawHtml : enhanceArticleHtml(rawHtml);
  const dateRange = formatDateRange(travel.startDate, travel.endDate);
  const hasMap = mapPoints.length > 0;
  const isMagazine = template === "magazine";
  const isVisual = template === "visual-journey" || template === "dark-photo-journey";
  const isInteractive = template !== "editorial-clean";
  const coverPhoto = pickCoverPhoto(photos);
  const notes = ctx.notes ?? [];
  const tripNote = findTripNote(notes);
  const deck = extractDeck(travel.journalMarkdown, tripNote);
  const hasJournalArticle = Boolean(travel.journalMarkdown?.trim());
  const storyTimelineOptions = { excludeJournalChunks: hasJournalArticle };
  const dayCount = timelineEvents.filter((e) => e.kind === "day-boundary").length;
  const distanceKm = estimateRouteKm(photos);
  const travelers = users.map((u) => u.alias).join(", ");

  const heroStyle = coverPhoto
    ? isMagazine
      ? `background-image: linear-gradient(to top, rgba(250,249,247,.92), rgba(250,249,247,.4)), url('${coverPhoto.localPath}');`
      : `background-image: linear-gradient(to top, rgba(12,10,9,.88), rgba(12,10,9,.25)), url('${coverPhoto.localPath}');`
    : "";

  const headerBlock = isMagazine
    ? `${buildMagazineHero({
        title: travel.title,
        deck,
        dateRange,
        travelers,
        typologyLabel: profile.label,
        heroStyle,
      })}
${buildTocHtml(timelineEvents)}
${buildMagazineNav(hasMap, hasJournalArticle)}`
    : isVisual
      ? `<header class="hero" style="${heroStyle}">
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
      ${hasMap ? '<a href="#mapa">Mapa</a>' : ""}
      <a href="#cronologia">Recorrido</a>
      ${hasJournalArticle ? '<a href="#historia">Crónica</a>' : ""}
      <a href="#galeria">Galería</a>
      ${profile.playProfile.showScrubber ? '<a href="#reproducir">Reproducir</a>' : ""}
    </nav>`
      : `<header>
      <h1>${escapeHtml(travel.title)}</h1>
      <p class="meta">${escapeHtml(dateRange)} · ${users.map((u) => escapeHtml(u.alias)).join(", ")} · ${escapeHtml(profile.label)}</p>
    </header>`;

  const mapDayGroups = hasMap ? buildMapDayGroups(mapPoints) : [];
  const mapBlock = hasMap
    ? isVisual || isMagazine
      ? buildFullscreenMapSection(mapDayGroups, mapLead)
      : buildCompactMapSection(mapLead)
    : "";

  const galleryBlock = isVisual || isMagazine ? buildGallerySection(photos) : "";
  const storyAnchor = isVisual || isMagazine ? ' id="historia"' : "";
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
  const calloutsBlock = isMagazine ? buildPlaceCalloutsHtml(places) : "";
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

  const magazineSectionOrder: typeof profile.sectionOrder = [
    "stats",
    "map",
    "timeline",
    "journal",
    "gallery",
  ];

  const sectionBlocks: Record<string, string> = {
    hero: "",
    stats: statsBlock,
    flights: flightsBlock,
    map: mapBlock,
    timeline: timelineBlock,
    gallery: galleryBlock,
    journal: hasJournalArticle
      ? `<section class="journal-section reveal"><h2 class="section-title">Crónica del viaje</h2><article${storyAnchor}>${contentHtml}</article></section>`
      : "",
    play: playBlock,
  };

  const sectionOrder = isMagazine ? magazineSectionOrder : profile.sectionOrder;
  const showMapOuter = (isVisual || isMagazine) && hasMap;

  const orderedMiddle = [
    ...sectionOrder
      .filter((id) => id !== "hero" && sectionBlocks[id])
      .filter((id) => !(showMapOuter && id === "map"))
      .map((id) => sectionBlocks[id]),
    calloutsBlock,
    closingBlock,
  ]
    .filter(Boolean)
    .join("\n");

  const lightboxBlock = isInteractive
    ? `<div id="lightbox" role="dialog" aria-label="Visor de fotos"><img src="" alt=""><p class="lightbox-caption"></p></div>`
    : "";

  const timelineJson = JSON.stringify(timelineEvents).replace(/</g, "\\u003c");
  const extraStyles = (isMagazine || isVisual ? timelineExportStyles() : "") + playModeStyles();
  const interactiveScript = isInteractive
    ? `<script>${buildInteractiveScripts(template)}${isMagazine ? buildMagazineInteractiveScript() : ""}</script>`
    : "";
  const timelineScript = `<script>window.__TRAVEL_TIMELINE__=${timelineJson};</script><script>${buildTimelineSyncScript()}</script>`;
  const playScript =
    profile.playProfile.showScrubber && isInteractive && !isMagazine
      ? `<script>${buildPlayModeScript(timelineEvents, profile)}</script>`
      : "";

  const mapOuter = showMapOuter ? mapBlock : "";
  const mapInner = !showMapOuter ? mapBlock : "";
  const headMeta = isMagazine
    ? buildHeadMeta({
        title: travel.title,
        deck,
        dateRange,
        coverImagePath: coverPhoto?.localPath ?? null,
      })
    : "";

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
  ${hasMap ? `<script src="assets/leaflet.js"></script><script>${buildMapScript(mapPoints, mapDayGroups, "assets/images")}</script>` : ""}
  ${playScript}
  ${interactiveScript}
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
  // Export HTML/PDF: siempre archivos originales en disco (no miniaturas).
  const selected = photos.filter((p) => p.selected);
  return Promise.all(
    selected.map(async (photo, index) => {
      const ext = path.extname(photo.filename) || ".jpg";
      const localPath = `photos/${String(index + 1).padStart(3, "0")}${ext}`;
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
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        exifDateTime: resolved.dateTime,
        alias: photo.user.alias,
        isTransportStart: photo.isTransportStart,
        isTransportEnd: photo.isTransportEnd,
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
  return mergeMapPoints(ctx.photos, ctx.places ?? []).length > 0;
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

  const explicitType =
    ctx.typology && ctx.typology !== "auto" ? ctx.typology : ctx.travel.travelType ?? "GENERIC";
  zip.file(
    "README.txt",
    `TravelToBlog export\nTipología: ${explicitType}\nPlantilla: ${ctx.template}\nGenerado: ${new Date().toISOString()}\n`
  );

  const timelineEvents = buildExportTimelineEvents(ctx);
  zip.file("assets/timeline.json", JSON.stringify(timelineEvents, null, 2));

  if (exportHasMap(ctx)) {
    const leaflet = await getLeafletAssets();
    zip.file("assets/leaflet.css", patchLeafletCss(leaflet["leaflet.css"].toString("utf-8")));
    zip.file("assets/leaflet.js", leaflet["leaflet.js"]);
    zip.folder("assets/images")?.file("marker-icon.png", leaflet["images/marker-icon.png"]);
    zip.folder("assets/images")?.file("marker-icon-2x.png", leaflet["images/marker-icon-2x.png"]);
    zip.folder("assets/images")?.file("marker-shadow.png", leaflet["images/marker-shadow.png"]);
  }

  for (const photo of ctx.photos) {
    const buf = await readPhotoBuffer(photo.url);
    if (buf) zip.file(photo.localPath, buf);
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function buildSingleFileHtml(ctx: ExportContext): Promise<Buffer> {
  const zipBuffer = await buildExportZip(ctx);
  const zip = await JSZip.loadAsync(zipBuffer);
  let html = await zip.file("index.html")!.async("string");

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

  if (exportHasMap(ctx)) {
    const leafletCss = await zip.file("assets/leaflet.css")!.async("string");
    const leafletJs = await zip.file("assets/leaflet.js")!.async("string");
    const markerIcon = await zip.file("assets/images/marker-icon.png")!.async("base64");
    const markerIcon2x = await zip.file("assets/images/marker-icon-2x.png")!.async("base64");
    const markerShadow = await zip.file("assets/images/marker-shadow.png")!.async("base64");

    html = html.replace(
      '<link rel="stylesheet" href="assets/leaflet.css">',
      `<style>${leafletCss}
.leaflet-marker-icon { background-image: url(data:image/png;base64,${markerIcon}) !important; }
.leaflet-marker-icon.leaflet-marker-icon-2x { background-image: url(data:image/png;base64,${markerIcon2x}) !important; }
.leaflet-marker-shadow { background-image: url(data:image/png;base64,${markerShadow}) !important; }
</style>`
    );

    const mapPoints = mergeMapPoints(ctx.photos, ctx.places ?? []).map((p) => ({
      ...p,
      photoPath: p.photoPath ? photoDataUrls.get(p.photoPath) ?? p.photoPath : null,
    }));

    const iconScript = `delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "data:image/png;base64,${markerIcon}",
  iconRetinaUrl: "data:image/png;base64,${markerIcon2x}",
  shadowUrl: "data:image/png;base64,${markerShadow}"
});`;

    const mapDayGroups = buildMapDayGroups(mapPoints);
    const mapScriptBody = buildMapScript(mapPoints, mapDayGroups, "assets/images").replace(
      /delete L\.Icon\.Default\.prototype\._getIconUrl;[\s\S]*?}\);/,
      iconScript
    );

    html = html.replace(
      /<script src="assets\/leaflet.js"><\/script><script>[\s\S]*?<\/script>/,
      `<script>${leafletJs}\n${mapScriptBody}</script>`
    );
  }

  return Buffer.from(html, "utf-8");
}
