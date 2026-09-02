import { marked } from "marked";
import { formatDateKey, isoToDateKey } from "@/lib/travel-dates";
import type { PdfExportContext, PdfPageFormat, PdfPhotoAsset } from "@/lib/export-pdf-types";

export type PdfPageKind =
  | "cover"
  | "day-divider"
  | "full-bleed"
  | "featured"
  | "pair"
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
  const parts: string[] = [];
  if (photo.notes[0]) parts.push(photo.notes[0]);
  else parts.push(`@${photo.alias}`);
  return parts.join("");
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

function pickHeroPhoto(photos: PdfPhotoAsset[]): PdfPhotoAsset {
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

  push({ kind: "cover", photos: [pickHeroPhoto(photos)] });

  let narrativeIndex = 0;
  let dayIndex = 0;

  for (const [dayKey, dayPhotos] of byDay) {
    const dayTitle =
      dayKey === "sin-fecha" ? "Recuerdos" : formatDateKey(dayKey, "long");
    const narrative = narratives[narrativeIndex] ?? narratives[narratives.length - 1];
    if (narratives.length > 0 && dayIndex < narratives.length) narrativeIndex += 1;

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
        narratives[Math.min(narrativeIndex, narratives.length - 1)] ??
        narratives[0];
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

function pageDimensions(format: PdfPageFormat): { width: string; height: string } {
  if (format === "square") return { width: "210mm", height: "210mm" };
  return { width: "297mm", height: "210mm" };
}

function pageSizeCss(format: PdfPageFormat): string {
  const { width, height } = pageDimensions(format);
  return `size: ${width} ${height}; margin: 0;`;
}

function renderPageFooter(pageNumber: number, totalPages: number): string {
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
  <section class="page page-cover" style="width:${width};height:${height}">
    ${
      hero
        ? `<img class="cover-photo" src="${escapeHtml(hero.imagePath)}" alt="" />`
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
  <section class="page page-bleed" style="width:${width};height:${height}">
    <img class="bleed-photo" src="${escapeHtml(photo.imagePath)}" alt="" />
    <div class="bleed-caption">
      <p class="caption-main">${escapeHtml(photoCaption(photo))}</p>
      <p class="caption-sub">${escapeHtml(photoSubcaption(photo))}</p>
    </div>
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
        <img src="${escapeHtml(photo.imagePath)}" alt="" />
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
        <img src="${escapeHtml(photo.imagePath)}" alt="" />
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
    case "day-divider":
      return renderDayDivider(page, format, totalPages);
    case "full-bleed":
      return renderFullBleed(page, format, totalPages);
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
  const pages = planPdfPages(ctx);
  const totalPages = pages.length;
  const body = pages.map((p) => renderPage(ctx, p, ctx.format, totalPages)).join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(ctx.travel.title)} — Álbum</title>
  <style>
    @page { ${pageSizeCss(ctx.format)} }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      font-family: "Liberation Sans", "Helvetica Neue", Arial, sans-serif;
      color: #1a1816;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      position: relative;
      page-break-after: always;
      page-break-inside: avoid;
      overflow: hidden;
      background: #faf8f5;
    }

    .page-footer {
      position: absolute;
      bottom: 6mm;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 7pt;
      letter-spacing: 0.2em;
      color: #a8a29e;
    }

    /* —— Cover —— */
    .page-cover { background: #0c0a09; color: #fafaf9; }

    .cover-photo {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .cover-scrim {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        180deg,
        rgba(12, 10, 9, 0.35) 0%,
        rgba(12, 10, 9, 0.2) 40%,
        rgba(12, 10, 9, 0.82) 100%
      );
    }

    .cover-inner {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 16mm 20mm 22mm;
      text-align: left;
    }

    .cover-eyebrow {
      font-size: 8pt;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: #d6d3d1;
      margin-bottom: 5mm;
    }

    .cover-title {
      font-family: "Liberation Serif", Georgia, serif;
      font-size: 32pt;
      font-weight: 400;
      line-height: 1.08;
      letter-spacing: -0.02em;
      max-width: 85%;
    }

    .cover-sub {
      margin-top: 5mm;
      font-size: 9.5pt;
      color: #d6d3d1;
      letter-spacing: 0.06em;
    }

    /* —— Day divider —— */
    .page-divider {
      display: table;
      background: #f5f2ec;
    }

    .divider-inner {
      display: table-cell;
      vertical-align: middle;
      text-align: center;
      padding: 20mm;
      width: 100%;
    }

    .divider-eyebrow {
      font-size: 8pt;
      letter-spacing: 0.35em;
      text-transform: uppercase;
      color: #78716c;
      margin-bottom: 6mm;
    }

    .divider-title {
      font-family: "Liberation Serif", Georgia, serif;
      font-size: 26pt;
      font-weight: 400;
      color: #1c1917;
      line-height: 1.15;
      margin-bottom: 8mm;
    }

    .divider-rule {
      width: 18mm;
      height: 0.4mm;
      background: #c4b5a5;
      margin: 0 auto;
    }

    .divider-intro {
      max-width: 120mm;
      margin: 0 auto;
      text-align: left;
      font-family: "Liberation Serif", Georgia, serif;
      font-size: 10.5pt;
      line-height: 1.6;
      color: #44403c;
    }

    .divider-intro h2 { font-size: 13pt; margin-bottom: 3mm; }

    /* —— Full bleed —— */
    .page-bleed { background: #000; }

    .bleed-photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .bleed-caption {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 10mm 14mm 14mm;
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.72));
      color: #fafaf9;
    }

    .caption-main {
      font-size: 9pt;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .caption-sub {
      margin-top: 1.5mm;
      font-family: "Liberation Serif", Georgia, serif;
      font-size: 11pt;
      font-style: italic;
      opacity: 0.92;
    }

    /* —— Featured spread —— */
    .page-featured {
      display: table;
      table-layout: fixed;
      width: 100%;
    }

    .featured-photo-col {
      display: table-cell;
      width: 58%;
      vertical-align: middle;
      padding: 12mm 10mm 12mm 14mm;
      background: #f5f2ec;
    }

    .featured-text-col {
      display: table-cell;
      width: 42%;
      vertical-align: middle;
      padding: 14mm 16mm 14mm 10mm;
    }

    .photo-mat {
      background: #fff;
      padding: 3mm;
      border: 0.2mm solid #e7e5e4;
    }

    .photo-mat img {
      display: block;
      width: 100%;
      max-height: 150mm;
      object-fit: contain;
    }

    .featured-caption {
      margin-top: 4mm;
      font-size: 8pt;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #78716c;
    }

    .featured-narrative {
      font-family: "Liberation Serif", Georgia, serif;
      font-size: 10.5pt;
      line-height: 1.62;
      color: #292524;
    }

    .featured-narrative h2 {
      font-size: 14pt;
      font-weight: 600;
      margin-bottom: 4mm;
      line-height: 1.2;
    }

    .featured-narrative p { margin-bottom: 3mm; }

    .featured-quote {
      margin-top: 8mm;
      padding-top: 5mm;
      border-top: 0.3mm solid #e7e5e4;
      font-family: "Liberation Serif", Georgia, serif;
      font-size: 10pt;
      font-style: italic;
      color: #57534e;
      line-height: 1.5;
    }

    /* —— Pair —— */
    .page-pair {
      display: table;
      table-layout: fixed;
      width: 100%;
    }

    .pair-cell {
      display: table-cell;
      width: 50%;
      vertical-align: top;
      padding: 14mm 12mm;
      text-align: center;
    }

    .pair-cell:first-child {
      border-right: 0.2mm solid #ebe6df;
    }

    .pair-mat img {
      max-height: 130mm;
    }

    .pair-caption {
      margin-top: 5mm;
      font-size: 8pt;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #78716c;
    }

    .pair-note {
      margin-top: 2mm;
      font-family: "Liberation Serif", Georgia, serif;
      font-size: 9.5pt;
      font-style: italic;
      color: #57534e;
    }

    /* —— Closing —— */
    .page-closing {
      display: table;
      background: #1c1917;
      color: #fafaf9;
    }

    .closing-inner {
      display: table-cell;
      vertical-align: middle;
      text-align: center;
      padding: 20mm;
    }

    .closing-eyebrow {
      font-size: 8pt;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: #a8a29e;
      margin-bottom: 6mm;
    }

    .closing-title {
      font-family: "Liberation Serif", Georgia, serif;
      font-size: 22pt;
      font-weight: 400;
      margin-bottom: 4mm;
    }

    .closing-meta {
      font-size: 9pt;
      color: #d6d3d1;
      margin-bottom: 12mm;
    }

    .closing-brand {
      font-size: 7pt;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: #78716c;
    }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}
