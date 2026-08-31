import { NextRequest, NextResponse } from "next/server";
import { getSharedBundle, readSharedFile } from "@/lib/share-inbox";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  const { id, name } = await params;
  const decodedName = decodeURIComponent(name);
  const bundle = await getSharedBundle(id);
  const meta = bundle?.files.find((file) => file.name === decodedName);
  const buffer = await readSharedFile(id, decodedName);
  if (!buffer || !meta) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": meta.type || "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
