import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAiConfig } from "@/lib/ai";
import {
  buildEnhancedJournalContext,
  buildLocalJournalMarkdown,
  isAiUnreachableError,
  runJournalPipeline,
  type JournalPipelineEvent,
  type JournalStyle,
} from "@/lib/journal-pipeline";
import { parseJournalKind, type JournalKind } from "@/lib/journal-kind";

function parseJournalStyle(value: unknown): JournalStyle {
  return value === "factual" ? "factual" : "narrative";
}

async function persistGeneratedJournal(
  travelId: string,
  kind: JournalKind,
  markdown: string,
  previousMarkdown: string | null
) {
  if (kind === "blog") {
    await prisma.travel.update({
      where: { id: travelId },
      data: {
        journalBlogMarkdown: markdown,
        journalBlogGeneratedAt: new Date(),
        ...(previousMarkdown?.trim()
          ? { journalBlogMarkdownPrevious: previousMarkdown }
          : {}),
      },
    });
    return;
  }

  await prisma.travel.update({
    where: { id: travelId },
    data: {
      journalMarkdown: markdown,
      journalGeneratedAt: new Date(),
      ...(previousMarkdown?.trim()
        ? { journalMarkdownPrevious: previousMarkdown }
        : {}),
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { travelId, stream, style, brief, kind: rawKind } = body as {
      travelId?: string;
      stream?: boolean;
      style?: JournalStyle;
      brief?: string | null;
      kind?: JournalKind;
    };
    const journalStyle = parseJournalStyle(style);
    const kind = parseJournalKind(rawKind);
    const journalBrief =
      typeof brief === "string" ? brief.trim().slice(0, 4000) || null : undefined;

    if (!travelId) {
      return NextResponse.json({ error: "travelId es obligatorio" }, { status: 400 });
    }

    const { apiKey } = getAiConfig();
    if (!apiKey) {
      return NextResponse.json(
        { error: "DEEPSEEK_API_KEY no configurada" },
        { status: 503 }
      );
    }

    const travel = await prisma.travel.findUnique({
      where: { id: travelId },
      include: {
        users: true,
        photos: {
          where: { selected: true },
          include: {
            user: true,
            place: { select: { name: true } },
          },
        },
        notes: {
          include: { user: true, photo: true },
        },
        places: {
          include: {
            user: true,
            notes: {
              where: { type: "PLACE" },
              include: { user: true },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    if (journalBrief !== undefined) {
      await prisma.travel.update({
        where: { id: travelId },
        data: { journalBrief },
      });
      travel.journalBrief = journalBrief;
    }

    const existingMarkdown =
      kind === "blog"
        ? travel.journalBlogMarkdown?.trim() || null
        : travel.journalMarkdown?.trim() || null;
    const ctx = buildEnhancedJournalContext(
      travel,
      travel.users,
      travel.photos,
      travel.notes,
      travel.places,
      journalBrief !== undefined ? journalBrief : travel.journalBrief
    );

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const send = (event: JournalPipelineEvent) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          };

          try {
            const markdown = await runJournalPipeline(ctx, send, journalStyle, {
              existingMarkdown,
              kind,
            });
            await persistGeneratedJournal(travelId, kind, markdown, existingMarkdown);
          } catch (error) {
            console.error("Journal pipeline stream", error);
            if (existingMarkdown) {
              send({
                step: "error",
                status: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "No se pudo refinar la crónica; se mantiene el texto actual.",
              });
            } else if (isAiUnreachableError(error)) {
              try {
                const markdown = buildLocalJournalMarkdown(ctx, kind);
                await persistGeneratedJournal(travelId, kind, markdown, null);
                send({
                  step: "complete",
                  status: "done",
                  markdown,
                  message: "Crónica local (sin IA — sin conexión a DeepSeek)",
                });
              } catch (fallbackError) {
                console.error("Journal fallback failed", fallbackError);
                send({
                  step: "error",
                  status: "error",
                  message:
                    "Sin conexión a la IA (api.deepseek.com). Revisa DNS del contenedor Docker en el NAS.",
                });
              }
            } else {
              send({
                step: "error",
                status: "error",
                message: "Error al generar el diario",
              });
            }
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    const markdown = await runJournalPipeline(ctx, undefined, journalStyle, {
      existingMarkdown,
      kind,
    });

    await persistGeneratedJournal(travelId, kind, markdown, existingMarkdown);

    return NextResponse.json({
      markdown,
      refined: Boolean(existingMarkdown),
      kind,
    });
  } catch (error) {
    console.error("POST /api/generate-journal", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error al generar el diario",
      },
      { status: 500 }
    );
  }
}
