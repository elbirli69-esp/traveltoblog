import { NextRequest, NextResponse } from "next/server";
import { PlaceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PLACE_TYPES } from "@/lib/places";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, type, latitude, longitude, comment, visitedAt, linkPhotoIds, unlinkPhotoIds } =
      body as {
        name?: string;
        type?: PlaceType;
        latitude?: number;
        longitude?: number;
        comment?: string | null;
        visitedAt?: string | null;
        /** Associate these photos with this place */
        linkPhotoIds?: string[];
        /** Clear place link on these photos */
        unlinkPhotoIds?: string[];
      };

    const existing = await prisma.place.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Lugar no encontrado" }, { status: 404 });
    }

    const data: {
      name?: string;
      type?: PlaceType;
      latitude?: number;
      longitude?: number;
      comment?: string | null;
      visitedAt?: Date | null;
    } = {};

    if (name != null) data.name = name.trim();
    if (type != null && PLACE_TYPES.includes(type)) data.type = type;
    if (latitude != null) data.latitude = latitude;
    if (longitude != null) data.longitude = longitude;
    if (comment !== undefined) data.comment = comment?.trim() || null;
    if (visitedAt !== undefined) data.visitedAt = visitedAt ? new Date(visitedAt) : null;

    const place = await prisma.place.update({
      where: { id },
      data,
      include: { user: true },
    });

    if (Array.isArray(linkPhotoIds) && linkPhotoIds.length > 0) {
      await prisma.photo.updateMany({
        where: { travelId: place.travelId, id: { in: linkPhotoIds } },
        data: { placeId: place.id },
      });
    }
    if (Array.isArray(unlinkPhotoIds) && unlinkPhotoIds.length > 0) {
      await prisma.photo.updateMany({
        where: {
          travelId: place.travelId,
          id: { in: unlinkPhotoIds },
          placeId: place.id,
        },
        data: { placeId: null },
      });
    }

    await prisma.travel.update({
      where: { id: place.travelId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ place });
  } catch (error) {
    console.error("PATCH /api/places/[id]", error);
    return NextResponse.json({ error: "Error al actualizar lugar" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.place.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/places/[id]", error);
    return NextResponse.json({ error: "Error al eliminar lugar" }, { status: 500 });
  }
}
