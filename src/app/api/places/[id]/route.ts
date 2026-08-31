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
    const { name, type, latitude, longitude, comment } = body as {
      name?: string;
      type?: PlaceType;
      latitude?: number;
      longitude?: number;
      comment?: string | null;
    };

    const data: {
      name?: string;
      type?: PlaceType;
      latitude?: number;
      longitude?: number;
      comment?: string | null;
    } = {};

    if (name != null) data.name = name.trim();
    if (type != null && PLACE_TYPES.includes(type)) data.type = type;
    if (latitude != null) data.latitude = latitude;
    if (longitude != null) data.longitude = longitude;
    if (comment !== undefined) data.comment = comment?.trim() || null;

    const place = await prisma.place.update({
      where: { id },
      data,
      include: { user: true },
    });

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
