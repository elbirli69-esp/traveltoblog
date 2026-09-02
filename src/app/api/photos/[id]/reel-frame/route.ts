import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { createReelFrameJpeg } from "@/lib/export-reel-images";
import { readStoredPhotoBuffer } from "@/lib/photo-gps";
import { photoFilePath } from "@/lib/photo-storage";

/** Serves a 1080×1920 JPEG still optimized for Instagram Reels encoding. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const photo = await prisma.photo.findUnique({ where: { id } });
    if (!photo || !photo.selected) {
      return new NextResponse("Not found", { status: 404 });
    }

    let source: Buffer | null = null;
    let ext = path.extname(photo.filename) || ".jpg";

    if (photo.mediaType === "VIDEO") {
      if (!photo.posterFilename) {
        return new NextResponse("Not found", { status: 404 });
      }
      source = await readFile(photoFilePath(photo.travelId, photo.posterFilename));
      ext = ".jpg";
    } else {
      source = await readStoredPhotoBuffer(photo.url);
    }

    if (!source) {
      return new NextResponse("Not found", { status: 404 });
    }

    const jpeg = await createReelFrameJpeg(source, ext);
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("GET /api/photos/[id]/reel-frame", error);
    return new NextResponse("Error", { status: 500 });
  }
}
