import { access, mkdir, readFile, rm, unlink, writeFile } from "fs/promises";
import path from "path";
import type { MediaPutOptions, MediaStore } from "@/lib/media-store/types";

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

function keyToFsPath(key: string): string | null {
  const normalized = key.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!normalized.startsWith("uploads/")) return null;
  const relative = normalized.slice("uploads/".length);
  const segments = relative.split("/").filter(Boolean).map((s) => path.basename(s));
  if (segments.length < 1 || segments.some((s) => s === "." || s === "..")) {
    return null;
  }
  const full = path.join(UPLOADS_ROOT, ...segments);
  if (!full.startsWith(UPLOADS_ROOT)) return null;
  return full;
}

export function createFsMediaStore(): MediaStore {
  return {
    driver: "fs",

    async put(key, data, _options?: MediaPutOptions) {
      const filePath = keyToFsPath(key);
      if (!filePath) throw new Error(`Invalid media key: ${key}`);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, data);
      return { url: `/${key.replace(/^\/+/, "")}` };
    },

    async get(key) {
      const filePath = keyToFsPath(key);
      if (!filePath) return null;
      try {
        return await readFile(filePath);
      } catch {
        return null;
      }
    },

    async delete(key) {
      const filePath = keyToFsPath(key);
      if (!filePath) return;
      try {
        await unlink(filePath);
      } catch {
        // missing is fine
      }
    },

    async deleteTravelPrefix(travelId) {
      const dir = path.join(UPLOADS_ROOT, path.basename(travelId));
      await rm(dir, { recursive: true, force: true });
    },

    async exists(key) {
      const filePath = keyToFsPath(key);
      if (!filePath) return false;
      try {
        await access(filePath);
        return true;
      } catch {
        return false;
      }
    },

    publicUrl(key) {
      return `/${key.replace(/^\/+/, "")}`;
    },
  };
}
