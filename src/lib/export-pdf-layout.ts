import { marked } from "marked";
import { formatDateKey, isoToDateKey } from "@/lib/travel-dates";
import { getPdfThemeCss, pageDimensions } from "@/lib/export-pdf-themes";
import type { PdfExportContext, PdfPageFormat, PdfPhotoAsset } from "@/lib/export-pdf-types";

export type PdfPageKind =
  | "cover"
  | "map"
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

function formatDateRange(start: Date | null, end: Date | null): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(d);
  if (start && end) return `${fmt(start)} — ${fmt(end)}`;
  if (start) return `Desde ${fmt(start)}`;
  if (end) return `Hasta ${fmt(end)}`;
  return "";
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

function photoSubcaption(photo: PdfPhotoAsset): string {
  if (photo.notes[0]) return photo.notes[0];
  return `@${photo.alias}`;
}

function photoSrc(photo: PdfPhotoAsset, bleed = false): string {
  return bleed ? photo.bleedImagePath : photo.imagePath;
}

function splitNarrativeSections(markdown: string | null): string[] {
  if (!markdown?.trim()) return [];
  const raw = markdown.trim();
  if (!/^##\s+/m.test(raw)) {
    return [marked.parse(raw, { async: false }) as string];
  }
  return raw
    .split(/\n(?=##\s+)/)
    .filter((s) => s.trim())
    .map((section) => marked.parse(section.trim(), { async: false }) as string);
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
  return (photo.highlightScore ?? 5) < 7;
}

function takeMosaicBatch(dayPhotos: PdfPhotoAsset[], start: number): number {
  const remaining = dayPhotos.length - start;
  if (remaining < 3) return 0;
  const slice = dayPhotos.slice(start, start + 4);
  if (!slice.every(isLowScore)) return 0;
  if (remaining >= 4) return 4;
  return remaining >= 3 ? 3 : 0;
}

/** Build a rhythmic photobook page sequence (Fotoprix / CEWE style). */
export function planPdfPages(ctx: PdfExportContext): PdfPlannedPage[] {
  const photos = [...ctx.photos].sort(
    (a, b) =>
      new Date(a.exifDateTime ?? 0).getTime() - new Date(b.exifDateTime ?? 0).getTime()
  );
  if (photos.length === 0) return [];

  const narratives = splitNarrativeSections(ctx.travel.journalMarkdown);
  const byDay = groupPhotosByDay(photos);
  const pages: PdfPlannedPage[] = [];
  let pageNumber = 0;

  const push = (page: Omit<PdfPlannedPage, "pageNumber">) => {
    pageNumber += 1;
    pages.push({ ...page, pageNumber });
  };

  push({ kind: "cover", photos: [pickHeroPhoto(photos, ctx.coverPhotoId)] });

  if (ctx.mapImagePath) {
    push({ kind: "map" });
  }

  let narrativeIndex = 0;
  let dayIndex = 0;

  for (const [dayKey, dayPhotos] of byDay) {
    const dayTitle =
      dayKey === "sin-fecha" ? "Recuerdos" : formatDateKey(dayKey, "long");
    const narrative = narratives[narrativeIndex] ?? narratives[narratives.length - 1];
    if (narratives.length > 0 && dayIndex < narratives.length) narrativeIndex += 1;

    const busyDay = dayPhotos.length >= 5;

    push({
      kind: "day-divider",
      dayKey,
      dayTitle,
      narrative: dayPhotos.length > 2 ? narrative : undefined,
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

      if (isFirstOfDay || score >= 8) {
        push({ kind: "full-bleed", photos: [photo] });
        i += 1;
        continue;
      }

      if (next && score < 7 && (next.highlightScore ?? 5) < 7) {
        push({ kind: "pair", photos: [photo, next] });
        i += 2;
        continue;
      }

      const section =
        narratives[Math.min(narrativeIndex, narratives.length - 1)] ?? narratives[0];
      push({
        kind: "featured",
        photos: [photo],
        narrative: section,
        quote: photo.notes[0] ?? undefined,
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
  totalPages: number
): string {
  if (!ctx.mapImagePath) return "";
  const { width, height } = pageDimensions(format);
  const gpsCount = ctx.photos.filter(
    (p) => p.latitude != null && p.longitude != null
  ).length;

  return `
  <section class="page page-map" style="width:${width};height:${height}">
    <div class="map-inner">
      <div class="map-content">
        <p class="map-eyebrow">Ruta del viaje</p>
        <h2 class="map-title">${escapeHtml(ctx.travel.title)}</h2>
        <div class="map-frame">
          <img src="${escapeHtml(ctx.mapImagePath)}" alt="Mapa de la ruta" />
        </div>
        <p class="map-caption">${gpsCount} puntos con GPS · orden cronológico</p>
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
          ? `<div class="divider-intro">${page.narrative}</div>`
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
  const cellWidth = photos.length === 4 ? "25%" : `${(100 / photos.length).toFixed(2)}%`;

  const cells = photos
    .map(
      (photo) => `
    <div class="mosaic-cell" style="width:${cellWidth}">
      <div class="photo-mat mosaic-mat">
        <img src="${escapeHtml(photoSrc(photo))}" alt="" />
      </div>
      <p class="mosaic-caption">${escapeHtml(photoCaption(photo))}</p>
    </div>`
    )
    .join("");

  return `
  <section class="page page-mosaic" style="width:${width};height:${height}">
    <div class="mosaic-row">${cells}</div>
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
  return `
  <section class="page page-featured" style="width:${width};height:${height}">
    <div class="featured-photo-col">
      <div class="photo-mat">
        <img src="${escapeHtml(photoSrc(photo))}" alt="" />
      </div>
      <p class="featured-caption">${escapeHtml(photoCaption(photo))}</p>
    </div>
    <div class="featured-text-col">
      ${page.narrative ? `<div class="featured-narrative">${page.narrative}</div>` : ""}
      ${
        page.quote
          ? `<blockquote class="featured-quote">«${escapeHtml(page.quote)}»</blockquote>`
          : ""
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
  const cell = (photo: PdfPhotoAsset) => `
    <div class="pair-cell">
      <div class="photo-mat pair-mat">
        <img src="${escapeHtml(photoSrc(photo))}" alt="" />
      </div>
      <p class="pair-caption">${escapeHtml(photoCaption(photo))}</p>
      ${
        photo.notes[0]
          ? `<p class="pair-note">${escapeHtml(photo.notes[0])}</p>`
          : ""
      }
    </div>`;

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
      return renderMap(ctx, page, format, totalPages);
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
  const body = pages.map((p) => renderPage(ctx, p, ctx.format, totalPages)).join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(ctx.travel.title)} — Álbum</title>
  <style>
    ${getPdfThemeCss(template, ctx.format)}
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}
