import { NextRequest, NextResponse } from "next/server";
import { deleteSharedBundle, getSharedBundle } from "@/lib/share-inbox";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bundle = await getSharedBundle(id);
  if (!bundle) {
    return NextResponse.json({ error: "Compartido no encontrado o expirado" }, { status: 404 });
  }

  return NextResponse.json({
    bundle: {
      ...bundle,
      files: bundle.files.map((file) => ({
        ...file,
        url: `/api/share-target/${id}/file/${encodeURIComponent(file.name)}`,
      })),
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteSharedBundle(id);
  return NextResponse.json({ ok: true });
}
