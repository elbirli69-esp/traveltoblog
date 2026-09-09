import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeGpsPair } from "@/lib/exif";
import { resolvePhotoExifFromFile } from "@/lib/photo-gps";
import {
  buildMapPhotoList,
  loadPhotoFiles,
  type ExportFormat,
  type ExportTemplateId,
  type ExportTypologyId,
} from "@/lib/export-html";
import {
  buildExportArtifact,
  type ExportPipelineEvent,
} from "@/lib/export-pipeline";
import { interpretExportBrief } from "@/lib/export-brief";
import { summarizeHtmlDirectives } from "@/lib/export-directives";
import { TYPOLOGY_LIST } from "@/lib/export/typologies/registry";
import {
  defaultThemePackForTemplate,
  getThemePackEntry,
  type ThemePackId,
} from "@/lib/export/theme-packs";
import {
  defaultTypePackForTemplate,
  getTypePackEntry,
  type TypePackId,
} from "@/lib/export/type-packs";

const TEMPLATES: ExportTemplateId[] = [
  "magazine",
  "visual-journey",
  "editorial-clean",
  "dark-photo-journey",
];

const THEME_PACKS: ThemePackId[] = [
  "light-paper",
  "light-clean",
  "dark-cinema",
  "warm-sunset",
  "cool-coast",
];

const TYPE_PACKS: TypePackId[] = ["serif-editorial", "sans-clean", "hybrid"];

function parseThemePack(
  raw: unknown,
  template: ExportTemplateId
): ThemePackId {
  if (typeof raw === "string" && (THEME_PACKS as string[]).includes(raw)) {
    return raw as ThemePackId;
  }
  return defaultThemePackForTemplate(template);
}

function parseTypePack(raw: unknown, template: ExportTemplateId): TypePackId {
  if (typeof raw === "string" && (TYPE_PACKS as string[]).includes(raw)) {
    return raw as TypePackId;
  }
  return defaultTypePackForTemplate(template);
}

function exportSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "viaje"
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      travelId,
      template = "magazine",
      typology = "auto",
      format = "zip",
      includeGpsTrail = false,
      stream = false,
      brief = "",
      themePack: themePackRaw,
      typePack: typePackRaw,
      publicTitle = "",
      includeReaderGuide = true,
      journalSource,
    } = body as {
      travelId?: string;
      template?: ExportTemplateId;
      typology?: ExportTypologyId;
      format?: ExportFormat;
      includeGpsTrail?: boolean;
      stream?: boolean;
      brief?: string;
      themePack?: string;
      typePack?: string;
      publicTitle?: string;
      includeReaderGuide?: boolean;
      journalSource?: "day" | "blog";
    };

    if (!travelId) {
      return NextResponse.json({ error: "travelId es obligatorio" }, { status: 400 });
    }
    if (!TEMPLATES.includes(template)) {
      return NextResponse.json({ error: "Plantilla no válida" }, { status: 400 });
    }

    const themePack = parseThemePack(themePackRaw, template);
    const typePack = parseTypePack(typePackRaw, template);

    const briefText = typeof brief === "string" ? brief.trim() : "";

    const runExport = async (send?: (event: ExportPipelineEvent) => void) => {
      const emit = (event: ExportPipelineEvent) => send?.(event);

      emit({ step: "load", status: "running", message: "Cargando datos del viaje…" });

      const travel = await prisma.travel.findUnique({
        where: { id: travelId },
        include: {
          users: true,
          photos: {
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
        throw new Error("Viaje no encontrado");
      }

      const briefResult = briefText
        ? await interpretExportBrief(briefText, {
            target: "html",
            photoCount: travel.photos.filter((p) => p.selected).length || travel.photos.length,
            hasJournal: Boolean(
              travel.journalMarkdown?.trim() || travel.journalBlogMarkdown?.trim()
            ),
            travelTitle: travel.title,
          })
        : null;

      if (briefResult?.directives.interpretation) {
        emit({
          step: "load",
          status: "running",
          message: briefResult.directives.interpretation,
          briefInterpretation: briefResult.directives.interpretation,
          briefSummary: briefResult.directives.html
            ? summarizeHtmlDirectives(briefResult.directives.html)
            : undefined,
          briefWarning: briefResult.warning,
        });
      }

      emit({ step: "load", status: "done" });

      emit({ step: "exif", status: "running", message: "Leyendo ubicación de las fotos…" });
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
      emit({ step: "exif", status: "done" });

      emit({ step: "photos", status: "running", message: "Preparando archivos de fotos…" });
      const photos = await loadPhotoFiles(travel.photos);
      const mapPhotos = buildMapPhotoList(travel.photos, photos);
      emit({ step: "photos", status: "done" });

      const places = travel.places.map((p) => {
        const gps = sanitizeGpsPair(p.latitude, p.longitude);
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          latitude: gps.latitude ?? p.latitude,
          longitude: gps.longitude ?? p.longitude,
          comment: p.notes[0]?.text ?? p.comment,
          alias: p.user.alias,
          visitedAt: p.visitedAt,
          highlightScore: p.highlightScore ?? 0,
        };
      });
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
          journalBlogMarkdown: travel.journalBlogMarkdown,
          htmlJournalSource: travel.htmlJournalSource,
          travelType: travel.travelType,
        },
        users: travel.users,
        photos,
        mapPhotos,
        places,
        notes,
        gpsTracks,
        template,
        typology,
        includeGpsTrail,
        themePack,
        typePack,
        htmlDirectives: briefResult?.directives.html ?? null,
        briefInterpretation: briefResult?.directives.interpretation ?? null,
        publicTitle:
          typeof publicTitle === "string" && publicTitle.trim()
            ? publicTitle.trim().slice(0, 200)
            : null,
        includeReaderGuide: includeReaderGuide !== false,
        journalSource:
          journalSource === "blog" || journalSource === "day"
            ? journalSource
            : undefined,
      };

      const slug = exportSlug(
        (typeof publicTitle === "string" && publicTitle.trim()
          ? publicTitle.trim()
          : travel.title) || travel.title
      );
      const buffer = await buildExportArtifact(ctx, format, emit);
      const filename = format === "html" ? `${slug}.html` : `${slug}-export.zip`;
      const contentType = format === "html" ? "text/html; charset=utf-8" : "application/zip";

      return {
        buffer,
        filename,
        contentType,
        photoCount: photos.length,
        briefInterpretation: briefResult?.directives.interpretation ?? null,
        briefSummary: briefResult?.directives.html
          ? summarizeHtmlDirectives(briefResult.directives.html)
          : null,
        briefWarning: briefResult?.warning ?? null,
      };
    };

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const send = (event: ExportPipelineEvent) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          };

          try {
            const {
              buffer,
              filename,
              contentType,
              briefInterpretation,
              briefSummary,
              briefWarning,
            } = await runExport(send);
            send({
              step: "complete",
              status: "done",
              message: "Exportación lista",
              filename,
              contentType,
              blobBase64: buffer.toString("base64"),
              briefInterpretation: briefInterpretation ?? undefined,
              briefSummary: briefSummary ?? undefined,
              briefWarning: briefWarning ?? undefined,
            });
          } catch (error) {
            console.error("POST /api/export-html stream", error);
            send({
              step: "error",
              status: "error",
              message: error instanceof Error ? error.message : "Error al exportar HTML",
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    const { buffer, filename, contentType } = await runExport();

    if (format === "html" || format === "zip") {
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ error: "Formato no válido" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/export-html", error);
    const message = error instanceof Error ? error.message : "Error al exportar HTML";
    const status = message === "Viaje no encontrado" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
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
    themePacks: THEME_PACKS.map((id) => {
      const e = getThemePackEntry(id)!;
      return { id: e.id, label: e.label, tagline: e.tagline };
    }),
    typePacks: TYPE_PACKS.map((id) => {
      const e = getTypePackEntry(id)!;
      return { id: e.id, label: e.label, tagline: e.tagline };
    }),
    typologies: TYPOLOGY_LIST.map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description,
    })),
    formats: ["zip", "html"],
  });
}
