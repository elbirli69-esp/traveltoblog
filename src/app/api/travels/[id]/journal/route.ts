import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { journalMarkdown } = body as { journalMarkdown?: string };

    if (typeof journalMarkdown !== "string") {
      return NextResponse.json({ error: "Falta journalMarkdown" }, { status: 400 });
    }

    const travel = await prisma.travel.findUnique({ where: { id }, select: { id: true } });
    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    const updated = await prisma.travel.update({
      where: { id },
      data: {
        journalMarkdown: journalMarkdown.trim() || null,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        journalMarkdown: true,
        journalGeneratedAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ travel: updated });
  } catch (error) {
    console.error("PATCH /api/travels/[id]/journal", error);
    return NextResponse.json({ error: "Error al guardar la crónica" }, { status: 500 });
  }
}
