/**
 * Smoke test for STORAGE_DRIVER=fs media-store.
 * Run: npx tsx scripts/smoke-media-store.ts
 */
import {
  deleteTravelMedia,
  getTravelFile,
  logicalPhotoUrl,
  putTravelFile,
  resetMediaStoreCache,
} from "../src/lib/media-store";

async function main() {
  resetMediaStoreCache();
  const travelId = "test-media-store-smoke";
  const buf = Buffer.from("hello-traveltoblog");
  const { url } = await putTravelFile(travelId, "a.txt", buf, "text/plain");
  const got = await getTravelFile(travelId, "a.txt");
  if (!got || got.toString() !== "hello-traveltoblog") {
    throw new Error("get mismatch");
  }
  if (url !== logicalPhotoUrl(travelId, "a.txt")) {
    throw new Error(`url mismatch ${url}`);
  }
  await deleteTravelMedia(travelId);
  const gone = await getTravelFile(travelId, "a.txt");
  if (gone) throw new Error("delete failed");
  console.log("fs media-store smoke OK", url);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
