import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { readStoredPhotoBuffer } from "@/lib/photo-gps";
import { isHeicFilename, photoFilePath } from "@/lib/photo-storage";
import { ensureThumbnailBuffer } from "@/lib/photo-thumbnail";

/** Sirve miniatura JPEG (~480px) para la UI. Las fotos reales se usan en export. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const photo = await prisma.photo.findUnique({ where: { id } });
    if (!photo) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Videos: prefer poster still for thumbs / gallery tiles
    if (photo.mediaType === "VIDEO" && photo.posterFilename) {
      try {
        const posterBuffer = await readFile(
          photoFilePath(photo.travelId, photo.posterFilename)
        );
        const thumbBuffer = await ensureThumbnailBuffer(
          photo.travelId,
          photo.filename,
          posterBuffer,
          ".jpg"
        );
        return new NextResponse(new Uint8Array(thumbBuffer), {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=604800, immutable",
          },
        });
      } catch {
        // fall through
      }
    }

    const fullBuffer = await readStoredPhotoBuffer(photo.url);
    if (!fullBuffer) {
      return new NextResponse("Not found", { status: 404 });
    }

    if (photo.mediaType === "VIDEO") {
      // No poster: cannot decode video with sharp — return 404 placeholder handled by UI
      return new NextResponse("Not found", { status: 404 });
    }

    const ext = path.extname(photo.filename) || path.extname(photo.url) || ".jpg";
    const thumbBuffer = await ensureThumbnailBuffer(
      photo.travelId,
      photo.filename,
      fullBuffer,
      isHeicFilename(photo.filename) ? ext : ext
    );

    return new NextResponse(new Uint8Array(thumbBuffer), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch (error) {
    console.error("GET /api/photos/[id]/thumb", error);
    return new NextResponse("Error", { status: 500 });
  }
}
