import { rm } from "fs/promises";
import path from "path";

export async function deleteTravelStorage(travelId: string): Promise<void> {
  const uploadsDir = path.join(process.cwd(), "public", "uploads", travelId);
  const exportCacheDir = path.join(process.cwd(), "data", "export-cache", travelId);

  await Promise.all([
    rm(uploadsDir, { recursive: true, force: true }),
    rm(exportCacheDir, { recursive: true, force: true }),
  ]);
}
