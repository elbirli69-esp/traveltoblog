import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  try {
    const body = await request.json();
    const { alias } = body as { alias?: string };

    if (!alias?.trim()) {
      return NextResponse.json({ error: "Alias obligatorio" }, { status: 400 });
    }

    const travel = await prisma.travel.findUnique({
      where: { shareCode: code },
    });

    if (!travel) {
      return NextResponse.json({ error: "Código de viaje inválido" }, { status: 404 });
    }

    const existing = await prisma.user.findUnique({
      where: { travelId_alias: { travelId: travel.id, alias: alias.trim() } },
    });

    if (existing) {
      return NextResponse.json({
        travel: { id: travel.id, title: travel.title, shareCode: travel.shareCode },
        user: { id: existing.id, alias: existing.alias, travelId: travel.id },
      });
    }

    const user = await prisma.user.create({
      data: { alias: alias.trim(), travelId: travel.id },
    });

    return NextResponse.json({
      travel: { id: travel.id, title: travel.title, shareCode: travel.shareCode },
      user: { id: user.id, alias: user.alias, travelId: travel.id },
    });
  } catch (error) {
    console.error("POST /api/join", error);
    return NextResponse.json({ error: "Error al unirse al viaje" }, { status: 500 });
  }
}
