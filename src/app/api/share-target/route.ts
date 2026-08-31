import { NextRequest, NextResponse } from "next/server";
import { cleanupOldBundles, saveSharedFiles } from "@/lib/share-inbox";

export async function POST(request: NextRequest) {
  try {
    await cleanupOldBundles();

    const formData = await request.formData();
    const files = [
      ...formData.getAll("photos"),
      ...formData.getAll("files"),
      ...formData.getAll("media"),
    ].filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return NextResponse.redirect(new URL("/share/receive?error=no-files", request.url), 303);
    }

    const bundle = await saveSharedFiles(files);
    return NextResponse.redirect(
      new URL(`/share/receive?id=${encodeURIComponent(bundle.id)}`, request.url),
      303
    );
  } catch (error) {
    console.error("POST /api/share-target", error);
    return NextResponse.redirect(new URL("/share/receive?error=invalid", request.url), 303);
  }
}
