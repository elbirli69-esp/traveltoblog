import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePhotoExifFromFile } from "@/lib/photo-gps";
import {
  buildExportHtml,
  buildExportZip,
  buildSingleFileHtml,
  loadPhotoFiles,
  type ExportFormat,
  type ExportTemplateId,
  type ExportTypologyId,
} from "@/lib/export-html";
import { TYPOLOGY_LIST } from "@/lib/export/typologies/registry";

const TEMPLATES: ExportTemplateId[] = ["magazine", "visual-journey", "editorial-clean", "dark-photo-journey"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      travelId,
      template = "magazine",
      typology = "auto",
      format = "zip",
      includeGpsTrail = false,
    } = body as {
      travelId?: string;
      template?: ExportTemplateId;
      typology?: ExportTypologyId;
      format?: ExportFormat;
      includeGpsTrail?: boolean;
    };

    if (!travelId) {
      return NextResponse.json({ error: "travelId es obligatorio" }, { status: 400 });
    }

    if (!TEMPLATES.includes(template)) {
      return NextResponse.json({ error: "Plantilla no válida" }, { status: 400 });
    }

    const travel = await prisma.travel.findUnique({
      where: { id: travelId },
      include: {
        users: true,
        photos: {
          where: { selected: true },
          include: { user: true },
          orderBy: { exifDateTime: "asc" },
        },
        places: {
          include: {
            user: true,
            notes: { where: { type: "PLACE" }, orderBy: { createdAt: "asc" } },
          },
          orderBy: { visitedAt: "asc" },
        },
        notes: {
          include: { user: true },
          orderBy: { createdAt: "asc" },
        },
        gpsTracks: {
          include: { user: true },
          orderBy: { startedAt: "asc" },
        },
      },
    });

    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    for (const photo of travel.photos) {
      const resolved = await resolvePhotoExifFromFile({
        url: photo.url,
        exifDateTime: photo.exifDateTime,
        latitude: photo.latitude,
        longitude: photo.longitude,
      });
      if (!resolved.changed) continue;
      await prisma.photo.update({
        where: { id: photo.id },
        data: {
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          exifDateTime: resolved.dateTime,
        },
      });
      photo.latitude = resolved.latitude;
      photo.longitude = resolved.longitude;
      photo.exifDateTime = resolved.dateTime;
    }

    const photos = await loadPhotoFiles(travel.photos);
    const places = travel.places.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      latitude: p.latitude,
      longitude: p.longitude,
      comment: p.notes[0]?.text ?? p.comment,
      alias: p.user.alias,
      visitedAt: p.visitedAt,
    }));
    const notes = travel.notes.map((n) => ({
      id: n.id,
      type: n.type,
      text: n.text,
      dayDate: n.dayDate,
      photoId: n.photoId,
      placeId: n.placeId,
      createdAt: n.createdAt,
      alias: n.user.alias,
    }));
    const gpsTracks = travel.gpsTracks.map((t) => ({
      id: t.id,
      points: JSON.parse(t.points || "[]") as { lat: number; lng: number; at: string }[],
      includeInExport: t.includeInExport,
      alias: t.user.alias,
      startedAt: t.startedAt,
    }));

    const ctx = {
      travel: {
        id: travel.id,
        title: travel.title,
        startDate: travel.startDate,
        endDate: travel.endDate,
        journalMarkdown: travel.journalMarkdown,
        travelType: travel.travelType,
      },
      users: travel.users,
      photos,
      places,
      notes,
      gpsTracks,
      template,
      typology,
      includeGpsTrail,
    };

    const slug = travel.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "viaje";

    if (format === "html") {
      const buffer = await buildSingleFileHtml(ctx);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${slug}.html"`,
        },
      });
    }

    if (format === "zip") {
      const buffer = await buildExportZip(ctx);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${slug}-export.zip"`,
        },
      });
    }

    const html = buildExportHtml(ctx);
    return NextResponse.json({
      title: travel.title,
      template,
      typology,
      photoCount: photos.length,
      gpsCount: photos.filter((p) => p.latitude != null).length,
      htmlLength: html.length,
    });
  } catch (error) {
    console.error("POST /api/export-html", error);
    return NextResponse.json({ error: "Error al exportar HTML" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    templates: [
      {
        id: "magazine",
        name: "Magazine",
        description: "Blog editorial: recorrido, guía práctica, TOC y Open Graph",
      },
      {
        id: "visual-journey",
        name: "Visual Journey",
        description: "Hero a pantalla, recorrido visual, galería, lightbox y animaciones",
      },
      { id: "editorial-clean", name: "Editorial Clean", description: "Tipografía editorial clara, fondo claro" },
      {
        id: "dark-photo-journey",
        name: "Dark Photo Journey",
        description: "Tema oscuro centrado en fotografía",
      },
    ],
    typologies: TYPOLOGY_LIST.map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description,
    })),
    formats: ["zip", "html"],
  });
}
