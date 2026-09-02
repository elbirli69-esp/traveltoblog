import { NextRequest, NextResponse } from "next/server";
import { buildPdfArtifact } from "@/lib/export-pdf";
import { probeWeasyPrint } from "@/lib/export-pdf-render";
import type { PdfPageFormat, PdfTemplate } from "@/lib/export-pdf-types";
import { PDF_TEMPLATES } from "@/lib/export-pdf-types";
import type { PdfPipelineEvent } from "@/lib/export-pdf-pipeline";

const FORMATS: PdfPageFormat[] = ["a4-landscape", "square"];
const TEMPLATES: PdfTemplate[] = ["classic", "minimal", "dark-magazine"];

export async function POST(request: NextRequest) {
  try {
    const stream = request.nextUrl.searchParams.get("stream") === "true";
    const body = await request.json();
    const {
      travelId,
      format = "a4-landscape",
      template = "classic",
      coverPhotoId = null,
    } = body as {
      travelId?: string;
      format?: PdfPageFormat;
      template?: PdfTemplate;
      coverPhotoId?: string | null;
    };

    if (!travelId) {
      return NextResponse.json({ error: "travelId es obligatorio" }, { status: 400 });
    }

    if (!FORMATS.includes(format)) {
      return NextResponse.json({ error: "Formato no válido" }, { status: 400 });
    }

    if (!TEMPLATES.includes(template)) {
      return NextResponse.json({ error: "Plantilla no válida" }, { status: 400 });
    }

    const run = async (emit?: (event: PdfPipelineEvent) => void) => {
      const { buffer, filename } = await buildPdfArtifact(
        travelId,
        { format, template, coverPhotoId },
        emit
      );
      return { buffer, filename };
    };

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const send = (event: PdfPipelineEvent) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          };

          try {
            const { buffer, filename } = await run(send);
            send({
              step: "complete",
              status: "done",
              message: "PDF listo",
              filename,
              contentType: "application/pdf",
              blobBase64: buffer.toString("base64"),
            });
          } catch (error) {
            console.error("POST /api/export-pdf stream", error);
            send({
              step: "error",
              status: "error",
              message:
                error instanceof Error
                  ? error.message.includes("WeasyPrint")
                    ? "WeasyPrint no está disponible en el servidor"
                    : error.message
                  : "Error al generar PDF",
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

    const { buffer, filename } = await run();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("POST /api/export-pdf", error);
    const message =
      error instanceof Error && error.message.includes("WeasyPrint")
        ? "WeasyPrint no está disponible en el servidor"
        : error instanceof Error
          ? error.message
          : "Error al generar PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const probe = await probeWeasyPrint();
  return NextResponse.json({
    formats: [
      { id: "a4-landscape", name: "A4 Horizontal", size: "297 × 210 mm" },
      { id: "square", name: "Cuadrado", size: "210 × 210 mm" },
    ],
    templates: PDF_TEMPLATES,
    engine: "weasyprint",
    available: probe.available,
    detail: probe.detail ?? null,
  });
}
