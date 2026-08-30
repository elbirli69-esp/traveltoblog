import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import {
  preparePdfAssets,
  writePrintHtmlFile,
  type PdfPageFormat,
} from "@/lib/export-pdf";

const execFileAsync = promisify(execFile);

const FORMATS: PdfPageFormat[] = ["a4-landscape", "square"];

function resolveWeasyPrint(): string[] {
  const candidates = [
    process.env.WEASYPRINT_BIN,
    "/usr/bin/weasyprint",
    path.join(process.env.HOME ?? "", ".local", "bin", "weasyprint"),
  ].filter((c): c is string => Boolean(c));
  return candidates;
}

async function renderPdf(htmlPath: string, pdfPath: string, format: PdfPageFormat) {
  const scriptPath = path.join(process.cwd(), "scripts", "render-pdf.py");
  const errors: string[] = [];

  for (const bin of resolveWeasyPrint()) {
    try {
      await execFileAsync(bin, [htmlPath, pdfPath], { env: process.env });
      return;
    } catch (err) {
      errors.push(`${bin}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  try {
    await execFileAsync("python3", [scriptPath, htmlPath, pdfPath, "--format", format], {
      env: process.env,
    });
    return;
  } catch (err) {
    errors.push(`python3: ${err instanceof Error ? err.message : "failed"}`);
  }

  throw new Error(`WeasyPrint no disponible (${errors.join("; ")})`);
}

export async function POST(request: NextRequest) {
  let cleanup: (() => Promise<void>) | null = null;

  try {
    const body = await request.json();
    const { travelId, format = "a4-landscape" } = body as {
      travelId?: string;
      format?: PdfPageFormat;
    };

    if (!travelId) {
      return NextResponse.json({ error: "travelId es obligatorio" }, { status: 400 });
    }

    if (!FORMATS.includes(format)) {
      return NextResponse.json({ error: "Formato no válido" }, { status: 400 });
    }

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

    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    if (travel.photos.length === 0) {
      return NextResponse.json(
        { error: "No hay fotos seleccionadas para el álbum" },
        { status: 400 }
      );
    }

    const ctx = await preparePdfAssets(travel, format);
    const build = await writePrintHtmlFile(ctx);
    cleanup = build.cleanup;

    const pdfPath = path.join(ctx.workDir, "album.pdf");
    await renderPdf(build.htmlPath, pdfPath, format);

    const pdfBuffer = await readFile(pdfPath);
    const slug =
      travel.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "album";

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slug}-album-imprenta.pdf"`,
      },
    });
  } catch (error) {
    console.error("POST /api/export-pdf", error);
    const message =
      error instanceof Error && error.message.includes("WeasyPrint")
        ? "WeasyPrint no está disponible en el servidor"
        : "Error al generar PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (cleanup) await cleanup().catch(() => undefined);
  }
}

export async function GET() {
  return NextResponse.json({
    formats: [
      { id: "a4-landscape", name: "A4 Horizontal", size: "297 × 210 mm" },
      { id: "square", name: "Cuadrado", size: "210 × 210 mm" },
    ],
    engine: "weasyprint",
  });
}
