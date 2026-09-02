import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/prisma";
import { readStoredPhotoBuffer } from "@/lib/photo-gps";
import {
  isHeicFilename,
  normalizeImageForStorage,
  photoFilePath,
  deleteStoredPhotoFile,
} from "@/lib/photo-storage";
import { writeFile } from "fs/promises";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
};

function mimeFromExt(ext: string): string {
  return MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

/** Sirve la foto con conversión HEIC→JPEG y repara registros legacy en disco. */
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

    let buffer = await readStoredPhotoBuffer(photo.url);
    if (!buffer) {
      return new NextResponse("Not found", { status: 404 });
    }

    const ext = path.extname(photo.filename) || path.extname(photo.url) || ".jpg";
    let contentType = mimeFromExt(ext);

    if (photo.mediaType === "VIDEO") {
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
          "Accept-Ranges": "bytes",
        },
      });
    }

    if (isHeicFilename(photo.filename) || isHeicFilename(photo.url)) {
      const normalized = await normalizeImageForStorage(buffer, ext);
      buffer = Buffer.from(normalized.buffer);
      contentType = "image/jpeg";

      if (normalized.ext.toLowerCase() !== ext.toLowerCase()) {
        const newFilename = photo.filename.replace(HEIC_EXT, ".jpg");
        const newUrl = `/uploads/${photo.travelId}/${newFilename}`;
        try {
          await writeFile(photoFilePath(photo.travelId, newFilename), buffer);
          await deleteStoredPhotoFile(photo.travelId, photo.filename);
          await prisma.photo.update({
            where: { id: photo.id },
            data: { filename: newFilename, url: newUrl },
          });
        } catch (repairError) {
          console.warn("HEIC repair write failed", repairError);
        }
      }
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("GET /api/photos/[id]/image", error);
    return new NextResponse("Error", { status: 500 });
  }
}

const HEIC_EXT = /\.(heic|heif)$/i;
