import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildExportHtml,
  buildExportZip,
  buildSingleFileHtml,
  loadPhotoFiles,
  type ExportFormat,
  type ExportTemplateId,
} from "@/lib/export-html";

const TEMPLATES: ExportTemplateId[] = ["visual-journey", "editorial-clean", "dark-photo-journey"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      travelId,
      template = "visual-journey",
      format = "zip",
    } = body as {
      travelId?: string;
      template?: ExportTemplateId;
      format?: ExportFormat;
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
            notes: {
              where: { type: "PLACE" },
              include: { user: true },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    const photos = await loadPhotoFiles(travel.photos);
    const places = travel.places.map((p) => {
      const fromNotes = p.notes.map((n) => n.text).filter(Boolean);
      return {
        name: p.name,
        type: p.type,
        latitude: p.latitude,
        longitude: p.longitude,
        comment:
          fromNotes.length > 0
            ? fromNotes.join(" · ")
            : p.comment?.trim() || null,
        alias: p.user.alias,
      };
    });
    const ctx = {
      travel: {
        id: travel.id,
        title: travel.title,
        startDate: travel.startDate,
        endDate: travel.endDate,
        journalMarkdown: travel.journalMarkdown,
      },
      users: travel.users,
      photos,
      places,
      template,
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

    // Preview JSON for debugging — default deliver zip
    const html = buildExportHtml(ctx);
    return NextResponse.json({
      title: travel.title,
      template,
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
        id: "visual-journey",
        name: "Visual Journey",
        description: "Hero a pantalla, galería, lightbox y animaciones al scroll",
      },
      { id: "editorial-clean", name: "Editorial Clean", description: "Tipografía editorial clara, fondo claro" },
      {
        id: "dark-photo-journey",
        name: "Dark Photo Journey",
        description: "Tema oscuro centrado en fotografía",
      },
    ],
    formats: ["zip", "html"],
  });
}
