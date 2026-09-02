import { marked } from "marked";
import path from "path";
import { mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import sharp from "sharp";
import type { Note, Photo, Travel, User } from "@prisma/client";
import { getOrCreateExportImageSet } from "@/lib/export-image-cache";
import {
  createPdfPrintImage,
  PDF_JPEG_QUALITY,
} from "@/lib/export-images";
import { readPhotoBuffer } from "@/lib/export-html";
import { prisma } from "@/lib/prisma";
import type { PdfProgressCallback } from "@/lib/export-pdf-pipeline";

export type PdfPageFormat = "a4-landscape" | "square";

export interface PdfPhotoAsset {
  id: string;
  url: string;
  filename: string;
  /** Path relative to album.html (e.g. photos/001.jpg) */
  imagePath: string;
  latitude: number | null;
  longitude: number | null;
  exifDateTime: Date | null;
  alias: string;
  notes: string[];
}

export interface PdfExportContext {
  travel: Pick<Travel, "id" | "title" | "startDate" | "endDate" | "journalMarkdown">;
  users: User[];
  photos: PdfPhotoAsset[];
  notes: (Note & { user: User })[];
  format: PdfPageFormat;
}

export interface PdfBuildResult {
  htmlPath: string;
  workDir: string;
  cleanup: () => Promise<void>;
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

function formatExifMeta(photo: PdfPhotoAsset): string {
  const parts: string[] = [];
  if (photo.exifDateTime) {
    const dt = new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(photo.exifDateTime);
    parts.push(dt);
  }
  if (photo.latitude != null && photo.longitude != null) {
    parts.push(`${photo.latitude.toFixed(5)}°, ${photo.longitude.toFixed(5)}°`);
  }
  parts.push(`@${photo.alias}`);
  return parts.join(" · ");
}

function pageDimensions(format: PdfPageFormat): { width: string; height: string } {
  if (format === "square") {
    return { width: "210mm", height: "210mm" };
  }
  return { width: "297mm", height: "210mm" };
}

function pageSizeCss(format: PdfPageFormat): string {
  const { width, height } = pageDimensions(format);
  return `size: ${width} ${height}; margin: 0;`;
}

/** Split journal into sections (by ## headings) for spread narrative. */
function splitNarrativeSections(markdown: string | null, users: User[]): string[] {
  if (!markdown?.trim()) {
    return [
      `<p>Álbum del viaje con ${users.map((u) => escapeHtml(u.alias)).join(", ")}.</p>`,
    ];
  }

  const raw = markdown.trim();
  if (!/^##\s+/m.test(raw)) {
    return [marked.parse(raw, { async: false }) as string];
  }

  const sections = raw.split(/\n(?=##\s+)/).filter((s) => s.trim());
  return sections.map((section) => marked.parse(section.trim(), { async: false }) as string);
}

function buildSpreads(
  ctx: PdfExportContext
): { photo: PdfPhotoAsset; narrative: string; quotes: string[] }[] {
  const narratives = splitNarrativeSections(ctx.travel.journalMarkdown, ctx.users);
  const photos = [...ctx.photos].sort(
    (a, b) =>
      new Date(a.exifDateTime ?? 0).getTime() - new Date(b.exifDateTime ?? 0).getTime()
  );

  if (photos.length === 0) return [];

  const spreads: { photo: PdfPhotoAsset; narrative: string; quotes: string[] }[] = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]!;
    const sectionIndex = Math.min(
      Math.floor((i / photos.length) * narratives.length),
      narratives.length - 1
    );
    const narrative = narratives[sectionIndex] ?? narratives[0] ?? "<p></p>";

    const quotes = [
      ...photo.notes,
      ...ctx.notes
        .filter((n) => n.type === "DAY" || n.type === "TRIP")
        .slice(i, i + 2)
        .map((n) => `${n.user.alias}: «${n.text}»`),
    ].slice(0, 3);

    spreads.push({ photo, narrative, quotes });
  }

  return spreads;
}

export function buildPrintHtml(ctx: PdfExportContext): string {
  const { travel, users, format } = ctx;
  const spreads = buildSpreads(ctx);
  const dateRange = formatDateRange(travel.startDate, travel.endDate);
  const participants = users.map((u) => escapeHtml(u.alias)).join(" · ");
  const { width, height } = pageDimensions(format);

  const spreadPages = spreads
    .map(
      ({ photo, narrative, quotes }) => `
    <section class="spread">
      <div class="col-photo">
        <figure class="photo-frame">
          <img src="${escapeHtml(photo.imagePath)}" alt="" />
        </figure>
        <div class="exif-meta">
          <span class="exif-label">EXIF</span>
          <p>${escapeHtml(formatExifMeta(photo))}</p>
        </div>
      </div>
      <div class="col-narrative">
        <div class="narrative-body">${narrative}</div>
        ${
          quotes.length
            ? `<div class="quotes">
            ${quotes.map((q) => `<blockquote>${escapeHtml(q)}</blockquote>`).join("")}
          </div>`
            : ""
        }
      </div>
    </section>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(travel.title)} — Álbum</title>
  <style>
    @page {
      ${pageSizeCss(format)}
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #1c1917;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page-cover {
      width: ${width};
      height: ${height};
      background: #0f172a;
      color: #f8fafc;
      text-align: center;
      padding: 18mm;
      page-break-after: always;
      position: relative;
    }

    .page-cover h1 {
      font-size: 28pt;
      font-weight: 300;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin: 30mm 0 8mm;
      line-height: 1.2;
    }

    .page-cover .dates {
      font-size: 11pt;
      color: #94a3b8;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-top: 25mm;
    }

    .page-cover .participants {
      font-size: 10pt;
      color: #64748b;
      margin-top: 6mm;
    }

    .page-cover .brand {
      position: absolute;
      bottom: 12mm;
      left: 0;
      right: 0;
      font-size: 8pt;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #475569;
    }

    /* WeasyPrint: table layout (flexbox is unreliable in print) */
    .spread {
      display: table;
      width: ${width};
      height: ${height};
      table-layout: fixed;
      page-break-after: always;
      page-break-inside: avoid;
      border-collapse: collapse;
    }

    .col-photo {
      display: table-cell;
      width: 48%;
      vertical-align: top;
      background: #f5f5f4;
      padding: 10mm 8mm 8mm 10mm;
      border-right: 0.3mm solid #e7e5e4;
    }

    .col-narrative {
      display: table-cell;
      width: 52%;
      vertical-align: top;
      padding: 10mm 12mm 10mm 10mm;
    }

    .photo-frame {
      margin: 0;
      width: 100%;
      text-align: center;
    }

    .photo-frame img {
      display: block;
      width: 100%;
      max-width: 100%;
      max-height: 155mm;
      height: auto;
      margin: 0 auto;
      object-fit: contain;
    }

    .exif-meta {
      margin-top: 4mm;
      padding-top: 3mm;
      border-top: 0.3mm solid #d6d3d1;
      font-size: 8pt;
      color: #57534e;
      line-height: 1.45;
    }

    .exif-label {
      display: block;
      font-size: 7pt;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #0d9488;
      margin-bottom: 1mm;
      font-weight: 600;
    }

    .narrative-body {
      width: 100%;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 10.5pt;
      line-height: 1.55;
      color: #292524;
    }

    .narrative-body h1,
    .narrative-body h2 {
      font-size: 14pt;
      font-weight: 600;
      margin: 0 0 4mm;
      color: #0f172a;
      line-height: 1.25;
    }

    .narrative-body h3 {
      font-size: 12pt;
      margin: 3mm 0 2mm;
    }

    .narrative-body p {
      margin: 0 0 3mm;
      text-align: left;
    }

    .narrative-body ul,
    .narrative-body ol {
      margin: 0 0 3mm 5mm;
      padding-left: 4mm;
    }

    .quotes {
      margin-top: 6mm;
      padding-top: 4mm;
      border-top: 0.3mm solid #e7e5e4;
    }

    .quotes blockquote {
      margin: 0 0 3mm;
      padding-left: 3mm;
      border-left: 1mm solid #0d9488;
      font-size: 9pt;
      font-style: italic;
      color: #44403c;
    }
  </style>
</head>
<body>
  <section class="page-cover">
    <p class="dates">${escapeHtml(dateRange)}</p>
    <h1>${escapeHtml(travel.title)}</h1>
    <p class="participants">${participants}</p>
    <p class="brand">TravelToBlog · Álbum para imprenta</p>
  </section>
  ${spreadPages}
</body>
</html>`;
}

async function preparePdfImageBuffer(
  travelId: string,
  photo: Photo & { url: string; filename: string }
): Promise<Buffer | null> {
  const ext = path.extname(photo.filename) || ".jpg";
  const cached = await getOrCreateExportImageSet(travelId, photo.id, photo.url);
  if (cached) {
    return sharp(cached.display)
      .jpeg({ quality: PDF_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  }

  const original = await readPhotoBuffer(photo.url);
  if (!original) return null;
  return createPdfPrintImage(original, ext);
}

export async function preparePdfAssets(
  travel: Travel & {
    users: User[];
    photos: (Photo & { user: User; notes: { text: string }[] })[];
    notes: (Note & { user: User })[];
  },
  format: PdfPageFormat,
  onProgress?: (current: number, total: number) => void
): Promise<PdfExportContext & { workDir: string }> {
  const workDir = path.join(tmpdir(), `ttb-pdf-${randomBytes(8).toString("hex")}`);
  const photosDir = path.join(workDir, "photos");
  await mkdir(photosDir, { recursive: true });

  const selected = travel.photos.filter(
    (p) => p.selected && p.mediaType !== "VIDEO"
  );
  const photos: PdfPhotoAsset[] = [];
  let index = 0;

  for (let i = 0; i < selected.length; i++) {
    const photo = selected[i]!;
    const jpeg = await preparePdfImageBuffer(travel.id, photo);
    onProgress?.(i + 1, selected.length);
    if (!jpeg) continue;

    index += 1;
    const filename = `${String(index).padStart(3, "0")}.jpg`;
    const absolutePath = path.join(photosDir, filename);
    await writeFile(absolutePath, jpeg);
    photos.push({
      id: photo.id,
      url: photo.url,
      filename,
      imagePath: `photos/${filename}`,
      latitude: photo.latitude,
      longitude: photo.longitude,
      exifDateTime: photo.exifDateTime,
      alias: photo.user.alias,
      notes: photo.notes.map((n) => n.text),
    });
  }

  return {
    travel: {
      id: travel.id,
      title: travel.title,
      startDate: travel.startDate,
      endDate: travel.endDate,
      journalMarkdown: travel.journalMarkdown,
    },
    users: travel.users,
    photos,
    notes: travel.notes,
    format,
    workDir,
  };
}

export async function writePrintHtmlFile(
  ctx: PdfExportContext & { workDir: string }
): Promise<PdfBuildResult> {
  const html = buildPrintHtml(ctx);
  const htmlPath = path.join(ctx.workDir, "album.html");
  await writeFile(htmlPath, html, "utf-8");

  return {
    htmlPath,
    workDir: ctx.workDir,
    cleanup: async () => {
      await rm(ctx.workDir, { recursive: true, force: true });
    },
  };
}

export async function buildPdfArtifact(
  travelId: string,
  format: PdfPageFormat,
  emit?: PdfProgressCallback
): Promise<{ buffer: Buffer; filename: string; photoCount: number }> {
  const emitStep = (
    step: Parameters<PdfProgressCallback>[0]["step"],
    status: "running" | "done",
    message?: string,
    extra?: Partial<Parameters<PdfProgressCallback>[0]>
  ) => {
    emit?.({ step, status, message, ...extra });
  };

  emitStep("load", "running", "Cargando fotos y crónica…");
  const travel = await prisma.travel.findUnique({
    where: { id: travelId },
    include: {
      users: true,
      photos: {
        where: { selected: true },
        include: {
          user: true,
          notes: { select: { text: true } },
        },
        orderBy: { exifDateTime: "asc" },
      },
      notes: {
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!travel) throw new Error("Viaje no encontrado");

  const imagePhotos = travel.photos.filter((p) => p.mediaType !== "VIDEO");
  if (imagePhotos.length === 0) {
    throw new Error("No hay fotos seleccionadas para el álbum");
  }

  emitStep("load", "done");

  emitStep("photos", "running", `Optimizando 0/${imagePhotos.length} fotos…`);
  const ctx = await preparePdfAssets(travel, format, (current, total) => {
    emit?.({
      step: "photos",
      status: "running",
      message: `Optimizando fotos ${current}/${total}…`,
      current,
      total,
    });
  });

  if (ctx.photos.length === 0) {
    throw new Error("No se pudieron preparar las imágenes del álbum");
  }
  emitStep("photos", "done", `${ctx.photos.length} fotos listas`);

  let cleanup: (() => Promise<void>) | null = null;
  try {
    emitStep("html", "running", "Maquetando páginas del álbum…");
    const build = await writePrintHtmlFile(ctx);
    cleanup = build.cleanup;
    emitStep("html", "done");

    emitStep("render", "running", "Renderizando PDF (puede tardar un minuto)…");
    const pdfPath = path.join(ctx.workDir, "album.pdf");
    const { renderPdfToFile } = await import("@/lib/export-pdf-render");
    await renderPdfToFile(build.htmlPath, pdfPath, format);
    emitStep("render", "done");

    const { readFile } = await import("fs/promises");
    const buffer = await readFile(pdfPath);
    const slug =
      travel.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "album";

    return {
      buffer,
      filename: `${slug}-album-imprenta.pdf`,
      photoCount: ctx.photos.length,
    };
  } finally {
    if (cleanup) await cleanup().catch(() => undefined);
  }
}
