import { formatDateKey, isoToDateKey } from "@/lib/travel-dates";
import { getPdfThemeCss, pageDimensions } from "@/lib/export-pdf-themes";
import {
  extractDayNarratives,
  resolveDayNarrativeHtml,
} from "@/lib/export/journal-prose";
import {
  buildDayLegend,
  buildRouteNodesFromPhotosAndPlaces,
  coalesceRouteNodes,
  resolveDayLegend,
  type RouteDayLegendEntry,
} from "@/lib/mapbox-route";
import type { PdfExportContext, PdfPageFormat, PdfPhotoAsset } from "@/lib/export-pdf-types";
import { typePackCss } from "@/lib/export/type-packs";
import type { TypePackId } from "@/lib/export/type-packs";

export type PdfPageKind =
  | "cover"
  | "map"
  | "map-flights"
  | "day-divider"
  | "full-bleed"
  | "featured"
  | "pair"
  | "mosaic"
  | "closing";

export interface PdfPlannedPage {
  kind: PdfPageKind;
  pageNumber: number;
  dayKey?: string;
  photos?: PdfPhotoAsset[];
  narrative?: string;
  quote?: string;
  dayTitle?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export {
  stripMarkdownImagesAndBylines,
  extractDayNarratives as extractPdfDayNarratives,
} from "@/lib/export/journal-prose";

function resolvePdfMapDayLegend(ctx: PdfExportContext): RouteDayLegendEntry[] {
  const existing = resolveDayLegend(ctx.mapDayLegend ?? []);
  if (existing.length > 0) return existing;
  const nodes = coalesceRouteNodes(
    buildRouteNodesFromPhotosAndPlaces(
      ctx.photos.map((photo) => ({
        latitude: photo.latitude,
        longitude: photo.longitude,
        exifDateTime: photo.exifDateTime,
        isTransportStart: photo.isTransportStart,
        isTransportEnd: photo.isTransportEnd,
      })),
      []
    )
  );
  return buildDayLegend(nodes);
}

function buildPdfDayLegendHtml(entries: RouteDayLegendEntry[]): string {
  if (entries.length === 0) {
    return `<span class="map-legend-item"><i style="background:#2dd4bf"></i>Ruta por carretera</span>`;
  }
  return entries
    .map(
      (entry) =>
        `<span class="map-legend-item"><i style="background:${escapeHtml(entry.color)}"></i>${escapeHtml(entry.label)}</span>`
    )
    .join("");
}

function formatDateRange(start: Date | null, end: Date | null): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(d);
  if (start && end) return `${fmt(start)} — ${fmt(end)}`;
  if (start) return `Desde ${fmt(start)}`;
  if (end) return `Hasta ${fmt(end)}`;
  return "";
}

/** Soft cap for photo notes so captions stay under the image, not a text column. */
export const PDF_NOTE_MAX_CHARS = 150;

export function clampPdfNote(
  text: string | null | undefined,
  maxChars = PDF_NOTE_MAX_CHARS
): string {
  const cleaned = (text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) return cleaned;
  const slice = cleaned.slice(0, Math.max(0, maxChars - 1));
  const broken = slice.replace(/\s+\S*$/, "").trimEnd();
  const base = broken.length >= Math.floor(maxChars * 0.6) ? broken : slice.trimEnd();
  return `${base}…`;
}

function photoDayKey(photo: PdfPhotoAsset): string | null {
  if (!photo.exifDateTime) return null;
  return isoToDateKey(photo.exifDateTime.toISOString());
}

function photoCaption(photo: PdfPhotoAsset): string {
  const parts: string[] = [];
  if (photo.exifDateTime) {
    parts.push(
      new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(photo.exifDateTime)
    );
  }
  if (photo.placeName) parts.push(photo.placeName);
  return parts.join(" · ") || photo.alias;
}

/** Traveler note under a photo (clamped). Empty when there is no note. */
export function photoNoteCaption(photo: PdfPhotoAsset): string {
  return clampPdfNote(photo.notes[0]);
}

function photoSubcaption(photo: PdfPhotoAsset): string {
  const note = photoNoteCaption(photo);
  if (note) return note;
  return `@${photo.alias}`;
}

function photoSrc(photo: PdfPhotoAsset, bleed = false): string {
  return bleed ? photo.bleedImagePath : photo.imagePath;
}

