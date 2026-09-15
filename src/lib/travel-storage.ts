import { rm } from "fs/promises";
import path from "path";
import { deleteTravelMedia } from "@/lib/media-store";

export async function deleteTravelStorage(travelId: string): Promise<void> {
  await deleteTravelMedia(travelId);

  const exportCacheDir = path.join(
    process.cwd(),
    "data",
    "export-cache",
    travelId
  );
  await rm(exportCacheDir, { recursive: true, force: true }).catch(() => undefined);
}
