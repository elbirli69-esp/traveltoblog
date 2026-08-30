import { marked } from "marked";
import path from "path";
import { mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import type { Note, Photo, Travel, User } from "@prisma/client";
import { readPhotoBuffer } from "@/lib/export-html";

export type PdfPageFormat = "a4-landscape" | "square";

export interface PdfPhotoAsset {
  id: string;
  url: string;
  filename: string;
  absolutePath: string;
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

function pageSizeCss(format: PdfPageFormat): string {
  if (format === "square") {
    return "size: 210mm 210mm; margin: 0;";
  }
  return "size: A4 landscape; margin: 0;";
}

function splitNarrativeBlocks(markdown: string | null, users: User[]): string[] {
  if (!markdown?.trim()) {
    return [
      `<p>Álbum del viaje con ${users.map((u) => escapeHtml(u.alias)).join(", ")}.</p>`,
    ];
  }

  const html = marked.parse(markdown, { async: false }) as string;
  const blocks = html
    .split(/(?=<h2|<h3|<p|<ul|<ol|<blockquote)/i)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.length > 0 ? blocks : [`<p>${escapeHtml(markdown)}</p>`];
}

function buildSpreads(ctx: PdfExportContext): { photo: PdfPhotoAsset; narrative: string; quotes: string[] }[] {
  const narratives = splitNarrativeBlocks(ctx.travel.journalMarkdown, ctx.users);
  const photos = [...ctx.photos].sort(
    (a, b) =>
      new Date(a.exifDateTime ?? 0).getTime() - new Date(b.exifDateTime ?? 0).getTime()
  );

  const count = Math.max(photos.length, 1);
  const spreads: { photo: PdfPhotoAsset; narrative: string; quotes: string[] }[] = [];

  for (let i = 0; i < count; i++) {
    const photo = photos[i] ?? photos[photos.length - 1];
    if (!photo) break;

    const narrative =
      narratives[i % narratives.length] ??
      narratives[narratives.length - 1] ??
      "<p></p>";

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

  const spreadPages = spreads
    .map(
      ({ photo, narrative, quotes }) => `
    <section class="spread page-interior">
      <div class="col-photo">
        <figure class="photo-frame">
          <img src="file://${photo.absolutePath}" alt="" />
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

    body {
      margin: 0;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #1c1917;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page-cover {
      page: cover;
      width: 100%;
      height: 100vh;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 3rem;
      page-break-after: always;
    }

    @page cover {
      ${pageSizeCss(format)}
    }

    .page-cover h1 {
      font-size: 2.8rem;
      font-weight: 300;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin: 0 0 1.5rem;
      line-height: 1.15;
      max-width: 80%;
    }

    .page-cover .dates {
      font-size: 1.1rem;
      color: #94a3b8;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 2rem;
    }

    .page-cover .participants {
      font-size: 0.95rem;
      color: #64748b;
    }

    .page-cover .brand {
      position: absolute;
      bottom: 2.5rem;
      font-size: 0.75rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #475569;
    }

    .spread {
      display: flex;
      flex-direction: row;
      width: 100%;
      height: 100vh;
      page-break-after: always;
      page-break-inside: avoid;
    }

    .col-photo {
      width: 42%;
      background: #f5f5f4;
      padding: 1.25rem 1rem 1.25rem 1.25rem;
      display: flex;
      flex-direction: column;
      border-right: 1px solid #e7e5e4;
    }

    .col-narrative {
      width: 58%;
      padding: 1.75rem 2rem;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }

    .photo-frame {
      flex: 1;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .photo-frame img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      box-shadow: 0 8px 30px rgba(0,0,0,.12);
    }

    .exif-meta {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #d6d3d1;
      font-size: 0.72rem;
      color: #57534e;
      line-height: 1.5;
    }

    .exif-label {
      display: block;
      font-size: 0.62rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #0d9488;
      margin-bottom: 0.25rem;
      font-weight: 600;
    }

    .narrative-body {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 0.95rem;
      line-height: 1.65;
      color: #292524;
    }

    .narrative-body h2 {
      font-size: 1.15rem;
      font-weight: 400;
      margin: 0 0 0.75rem;
      color: #0f172a;
    }

    .narrative-body h3 {
      font-size: 1rem;
      margin: 0.5rem 0;
    }

    .narrative-body p {
      margin: 0 0 0.65rem;
    }

    .quotes {
      margin-top: auto;
      padding-top: 1rem;
      border-top: 1px solid #e7e5e4;
    }

    .quotes blockquote {
      margin: 0 0 0.5rem;
      padding-left: 0.75rem;
      border-left: 3px solid #0d9488;
      font-size: 0.82rem;
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

export async function preparePdfAssets(
  travel: Travel & {
    users: User[];
    photos: (Photo & { user: User; notes: { text: string }[] })[];
    notes: (Note & { user: User })[];
  },
  format: PdfPageFormat
): Promise<PdfExportContext & { workDir: string }> {
  const workDir = path.join(tmpdir(), `ttb-pdf-${randomBytes(8).toString("hex")}`);
  const photosDir = path.join(workDir, "photos");
  await mkdir(photosDir, { recursive: true });

  const photos: PdfPhotoAsset[] = [];
  let index = 0;

  for (const photo of travel.photos.filter((p) => p.selected)) {
    const buf = await readPhotoBuffer(photo.url);
    if (!buf) continue;
    index += 1;
    const ext = path.extname(photo.filename) || ".jpg";
    const filename = `${String(index).padStart(3, "0")}${ext}`;
    const absolutePath = path.join(photosDir, filename);
    await writeFile(absolutePath, buf);
    photos.push({
      id: photo.id,
      url: photo.url,
      filename,
      absolutePath,
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

export async function writePrintHtmlFile(ctx: PdfExportContext & { workDir: string }): Promise<PdfBuildResult> {
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
