import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateShareCode } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, alias, startDate, endDate, mode } = body as {
      title?: string;
      alias?: string;
      startDate?: string | null;
      endDate?: string | null;
      mode?: "live" | "past";
    };

    if (!title?.trim() || !alias?.trim()) {
      return NextResponse.json(
        { error: "Título y alias son obligatorios" },
        { status: 400 }
      );
    }

    if (mode === "past" && (!startDate || !endDate)) {
      return NextResponse.json(
        { error: "Las fechas del viaje son obligatorias para un viaje pasado" },
        { status: 400 }
      );
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return NextResponse.json(
        { error: "La fecha de fin debe ser posterior al inicio" },
        { status: 400 }
      );
    }

    const shareCode = generateShareCode();

    const travel = await prisma.$transaction(async (tx) => {
      const created = await tx.travel.create({
        data: {
          title: title.trim(),
          shareCode,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          users: {
            create: { alias: alias.trim() },
          },
        },
        include: { users: true },
      });

      const creator = created.users[0];
      return tx.travel.update({
        where: { id: created.id },
        data: { creatorId: creator.id },
        include: { users: true },
      });
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
