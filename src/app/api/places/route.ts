import { NextRequest, NextResponse } from "next/server";
import { PlaceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PLACE_TYPES } from "@/lib/places";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { travelId, userId, name, type, latitude, longitude, comment, localId } = body as {
      travelId?: string;
      userId?: string;
      name?: string;
      type?: PlaceType;
      latitude?: number;
      longitude?: number;
      comment?: string | null;
      localId?: string;
    };

    if (
      !travelId ||
      !userId ||
      !name?.trim() ||
      latitude == null ||
      longitude == null
    ) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    if (localId) {
      const existing = await prisma.place.findUnique({
        where: { localId },
        include: { user: true },
      });
      if (existing) {
        return NextResponse.json({ place: existing });
      }
    }

    const placeType =
      type && PLACE_TYPES.includes(type) ? type : PlaceType.OTHER;

    const place = await prisma.place.create({
      data: {
        travelId,
        userId,
        name: name.trim(),
        type: placeType,
        latitude,
        longitude,
        comment: comment?.trim() || null,
        localId: localId ?? null,
      },
      include: { user: true },
    });

    await prisma.travel.update({
      where: { id: travelId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ place });
  } catch (error) {
    console.error("POST /api/places", error);
    return NextResponse.json({ error: "Error al crear lugar" }, { status: 500 });
  }
}
