import { NextRequest, NextResponse } from "next/server";
import { PlaceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { autoLinkPhotosForTravel } from "@/lib/photo-place-auto-link";
import { PLACE_TYPES } from "@/lib/places";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { travelId, userId, name, type, latitude, longitude, comment, localId, visitedAt } = body as {
      travelId?: string;
      userId?: string;
      name?: string;
      type?: PlaceType;
      latitude?: number;
      longitude?: number;
      /** Legacy: converted to Note(type=PLACE), not stored on Place.comment */
      comment?: string | null;
      localId?: string;
      visitedAt?: string | null;
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
        include: {
          user: true,
          notes: { include: { user: true }, orderBy: { createdAt: "asc" } },
        },
      });
      if (existing) {
        return NextResponse.json({ place: existing });
      }
    }

    const placeType =
      type && PLACE_TYPES.includes(type) ? type : PlaceType.OTHER;
    const noteText = comment?.trim() || null;

    const place = await prisma.place.create({
      data: {
        travelId,
        userId,
        name: name.trim(),
        type: placeType,
        latitude,
        longitude,
        comment: null,
        visitedAt: visitedAt ? new Date(visitedAt) : new Date(),
        localId: localId ?? null,
        ...(noteText
          ? {
              notes: {
                create: {
                  travelId,
                  userId,
                  type: "PLACE",
                  text: noteText,
                },
              },
            }
          : {}),
      },
      include: {
        user: true,
        notes: { include: { user: true }, orderBy: { createdAt: "asc" } },
      },
    });

    await prisma.travel.update({
      where: { id: travelId },
      data: { updatedAt: new Date() },
    });

    await autoLinkPhotosForTravel(travelId);

    return NextResponse.json({ place });
  } catch (error) {
    console.error("POST /api/places", error);
    return NextResponse.json({ error: "Error al crear lugar" }, { status: 500 });
  }
}
