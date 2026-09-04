import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Swap current journal with the previous AI-generation backup (one-level undo). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const travel = await prisma.travel.findUnique({
      where: { id },
      select: {
        id: true,
        journalMarkdown: true,
        journalMarkdownPrevious: true,
      },
    });

    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    const previous = travel.journalMarkdownPrevious?.trim();
    if (!previous) {
      return NextResponse.json(
        { error: "No hay una versión anterior para restaurar" },
        { status: 400 }
      );
    }

    const updated = await prisma.travel.update({
      where: { id },
      data: {
        journalMarkdown: previous,
        journalMarkdownPrevious: travel.journalMarkdown?.trim() || null,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        journalMarkdown: true,
        journalMarkdownPrevious: true,
        journalGeneratedAt: true,
      },
    });

    return NextResponse.json({ travel: updated });
  } catch (error) {
    console.error("POST /api/travels/[id]/journal/restore-previous", error);
    return NextResponse.json(
      { error: "No se pudo restaurar la versión anterior" },
      { status: 500 }
    );
  }
}
