import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAiClient, getAiConfig } from "@/lib/ai";
import { buildJournalInput, buildUserPrompt, SYSTEM_PROMPT } from "@/lib/journal";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { travelId } = body as { travelId?: string };

    if (!travelId) {
      return NextResponse.json({ error: "travelId es obligatorio" }, { status: 400 });
    }

    const { apiKey, model } = getAiConfig();
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
      },
    });

    if (!travel) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    const journalInput = buildJournalInput(
      travel,
      travel.users,
      travel.photos,
      travel.notes
    );

    const ai = createAiClient();

    const completion = await ai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(journalInput) },
      ],
      temperature: 0.8,
    });

    const markdown = completion.choices[0]?.message?.content ?? "";

    await prisma.travel.update({
      where: { id: travelId },
      data: {
        journalMarkdown: markdown,
        journalGeneratedAt: new Date(),
      },
    });

    return NextResponse.json({
      markdown,
      input: journalInput,
    });
  } catch (error) {
    console.error("POST /api/generate-journal", error);
    return NextResponse.json(
      { error: "Error al generar el diario" },
      { status: 500 }
    );
  }
}
