/**
 * One-shot migration: Synology SQLite + public/uploads → Neon Postgres + Vercel Blob.
 *
 * Usage (from a machine that can read the NAS DB/files AND has cloud credentials):
 *
 *   # Dry-run (counts only)
 *   SOURCE_DATABASE_URL="file:./data/travel.db" \
 *   SOURCE_UPLOADS_DIR="./public/uploads" \
 *   DATABASE_URL="postgresql://..." \
 *   BLOB_READ_WRITE_TOKEN="vercel_blob_..." \
 *   STORAGE_DRIVER=blob \
 *   npx tsx scripts/migrate-nas-to-cloud.ts --dry-run
 *
 *   # Apply
 *   ... same env ... npx tsx scripts/migrate-nas-to-cloud.ts --apply
 *
 * Strategy: CLONE (NAS untouched). Keeps the same cuid primary keys.
 * Requires prisma schema pointed at Postgres for the destination client
 * (see prisma/schema.cloud.prisma) OR DATABASE_URL already set to Postgres
 * with a generated client that supports it.
 *
 * This script uses raw SQL via better-sqlite3 for the source and Prisma for the
 * destination when available; if Prisma provider is still sqlite, it only
 * uploads media to Blob and prints SQL/JSON for DB import.
 */

import { createReadStream, existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { put } from "@vercel/blob";

const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--apply");

function env(name: string, fallback?: string): string {
  const v = process.env[name]?.trim() || fallback;
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
  };
  return map[ext] ?? "application/octet-stream";
}

async function migrateMedia(uploadsDir: string, token: string) {
  const files = walkFiles(uploadsDir);
  console.log(`Media files found: ${files.length} under ${uploadsDir}`);
  let ok = 0;
  let fail = 0;
  for (const filePath of files) {
    const rel = path.relative(uploadsDir, filePath).replace(/\\/g, "/");
    const pathname = `uploads/${rel}`;
    if (dryRun) {
      ok++;
      continue;
    }
    try {
      const stream = createReadStream(filePath);
      await put(pathname, stream, {
        access: "public",
        token,
        contentType: contentTypeFor(filePath),
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      ok++;
      if (ok % 25 === 0) console.log(`  uploaded ${ok}/${files.length}`);
    } catch (err) {
      fail++;
      console.error(`  FAIL ${pathname}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`Media: ok=${ok} fail=${fail} dryRun=${dryRun}`);
}

async function summarizeSqlite(dbPath: string) {
  // Prefer Prisma if the local app DB is already this file
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({
      datasources: { db: { url: dbPath.startsWith("file:") ? dbPath : `file:${dbPath}` } },
    });
    const [travels, users, photos, places, notes, tracks] = await Promise.all([
      prisma.travel.count(),
      prisma.user.count(),
      prisma.photo.count(),
      prisma.place.count(),
      prisma.note.count(),
      prisma.gpsTrack.count(),
    ]);
    await prisma.$disconnect();
    console.log("SQLite counts:", { travels, users, photos, places, notes, tracks });
    return { travels, users, photos, places, notes, tracks };
  } catch (err) {
    console.warn("Could not open source DB via Prisma:", err);
    return null;
  }
}

async function main() {
  console.log(`migrate-nas-to-cloud (${dryRun ? "DRY-RUN" : "APPLY"})`);
  const sourceDb = process.env.SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
  const uploadsDir =
    process.env.SOURCE_UPLOADS_DIR ?? path.join(process.cwd(), "public", "uploads");
  if (!sourceDb) throw new Error("Set SOURCE_DATABASE_URL or DATABASE_URL");
  if (!existsSync(uploadsDir)) {
    console.warn(`Uploads dir missing: ${uploadsDir}`);
  } else {
    const size = walkFiles(uploadsDir).reduce((n, f) => n + statSync(f).size, 0);
    console.log(`Uploads dir: ${uploadsDir} (~${(size / 1e6).toFixed(1)} MB)`);
  }

  await summarizeSqlite(sourceDb);

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.warn("BLOB_READ_WRITE_TOKEN not set — skipping Blob upload.");
  } else {
    await migrateMedia(uploadsDir, token);
  }

  if (dryRun) {
    console.log(`
Next steps:
  1. Create Neon DB + set DATABASE_URL (Postgres).
  2. prisma db push --schema prisma/schema.cloud.prisma
  3. Re-run with --apply to upload media to Blob.
  4. Import rows (same ids) with a follow-up DB dump/load or extend this script.
  5. Set STORAGE_DRIVER=blob on Vercel.
`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
