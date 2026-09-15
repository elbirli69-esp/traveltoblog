/**
 * Import a TravelToBlog project backup ZIP into the configured database + MediaStore.
 *
 * Typical cloud clone (NAS untouched):
 *   1. On NAS: POST /api/export-project { travelId } → scotland.zip
 *   2. Locally with Neon + Blob credentials:
 *
 *   DATABASE_URL="postgresql://..." \
 *   BLOB_READ_WRITE_TOKEN="vercel_blob_..." \
 *   STORAGE_DRIVER=blob \
 *   npx prisma generate --schema prisma/schema.cloud.prisma \
 *   npx tsx scripts/import-project-zip.ts ./scotland.zip [--alias Rodri]
 *
 * Creates a NEW travel (new ids + shareCode). Does not modify the source host.
 */
import { readFileSync } from "fs";
import path from "path";
import { importProjectBackup } from "@/lib/project-backup";
import { resetMediaStoreCache } from "@/lib/media-store";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const aliasIdx = args.indexOf("--alias");
  const alias =
    aliasIdx >= 0 && args[aliasIdx + 1] ? args[aliasIdx + 1] : undefined;
  const zipPath = args.find((a, i) => {
    if (a === "--alias") return false;
    if (aliasIdx >= 0 && i === aliasIdx + 1) return false;
    return !a.startsWith("-");
  });

  if (!zipPath) {
    console.error(
      "Usage: npx tsx scripts/import-project-zip.ts <backup.zip> [--alias Alias]"
    );
    process.exit(1);
  }

  const abs = path.resolve(zipPath);
  console.log("Importing", abs);
  console.log("STORAGE_DRIVER=", process.env.STORAGE_DRIVER ?? "(default fs)");
  console.log(
    "DATABASE_URL provider hint=",
    (process.env.DATABASE_URL ?? "").startsWith("postgres")
      ? "postgres"
      : (process.env.DATABASE_URL ?? "").slice(0, 20) || "(missing)"
  );

  resetMediaStoreCache();
  const buffer = readFileSync(abs);
  const result = await importProjectBackup(buffer, { importerAlias: alias });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
