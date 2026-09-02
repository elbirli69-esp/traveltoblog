import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PHOTOS_PAGE_SIZE } from "@/lib/pagination";

const MAX_PAGE_SIZE = 48;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: travelId } = await params;
    const pageParam = request.nextUrl.searchParams.get("page");
    const focusPhotoId = request.nextUrl.searchParams.get("focusPhotoId");
    let page = Math.max(1, Number(pageParam ?? "1") || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        Number(request.nextUrl.searchParams.get("pageSize") ?? PHOTOS_PAGE_SIZE) ||
          PHOTOS_PAGE_SIZE
      )
    );

    if (focusPhotoId) {
      const ordered = await prisma.photo.findMany({
        where: { travelId },
        orderBy: { exifDateTime: "asc" },
        select: { id: true },
      });
      const idx = ordered.findIndex((p) => p.id === focusPhotoId);
      if (idx >= 0) {
        page = Math.floor(idx / pageSize) + 1;
      }
    }

    const skip = (page - 1) * pageSize;

    const [total, photos] = await Promise.all([
      prisma.photo.count({ where: { travelId } }),
      prisma.photo.findMany({
        where: { travelId },
        include: {
          user: { select: { alias: true } },
          place: { select: { id: true, name: true, type: true } },
          notes: {
            include: { user: { select: { alias: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { exifDateTime: "asc" },
        skip,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      photos,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error("GET /api/travels/[id]/photos", error);
    return NextResponse.json({ error: "Error al cargar fotos" }, { status: 500 });
  }
}
