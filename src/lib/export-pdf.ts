import path from "path";
import { mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import type { Note, Photo, Travel, User } from "@prisma/client";
import { getOrCreatePdfImageSet } from "@/lib/export-image-cache";
import { readPhotoBuffer } from "@/lib/export-html";
import { fetchPdfDualMapImages } from "@/lib/export-pdf-map";
import { prisma } from "@/lib/prisma";
import type { PdfProgressCallback } from "@/lib/export-pdf-pipeline";
import {
  getPdfPresetCatalogEntry,
  resolvePdfDirectivesForPreset,
  themeForPdfPreset,
  typePackForPdfPreset,
  type PdfPresetId,
} from "@/lib/export/pdf-preset-catalog";
import { interpretExportBrief } from "@/lib/export-brief";
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

async function preparePdfImageBuffers(
  travelId: string,
  photo: Photo & { url: string; filename: string }
): Promise<{ standard: Buffer; bleed: Buffer } | null> {
  // Persist print/bleed JPEGs under data/export-cache so re-exports skip sharp work.
  const cached = await getOrCreatePdfImageSet(
    travelId,
    photo.id,
    photo.url,
    photo.filename
  );
  if (!cached) {
    // Fallback when source file is missing from disk / stat failed.
    const original = await readPhotoBuffer(photo.url);
    if (!original) return null;
    const { createPdfPrintImage, createPdfBleedImage } = await import("@/lib/export-images");
    const ext = path.extname(photo.filename) || ".jpg";
    const [standard, bleed] = await Promise.all([
      createPdfPrintImage(original, ext),
      createPdfBleedImage(original, ext),
    ]);
    return { standard, bleed };
  }
  return { standard: cached.print, bleed: cached.bleed };
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
    gpsTracks?: {
      id: string;
      points: { lat: number; lng: number; at?: string }[];
      includeInExport?: boolean;
      alias?: string;
      startedAt?: Date | null;
    }[];
  },
  options: PdfExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<PdfExportContext & { workDir: string }> {
  const {
    format,
    template: templateOpt,
    coverPhotoId = null,
    presetId = null,
    brief = null,
    typePack: typePackOpt = null,
  } = options;

  let briefPdfDirectives = null as import("@/lib/export-directives").ExportPdfDirectives | null;
  if (typeof brief === "string" && brief.trim()) {
    try {
      const grounded = await interpretExportBrief(brief, { target: "pdf" });
      briefPdfDirectives = grounded.directives.pdf ?? null;
    } catch {
      briefPdfDirectives = null;
    }
  }

  const resolvedPresetId = (presetId as PdfPresetId | null) ?? "pdf-classic";
  const presetEntry = getPdfPresetCatalogEntry(resolvedPresetId);
  const template =
    templateOpt ??
    (presetEntry ? themeForPdfPreset(resolvedPresetId) : "classic");
  const typePack =
    typePackOpt ??
    (presetEntry ? typePackForPdfPreset(resolvedPresetId) : null);
  const pdfDirectives = resolvePdfDirectivesForPreset(
    resolvedPresetId,
    briefPdfDirectives
  );
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

  const mapDual = await fetchPdfDualMapImages(
    photos,
    workDir,
    (travel.places ?? []).map((p) => ({
      id: p.id,
      latitude: p.latitude,
      longitude: p.longitude,
      visitedAt: p.visitedAt,
      name: p.name,
    })),
    travel.gpsTracks ?? []
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
    pdfDirectives,
    typePack,
    mapImagePath: mapDual.local?.relativePath ?? null,
    mapFlightImagePath: mapDual.flights?.relativePath ?? null,
    mapRouteMode: mapDual.local?.routeMode ?? mapDual.flights?.routeMode ?? null,
    mapPointCount: mapDual.local?.pointCount ?? 0,
    mapDayLegend: mapDual.local?.dayLegend ?? [],
    mapFlightPointCount: mapDual.flights?.pointCount ?? 0,
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
      gpsTracks: {
        where: { includeInExport: true },
        include: { user: { select: { alias: true } } },
        orderBy: { startedAt: "asc" },
      },
    },
  });

  if (!travel) throw new Error("Viaje no encontrado");

  const imagePhotos = travel.photos.filter((p) => p.mediaType !== "VIDEO");
  if (imagePhotos.length === 0) {
    throw new Error("No hay fotos seleccionadas para el álbum");
  }

  emitStep("load", "done");

  emitStep("photos", "running", `Preparando 0/${imagePhotos.length} fotos…`);
  const ctx = await preparePdfAssets(
    {
      ...travel,
      gpsTracks: travel.gpsTracks.map((t) => ({
        id: t.id,
        points: JSON.parse(t.points || "[]") as {
          lat: number;
          lng: number;
          at: string;
        }[],
        includeInExport: t.includeInExport,
        alias: t.user.alias,
        startedAt: t.startedAt,
      })),
    },
    options,
    (current, total) => {
      emit?.({
        step: "photos",
        status: "running",
        message: `Preparando fotos ${current}/${total}…`,
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
