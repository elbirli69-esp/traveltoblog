import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJournalKind } from "@/lib/journal-kind";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { journalMarkdown, journalBlogMarkdown, kind: rawKind } = body as {
      journalMarkdown?: string;
      journalBlogMarkdown?: string;
      kind?: string;
    };

    const travel = await prisma.travel.findUnique({ where: { id }, select: { id: true } });
    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    const kind = parseJournalKind(rawKind);
    const data: {
      journalMarkdown?: string | null;
      journalBlogMarkdown?: string | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (kind === "blog") {
      const text =
        typeof journalBlogMarkdown === "string"
          ? journalBlogMarkdown
          : typeof journalMarkdown === "string"
            ? journalMarkdown
            : null;
      if (text === null) {
        return NextResponse.json(
          { error: "Falta journalBlogMarkdown" },
          { status: 400 }
        );
      }
      data.journalBlogMarkdown = text.trim() || null;
    } else {
      if (typeof journalMarkdown !== "string") {
        return NextResponse.json({ error: "Falta journalMarkdown" }, { status: 400 });
      }
      data.journalMarkdown = journalMarkdown.trim() || null;
    }

    const updated = await prisma.travel.update({
      where: { id },
      data,
      select: {
        id: true,
        journalMarkdown: true,
        journalGeneratedAt: true,
        journalBlogMarkdown: true,
        journalBlogGeneratedAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ travel: updated });
  } catch (error) {
    console.error("PATCH /api/travels/[id]/journal", error);
    return NextResponse.json({ error: "Error al guardar la crónica" }, { status: 500 });
  }
}
