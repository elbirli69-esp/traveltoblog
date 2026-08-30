import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateShareCode } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, alias } = body as { title?: string; alias?: string };

    if (!title?.trim() || !alias?.trim()) {
      return NextResponse.json(
        { error: "Título y alias son obligatorios" },
        { status: 400 }
      );
    }

    const shareCode = generateShareCode();

    const travel = await prisma.travel.create({
      data: {
        title: title.trim(),
        shareCode,
        users: {
          create: { alias: alias.trim() },
        },
      },
      include: { users: true },
    });

    const creator = travel.users[0];

    return NextResponse.json({
      travel: {
        id: travel.id,
        title: travel.title,
        shareCode: travel.shareCode,
      },
      user: {
        id: creator.id,
        alias: creator.alias,
        travelId: travel.id,
      },
    });
  } catch (error) {
    console.error("POST /api/travels", error);
    return NextResponse.json({ error: "Error al crear el viaje" }, { status: 500 });
  }
}

export async function GET() {
  const travels = await prisma.travel.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      _count: { select: { users: true, photos: true } },
    },
  });

  return NextResponse.json({ travels });
}
