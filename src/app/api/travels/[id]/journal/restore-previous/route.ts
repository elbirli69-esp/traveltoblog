import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJournalKind } from "@/lib/journal-kind";

/** Swap current journal with the previous AI-generation backup (one-level undo). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let kind = parseJournalKind(undefined);
    try {
      const body = (await request.json().catch(() => ({}))) as { kind?: string };
      kind = parseJournalKind(body.kind);
    } catch {
      /* empty body OK */
    }

    const travel = await prisma.travel.findUnique({
      where: { id },
      select: {
        id: true,
        journalMarkdown: true,
        journalMarkdownPrevious: true,
        journalBlogMarkdown: true,
        journalBlogMarkdownPrevious: true,
      },
    });

    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    if (kind === "blog") {
      const previous = travel.journalBlogMarkdownPrevious?.trim();
      if (!previous) {
        return NextResponse.json(
          { error: "No hay una versión anterior del artículo blog para restaurar" },
          { status: 400 }
        );
      }
      const updated = await prisma.travel.update({
        where: { id },
        data: {
          journalBlogMarkdown: previous,
          journalBlogMarkdownPrevious: travel.journalBlogMarkdown?.trim() || null,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          journalBlogMarkdown: true,
          journalBlogMarkdownPrevious: true,
          journalBlogGeneratedAt: true,
        },
      });
      return NextResponse.json({ travel: updated, kind });
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

    return NextResponse.json({ travel: updated, kind });
  } catch (error) {
    console.error("POST /api/travels/[id]/journal/restore-previous", error);
    return NextResponse.json(
      { error: "No se pudo restaurar la versión anterior" },
      { status: 500 }
    );
  }
}
