import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { text } = body as { text?: string };

    if (!text?.trim()) {
      return NextResponse.json({ error: "El texto no puede estar vacío" }, { status: 400 });
    }

    const existing = await prisma.note.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }

    const note = await prisma.note.update({
      where: { id },
      data: { text: text.trim() },
      include: { user: true },
    });

    await prisma.travel.update({
      where: { id: note.travelId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error("PATCH /api/notes/[id]", error);
    return NextResponse.json({ error: "Error al actualizar nota" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await prisma.note.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }

    await prisma.note.delete({ where: { id } });

    await prisma.travel.update({
      where: { id: existing.travelId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/notes/[id]", error);
    return NextResponse.json({ error: "Error al eliminar nota" }, { status: 500 });
  }
}
