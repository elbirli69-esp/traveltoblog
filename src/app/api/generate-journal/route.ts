import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAiConfig } from "@/lib/ai";
import {
  buildEnhancedJournalContext,
  buildLocalJournalMarkdown,
  isAiUnreachableError,
  runJournalPipeline,
  type JournalPipelineEvent,
} from "@/lib/journal-pipeline";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { travelId, stream } = body as { travelId?: string; stream?: boolean };

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
          include: { user: true },
        },
        notes: {
          include: { user: true, photo: true },
        },
        places: {
          include: { user: true },
        },
      },
    });

    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    const ctx = buildEnhancedJournalContext(
      travel,
      travel.users,
      travel.photos,
      travel.notes,
      travel.places
    );

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const send = (event: JournalPipelineEvent) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          };

          try {
            const markdown = await runJournalPipeline(ctx, send);
            await prisma.travel.update({
              where: { id: travelId },
              data: {
                journalMarkdown: markdown,
                journalGeneratedAt: new Date(),
              },
            });
          } catch (error) {
            console.error("Journal pipeline stream", error);
            if (isAiUnreachableError(error)) {
              try {
                const markdown = buildLocalJournalMarkdown(ctx);
                await prisma.travel.update({
                  where: { id: travelId },
                  data: { journalMarkdown: markdown, journalGeneratedAt: new Date() },
                });
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

    const markdown = await runJournalPipeline(ctx);

    await prisma.travel.update({
      where: { id: travelId },
      data: {
        journalMarkdown: markdown,
        journalGeneratedAt: new Date(),
      },
    });

    return NextResponse.json({ markdown });
  } catch (error) {
    console.error("POST /api/generate-journal", error);
    return NextResponse.json(
      { error: "Error al generar el diario" },
      { status: 500 }
    );
  }
}
