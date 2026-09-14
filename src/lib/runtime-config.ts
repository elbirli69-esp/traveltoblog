/**
 * Dual-host runtime flags (Synology fs+SQLite vs Vercel blob+Postgres).
 * Defaults keep NAS / Docker behaviour unchanged.
 */

export type StorageDriver = "fs" | "blob";

export function getStorageDriver(): StorageDriver {
  const raw = (process.env.STORAGE_DRIVER ?? "fs").trim().toLowerCase();
  return raw === "blob" ? "blob" : "fs";
}

export function isBlobStorage(): boolean {
  return getStorageDriver() === "blob";
}

/** WeasyPrint PDF works in Docker/NAS; on Vercel it is typically unavailable. */
export function isPdfExportEnabled(): boolean {
  const explicit = process.env.PDF_EXPORT_ENABLED?.trim().toLowerCase();
  if (explicit === "0" || explicit === "false" || explicit === "off") return false;
  if (explicit === "1" || explicit === "true" || explicit === "on") return true;
  if (process.env.VERCEL === "1") return false;
  return true;
}

export function getBlobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
}
