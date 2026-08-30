import { NextRequest, NextResponse } from "next/server";
import { NoteType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { travelId, userId, photoId, type, dayDate, text, localId } = body as {
      travelId?: string;
      userId?: string;
      photoId?: string | null;
      type?: "PHOTO" | "DAY" | "TRIP";
      dayDate?: string | null;
      text?: string;
      localId?: string;
    };

    if (!travelId || !userId || !type || !text?.trim()) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const note = await prisma.note.create({
      data: {
        travelId,
        userId,
        photoId: photoId ?? null,
        type: type as NoteType,
        dayDate: dayDate ? new Date(dayDate) : null,
        text: text.trim(),
        localId: localId ?? null,
      },
      include: { user: true },
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error("POST /api/notes", error);
    return NextResponse.json({ error: "Error al crear nota" }, { status: 500 });
  }
}