function pickHeroPhoto(photos: PdfPhotoAsset[], coverPhotoId?: string | null): PdfPhotoAsset {
  if (coverPhotoId) {
    const chosen = photos.find((p) => p.id === coverPhotoId);
    if (chosen) return chosen;
  }
  const sorted = [...photos].sort(
    (a, b) => (b.highlightScore ?? 5) - (a.highlightScore ?? 5)
  );
  return sorted[0] ?? photos[0]!;
}

function groupPhotosByDay(photos: PdfPhotoAsset[]): Map<string, PdfPhotoAsset[]> {
  const groups = new Map<string, PdfPhotoAsset[]>();
  for (const photo of photos) {
    const key = photoDayKey(photo) ?? "sin-fecha";
    const list = groups.get(key) ?? [];
    list.push(photo);
    groups.set(key, list);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function isLowScore(photo: PdfPhotoAsset): boolean {
  // Pack mid-tier shots into mosaics; reserve full-bleed/featured for true highlights.
  return (photo.highlightScore ?? 5) < 8;
}

/**
 * Pack small/low-score photos densely: prefer 8 (2×4), then 6/5 (2×3),
 * then a single row of 4 or 3.
 */
function takeMosaicBatch(dayPhotos: PdfPhotoAsset[], start: number): number {
  const remaining = dayPhotos.length - start;
  if (remaining < 3) return 0;

  for (const size of [8, 6, 5, 4, 3] as const) {
    if (remaining < size) continue;
    const slice = dayPhotos.slice(start, start + size);
    if (slice.every(isLowScore)) return size;
  }
  return 0;
}

/** Plain-text length of day narrative HTML — drives column width. */
function narrativePlainLength(html: string | undefined): number {
  if (!html) return 0;
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

/** Wider column when the day summary needs more room to stay on one page. */
function dividerIntroClass(narrative: string | undefined): string {
  const len = narrativePlainLength(narrative);
  if (len >= 650) return "divider-intro divider-intro--xl";
  if (len >= 280) return "divider-intro divider-intro--wide";
  return "divider-intro";
}

/** Mosaic grid columns: 4 for 7–8 / 4 photos, 3 for 5–6 / 3. */
function mosaicColumnCount(photoCount: number): number {
  if (photoCount >= 7) return 4;
  if (photoCount >= 5) return 3;
  if (photoCount === 4) return 4;
  return 3;
}

/** Build a rhythmic photobook page sequence (Fotoprix / CEWE style). */
export function planPdfPages(ctx: PdfExportContext): PdfPlannedPage[] {
  const photos = [...ctx.photos].sort(
    (a, b) =>
      new Date(a.exifDateTime ?? 0).getTime() - new Date(b.exifDateTime ?? 0).getTime()
  );
  if (photos.length === 0) return [];

  const dayNarratives = extractDayNarratives(ctx.travel.journalMarkdown);
  const byDay = groupPhotosByDay(photos);
  const pages: PdfPlannedPage[] = [];
  let pageNumber = 0;

  const push = (page: Omit<PdfPlannedPage, "pageNumber">) => {
    pageNumber += 1;
    pages.push({ ...page, pageNumber });
  };

  push({ kind: "cover", photos: [pickHeroPhoto(photos, ctx.coverPhotoId)] });

  if (ctx.mapFlightImagePath) {
    push({ kind: "map-flights" });
  }
  if (ctx.mapImagePath) {
    push({ kind: "map" });
  }

  let dayIndex = 0;

  for (const [dayKey, dayPhotos] of byDay) {
    const dayTitle =
      dayKey === "sin-fecha" ? "Recuerdos" : formatDateKey(dayKey, "long");
    const narrative = resolveDayNarrativeHtml(
      dayKey,
      dayTitle,
      dayIndex,
      dayNarratives
    );

    const dir = ctx.pdfDirectives;
    const mosaicBias = dir?.mosaicBias ?? "medium";
    const preferFullBleed = dir?.preferFullBleed ?? "medium";
    const imageEmphasis = dir?.imageEmphasis ?? "medium";
    const proseDensity = dir?.proseDensity ?? "medium";

    const busyThreshold =
      mosaicBias === "high" ? 3 : mosaicBias === "low" ? 6 : 4;
    const busyDay = dayPhotos.length >= busyThreshold;

    const bleedScore =
      preferFullBleed === "high" || imageEmphasis === "high"
        ? 7
        : preferFullBleed === "low" && imageEmphasis === "low"
          ? 9
          : 8;
    const pairScoreCap =
      imageEmphasis === "high" ? 6 : imageEmphasis === "low" ? 8 : 7;
    const narrativeMinPhotos =
      proseDensity === "high" ? 1 : proseDensity === "low" ? 4 : 2;
    const includeNarrative =
      proseDensity !== "low" && dayPhotos.length > narrativeMinPhotos;

    push({
      kind: "day-divider",
      dayKey,
      dayTitle,
      narrative: includeNarrative ? narrative : undefined,
    });

    let i = 0;
    while (i < dayPhotos.length) {
      const photo = dayPhotos[i]!;
      const score = photo.highlightScore ?? 5;
      const isFirstOfDay = i === 0;
      const next = dayPhotos[i + 1];

      if (busyDay) {
        const mosaicCount = takeMosaicBatch(dayPhotos, i);
        if (mosaicCount >= 3) {
          push({ kind: "mosaic", photos: dayPhotos.slice(i, i + mosaicCount) });
          i += mosaicCount;
          continue;
        }
      }

      if (isFirstOfDay || score >= bleedScore) {
        push({ kind: "full-bleed", photos: [photo] });
        i += 1;
        continue;
      }

      if (
        next &&
        score < pairScoreCap &&
        (next.highlightScore ?? 5) < pairScoreCap
      ) {
        push({ kind: "pair", photos: [photo, next] });
        i += 2;
        continue;
      }

      // Featured is photo-led: crónica stays on the day-divider only.
      push({
        kind: "featured",
        photos: [photo],
      });
      i += 1;
    }

    dayIndex += 1;
  }

  push({ kind: "closing" });
  return pages;
}

function renderPageFooter(pageNumber: number, _totalPages: number): string {
  if (pageNumber <= 1) return "";
  return `<footer class="page-footer"><span>${pageNumber}</span></footer>`;
}

function renderCover(
  ctx: PdfExportContext,
  page: PdfPlannedPage,
  format: PdfPageFormat,
  totalPages: number
): string {
  const hero = page.photos?.[0];
  const { width, height } = pageDimensions(format);
  const dateRange = formatDateRange(ctx.travel.startDate, ctx.travel.endDate);
  const participants = ctx.users.map((u) => escapeHtml(u.alias)).join(" · ");

  return `
  <section class="page page-cover page-bleed-full" style="width:${width};height:${height}">
    ${
      hero
        ? `<img class="cover-photo" src="${escapeHtml(photoSrc(hero, true))}" alt="" />`
        : ""
    }
    <div class="cover-scrim"></div>
    <div class="cover-inner">
      <p class="cover-eyebrow">${escapeHtml(dateRange)}</p>
      <h1 class="cover-title">${escapeHtml(ctx.travel.title)}</h1>
      <p class="cover-sub">${participants}</p>
    </div>
    ${renderPageFooter(page.pageNumber, totalPages)}
  </section>`;
}

function renderMap(
  ctx: PdfExportContext,
  page: PdfPlannedPage,
  format: PdfPageFormat,
  totalPages: number,
  variant: "local" | "flights" = "local"
): string {
  const imagePath =
    variant === "flights" ? ctx.mapFlightImagePath : ctx.mapImagePath;
  if (!imagePath) return "";
  const { width, height } = pageDimensions(format);
  const gpsCount =
    variant === "flights"
      ? ctx.mapFlightPointCount ?? 2
      : ctx.mapPointCount ??
        ctx.photos.filter((p) => p.latitude != null && p.longitude != null).length;
  const routeHint =
    variant === "flights"
      ? "Trayecto aéreo · ida y vuelta"
      : ctx.mapRouteMode === "segmented"
        ? "Color por día · carretera entre paradas"
        : ctx.mapRouteMode === "directions"
          ? "Color por día · ruta por carretera"
          : "Color por día · ruta cronológica";
  const legend =
    variant === "flights"
      ? `<span class="map-legend-item"><i style="background:#818cf8;height:0;border-top:1.2mm dashed #818cf8;border-radius:0"></i>Vuelo ida / vuelta</span>`
      : buildPdfDayLegendHtml(resolvePdfMapDayLegend(ctx));
  const dualLocal = Boolean(ctx.mapFlightImagePath);
  const eyebrow =
    variant === "flights"
      ? "Trayecto / llegada"
      : dualLocal
        ? "En destino"
        : "Mapa del viaje";
  const caption =
    variant === "flights"
      ? `${gpsCount} puntos · vuelos`
      : `${gpsCount} paradas · A→B · ${routeHint}`;

  return `
  <section class="page page-map" style="width:${width};height:${height}">
    <div class="map-inner">
      <div class="map-content">
        <p class="map-eyebrow">${eyebrow}</p>
        <h2 class="map-title">${escapeHtml(ctx.travel.title)}</h2>
        <div class="map-frame">
          <img src="${escapeHtml(imagePath)}" alt="${escapeHtml(eyebrow)}" />
        </div>
        <div class="map-legend">${legend}</div>
        <p class="map-caption">${caption}</p>
      </div>
    </div>
    ${renderPageFooter(page.pageNumber, totalPages)}
  </section>`;
}

function renderDayDivider(
  page: PdfPlannedPage,
  format: PdfPageFormat,
  totalPages: number
): string {
  const { width, height } = pageDimensions(format);
  return `
  <section class="page page-divider" style="width:${width};height:${height}">
    <div class="divider-inner">
      <p class="divider-eyebrow">Capítulo</p>
      <h2 class="divider-title">${escapeHtml(page.dayTitle ?? "")}</h2>
      ${
        page.narrative
          ? `<div class="${dividerIntroClass(page.narrative)}">${page.narrative}</div>`
          : '<div class="divider-rule"></div>'
      }
    </div>
    ${renderPageFooter(page.pageNumber, totalPages)}
  </section>`;
}

function renderFullBleed(
  page: PdfPlannedPage,
  format: PdfPageFormat,
  totalPages: number
): string {
  const photo = page.photos?.[0];
  if (!photo) return "";
  const { width, height } = pageDimensions(format);
  return `
  <section class="page page-bleed page-bleed-full" style="width:${width};height:${height}">
    <img class="bleed-photo" src="${escapeHtml(photoSrc(photo, true))}" alt="" />
    <div class="bleed-caption">
      <p class="caption-main">${escapeHtml(photoCaption(photo))}</p>
      <p class="caption-sub">${escapeHtml(photoSubcaption(photo))}</p>
    </div>
    ${renderPageFooter(page.pageNumber, totalPages)}
  </section>`;
}

function renderMosaic(
  page: PdfPlannedPage,
  format: PdfPageFormat,
  totalPages: number
): string {
  const photos = page.photos ?? [];
  if (photos.length < 3) return "";
  const { width, height } = pageDimensions(format);
  const cols = mosaicColumnCount(photos.length);
  const dense = photos.length >= 5;
  const cellWidth = `${(100 / cols).toFixed(4)}%`;
  const pageClass = dense ? "page page-mosaic page-mosaic--dense" : "page page-mosaic";

  // WeasyPrint has weak CSS Grid support — use HTML tables (N columns × rows).
  const rowsHtml: string[] = [];
  for (let i = 0; i < photos.length; i += cols) {
    const rowPhotos = photos.slice(i, i + cols);
    const cells = rowPhotos
      .map(
        (photo) => `
      <td class="mosaic-cell" style="width:${cellWidth}">
        <div class="photo-mat mosaic-mat">
          <img src="${escapeHtml(photoSrc(photo))}" alt="" />
        </div>
        <p class="mosaic-caption">${escapeHtml(photoCaption(photo))}</p>
      </td>`
      )
      .join("");
    // Pad incomplete last row so column widths stay even in WeasyPrint.
    const pad = cols - rowPhotos.length;
    const pads =
      pad > 0
        ? Array.from({ length: pad }, () => `<td class="mosaic-cell mosaic-cell--empty" style="width:${cellWidth}"></td>`).join("")
        : "";
    rowsHtml.push(`<tr class="mosaic-row">${cells}${pads}</tr>`);
  }

  return `
  <section class="${pageClass}" style="width:${width};height:${height}">
    <table class="mosaic-table" cellspacing="0" cellpadding="0">
      <tbody>
        ${rowsHtml.join("\n")}
      </tbody>
    </table>
    ${renderPageFooter(page.pageNumber, totalPages)}
  </section>`;
}

function renderFeatured(
  page: PdfPlannedPage,
  format: PdfPageFormat,
  totalPages: number
): string {
  const photo = page.photos?.[0];
  if (!photo) return "";
  const { width, height } = pageDimensions(format);
  const note = photoNoteCaption(photo);
  return `
  <section class="page page-featured" style="width:${width};height:${height}">
    <div class="featured-inner">
      <div class="photo-mat featured-mat">
        <img src="${escapeHtml(photoSrc(photo))}" alt="" />
      </div>
      <p class="featured-caption">${escapeHtml(photoCaption(photo))}</p>
      ${
        note
          ? `<p class="featured-note">«${escapeHtml(note)}»</p>`
          : `<p class="featured-byline">@${escapeHtml(photo.alias)}</p>`
      }
    </div>
    ${renderPageFooter(page.pageNumber, totalPages)}
  </section>`;
}

function renderPair(
  page: PdfPlannedPage,
  format: PdfPageFormat,
  totalPages: number
): string {
  const [left, right] = page.photos ?? [];
  if (!left || !right) return "";
  const { width, height } = pageDimensions(format);
  const cell = (photo: PdfPhotoAsset) => {
    const note = photoNoteCaption(photo);
    return `
    <div class="pair-cell">
      <div class="photo-mat pair-mat">
        <img src="${escapeHtml(photoSrc(photo))}" alt="" />
      </div>
      <p class="pair-caption">${escapeHtml(photoCaption(photo))}</p>
      ${note ? `<p class="pair-note">«${escapeHtml(note)}»</p>` : ""}
    </div>`;
  };

  return `
  <section class="page page-pair" style="width:${width};height:${height}">
    ${cell(left)}
    ${cell(right)}
    ${renderPageFooter(page.pageNumber, totalPages)}
  </section>`;
}

function renderClosing(
  ctx: PdfExportContext,
  page: PdfPlannedPage,
  format: PdfPageFormat,
  totalPages: number
): string {
  const { width, height } = pageDimensions(format);
  return `
  <section class="page page-closing" style="width:${width};height:${height}">
    <div class="closing-inner">
      <p class="closing-eyebrow">Fin del viaje</p>
      <h2 class="closing-title">${escapeHtml(ctx.travel.title)}</h2>
      <p class="closing-meta">${escapeHtml(formatDateRange(ctx.travel.startDate, ctx.travel.endDate))}</p>
      <p class="closing-brand">TravelToBlog</p>
    </div>
    ${renderPageFooter(page.pageNumber, totalPages)}
  </section>`;
}

function renderPage(
  ctx: PdfExportContext,
  page: PdfPlannedPage,
  format: PdfPageFormat,
  totalPages: number
): string {
  switch (page.kind) {
    case "cover":
      return renderCover(ctx, page, format, totalPages);
    case "map":
      return renderMap(ctx, page, format, totalPages, "local");
    case "map-flights":
      return renderMap(ctx, page, format, totalPages, "flights");
    case "day-divider":
      return renderDayDivider(page, format, totalPages);
    case "full-bleed":
      return renderFullBleed(page, format, totalPages);
    case "mosaic":
      return renderMosaic(page, format, totalPages);
    case "featured":
      return renderFeatured(page, format, totalPages);
    case "pair":
      return renderPair(page, format, totalPages);
    case "closing":
      return renderClosing(ctx, page, format, totalPages);
    default:
      return "";
  }
}

export function buildPrintHtml(ctx: PdfExportContext): string {
  const template = ctx.template ?? "classic";
  const pages = planPdfPages(ctx);
  const totalPages = pages.length;
  const body = pages
    .map((p) => renderPage(ctx, p, ctx.format, totalPages))
    .join("\n");

  const typePack: TypePackId =
    ctx.typePack ??
    (template === "minimal" ? "sans-clean" : "serif-editorial");
  const packCss = typePackCss(typePack);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(ctx.travel.title)} — Álbum</title>
  <style>
    ${getPdfThemeCss(template, ctx.format)}
    ${packCss}
  </style>
</head>
<body class="export-type--${typePack}" data-type-pack="${typePack}" data-pdf-template="${template}">
  ${body}
</body>
</html>`;
}
