import { NextRequest, NextResponse } from "next/server";
import { importProjectBackup } from "@/lib/project-backup";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Envía un formulario multipart con el archivo ZIP" },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const aliasRaw = form.get("alias");
    const alias =
      typeof aliasRaw === "string" && aliasRaw.trim()
        ? aliasRaw.trim()
        : undefined;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Falta el archivo de copia (.zip)" },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json(
        { error: "La copia debe ser un archivo .zip" },
        { status: 400 }
      );
    }

    const maxBytes = 800 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: "La copia supera el límite de 800 MB" },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importProjectBackup(buffer, { importerAlias: alias });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/import-project", error);
    const message =
      error instanceof Error ? error.message : "Error al importar la copia";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
