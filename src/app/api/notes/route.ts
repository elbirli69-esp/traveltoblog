import { NextRequest, NextResponse } from "next/server";
import { NoteType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const NOTE_TYPES = new Set(["PHOTO", "DAY", "TRIP", "PLACE"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      travelId,
      userId,
      photoId,
      photoLocalId,
      placeId,
      placeLocalId,
      type,
      dayDate,
      text,
      localId,
    } = body as {
      travelId?: string;
      userId?: string;
      photoId?: string | null;
      photoLocalId?: string | null;
      placeId?: string | null;
      placeLocalId?: string | null;
      type?: "PHOTO" | "DAY" | "TRIP" | "PLACE";
      dayDate?: string | null;
      text?: string;
      localId?: string;
    };

    if (!travelId || !userId || !type || !text?.trim() || !NOTE_TYPES.has(type)) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    if (localId) {
      const existing = await prisma.note.findUnique({
        where: { localId },
        include: { user: true },
      });
      if (existing) {
        return NextResponse.json({ note: existing });
      }
    }

    let resolvedPhotoId = photoId ?? null;
    if (!resolvedPhotoId && photoLocalId) {
      const photo = await prisma.photo.findFirst({
        where: { travelId, localId: photoLocalId },
        select: { id: true },
      });
      resolvedPhotoId = photo?.id ?? null;
    }

    let resolvedPlaceId = placeId ?? null;
    if (!resolvedPlaceId && placeLocalId) {
      const place = await prisma.place.findFirst({
        where: { travelId, localId: placeLocalId },
        select: { id: true },
      });
      resolvedPlaceId = place?.id ?? null;
    }

    if (type === "PHOTO" && !resolvedPhotoId) {
      return NextResponse.json(
        { error: "Las notas de foto requieren photoId" },
        { status: 400 }
      );
    }

    if (type === "PLACE" && !resolvedPlaceId) {
      return NextResponse.json(
        { error: "Las notas de lugar requieren placeId" },
        { status: 400 }
      );
    }

    const note = await prisma.note.create({
      data: {
        travelId,
        userId,
        photoId: type === "PHOTO" ? resolvedPhotoId : null,
        placeId: type === "PLACE" ? resolvedPlaceId : null,
        type: type as NoteType,
        dayDate: dayDate ? new Date(dayDate) : null,
        text: text.trim(),
        localId: localId ?? null,
      },
      include: { user: true },
    });

    await prisma.travel.update({
      where: { id: travelId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error("POST /api/notes", error);
    return NextResponse.json({ error: "Error al crear nota" }, { status: 500 });
  }
}
