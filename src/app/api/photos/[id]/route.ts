import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteStoredPhotoFile } from "@/lib/photo-storage";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { exifDateTime } = body as { exifDateTime?: string | null };

    if (exifDateTime === undefined) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    const photo = await prisma.photo.update({
      where: { id },
      data: {
        exifDateTime: exifDateTime ? new Date(exifDateTime) : null,
      },
      include: { user: true, notes: { include: { user: true } } },
    });

    await prisma.travel.update({
      where: { id: photo.travelId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ photo });
  } catch (error) {
    console.error("PATCH /api/photos/[id]", error);
    return NextResponse.json({ error: "Error al actualizar foto" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const photo = await prisma.photo.findUnique({ where: { id } });
    if (!photo) {
      return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
    }

    await deleteStoredPhotoFile(photo.travelId, photo.filename);
    await prisma.photo.delete({ where: { id } });

    await prisma.travel.update({
      where: { id: photo.travelId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/photos/[id]", error);
    return NextResponse.json({ error: "Error al eliminar foto" }, { status: 500 });
  }
}
