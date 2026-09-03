import path from "path";
import { mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import sharp from "sharp";
import type { Note, Photo, Travel, User } from "@prisma/client";
import { getOrCreateExportImageSet } from "@/lib/export-image-cache";
import {
  createPdfBleedImage,
  createPdfPrintImage,
  PDF_BLEED_JPEG_QUALITY,
  PDF_JPEG_QUALITY,
} from "@/lib/export-images";
import { readPhotoBuffer } from "@/lib/export-html";
import { fetchPdfMapImage } from "@/lib/export-pdf-map";
import { prisma } from "@/lib/prisma";
import type { PdfProgressCallback } from "@/lib/export-pdf-pipeline";

import type {
  PdfExportOptions,
  PdfPhotoAsset,
  PdfExportContext,
} from "@/lib/export-pdf-types";

export type {
  PdfPageFormat,
  PdfPhotoAsset,
  PdfExportContext,
  PdfTemplate,
  PdfExportOptions,
} from "@/lib/export-pdf-types";
export { buildPrintHtml } from "@/lib/export-pdf-layout";

export interface PdfBuildResult {
  htmlPath: string;
  workDir: string;
  cleanup: () => Promise<void>;
}

async function readPhotoSource(
  travelId: string,
  photo: Photo & { url: string; filename: string }
): Promise<Buffer | null> {
  const cached = await getOrCreateExportImageSet(travelId, photo.id, photo.url);
  if (cached) return cached.display;

  const original = await readPhotoBuffer(photo.url);
  return original;
}

async function preparePdfImageBuffers(
  travelId: string,
  photo: Photo & { url: string; filename: string }
): Promise<{ standard: Buffer; bleed: Buffer } | null> {
  const ext = path.extname(photo.filename) || ".jpg";
  const source = await readPhotoSource(travelId, photo);
  if (!source) return null;

  const cached = await getOrCreateExportImageSet(travelId, photo.id, photo.url);
  if (cached) {
    const [standard, bleed] = await Promise.all([
      sharp(cached.display)
        .jpeg({ quality: PDF_JPEG_QUALITY, mozjpeg: true })
        .toBuffer(),
      sharp(cached.display)
        .resize({ width: 3500, withoutEnlargement: true })
        .jpeg({ quality: PDF_BLEED_JPEG_QUALITY, mozjpeg: true })
        .toBuffer(),
    ]);
    return { standard, bleed };
  }

  const [standard, bleed] = await Promise.all([
    createPdfPrintImage(source, ext),
    createPdfBleedImage(source, ext),
  ]);
  return { standard, bleed };
}

export async function preparePdfAssets(
  travel: Travel & {
    users: User[];
    photos: (Photo & {
      user: User;
      notes: { text: string }[];
      place?: { name: string } | null;
    })[];
    notes: (Note & { user: User })[];
    places?: {
      id: string;
      name: string;
      latitude: number;
      longitude: number;
      visitedAt: Date | null;
    }[];
  },
  options: PdfExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<PdfExportContext & { workDir: string }> {
  const { format, template = "classic", coverPhotoId = null } = options;
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
    const buffers = await preparePdfImageBuffers(travel.id, photo);
    onProgress?.(i + 1, selected.length);
    if (!buffers) continue;

    index += 1;
    const base = `${String(index).padStart(3, "0")}`;
    const standardFilename = `${base}.jpg`;
    const bleedFilename = `${base}-bleed.jpg`;
    await writeFile(path.join(photosDir, standardFilename), buffers.standard);
    await writeFile(path.join(photosDir, bleedFilename), buffers.bleed);

    photos.push({
      id: photo.id,
      url: photo.url,
      filename: standardFilename,
      imagePath: `photos/${standardFilename}`,
      bleedImagePath: `photos/${bleedFilename}`,
      latitude: photo.latitude,
      longitude: photo.longitude,
      exifDateTime: photo.exifDateTime,
      alias: photo.user.alias,
      placeName: photo.place?.name ?? null,
      highlightScore: photo.highlightScore ?? 5,
      notes: photo.notes.map((n) => n.text),
      isTransportStart: photo.isTransportStart,
      isTransportEnd: photo.isTransportEnd,
    });
  }

  const mapResult = await fetchPdfMapImage(
    photos,
    workDir,
    (travel.places ?? []).map((p) => ({
      id: p.id,
      latitude: p.latitude,
      longitude: p.longitude,
      visitedAt: p.visitedAt,
      name: p.name,
    }))
  );

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
    template,
    coverPhotoId,
    mapImagePath: mapResult?.relativePath ?? null,
    mapRouteMode: mapResult?.routeMode ?? null,
    mapPointCount: mapResult?.pointCount ?? 0,
    mapDayLegend: mapResult?.dayLegend ?? [],
    workDir,
  };
}

export async function writePrintHtmlFile(
  ctx: PdfExportContext & { workDir: string }
): Promise<PdfBuildResult> {
  const { buildPrintHtml } = await import("@/lib/export-pdf-layout");
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
  options: PdfExportOptions = { format: "a4-landscape" },
  emit?: PdfProgressCallback
): Promise<{ buffer: Buffer; filename: string; photoCount: number }> {
  const format = options.format ?? "a4-landscape";

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
          place: { select: { name: true } },
          notes: { select: { text: true } },
        },
        orderBy: { exifDateTime: "asc" },
      },
      notes: {
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
      places: {
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          visitedAt: true,
        },
        orderBy: { visitedAt: "asc" },
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
  const ctx = await preparePdfAssets(
    travel,
    options,
    (current, total) => {
      emit?.({
        step: "photos",
        status: "running",
        message: `Optimizando fotos ${current}/${total}…`,
        current,
        total,
      });
    }
  );

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
