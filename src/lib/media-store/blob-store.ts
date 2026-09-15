import { del, head, list, put } from "@vercel/blob";
import { getBlobToken } from "@/lib/runtime-config";
import type { MediaPutOptions, MediaStore } from "@/lib/media-store/types";
import { contentTypeForFilename } from "@/lib/media-store/types";

/**
 * Vercel Blob driver. Keys map 1:1 to pathname (`uploads/...`).
 * Requires BLOB_READ_WRITE_TOKEN.
 */
export function createBlobMediaStore(): MediaStore {
  const token = getBlobToken();
  if (!token) {
    throw new Error(
      "STORAGE_DRIVER=blob requiere BLOB_READ_WRITE_TOKEN (Vercel Blob)."
    );
  }

  const urlCache = new Map<string, string>();

  async function resolveUrl(key: string): Promise<string | null> {
    const k = key.replace(/^\/+/, "");
    const cached = urlCache.get(k);
    if (cached) return cached;
    try {
      const meta = await head(k, { token });
      urlCache.set(k, meta.url);
      return meta.url;
    } catch {
      return null;
    }
  }

  return {
    driver: "blob",

    async put(key, data, options?: MediaPutOptions) {
      const pathname = key.replace(/^\/+/, "");
      const contentType =
        options?.contentType ?? contentTypeForFilename(pathname);
      const result = await put(pathname, data, {
        access: "public",
        token,
        contentType,
        addRandomSuffix: false,
        allowOverwrite: options?.overwrite ?? true,
      });
      urlCache.set(pathname, result.url);
      return { url: result.url };
    },

    async get(key) {
      const pathname = key.replace(/^\/+/, "");
      const url = await resolveUrl(pathname);
      if (!url) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    },

    async delete(key) {
      const pathname = key.replace(/^\/+/, "");
      const url = urlCache.get(pathname) ?? (await resolveUrl(pathname));
      urlCache.delete(pathname);
      if (url) {
        await del(url, { token });
        return;
      }
      try {
        await del(pathname, { token });
      } catch {
        // ignore
      }
    },

    async deleteTravelPrefix(travelId) {
      const prefix = `uploads/${travelId}/`;
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, token, cursor });
        if (page.blobs.length > 0) {
          await del(
            page.blobs.map((b) => b.url),
            { token }
          );
          for (const b of page.blobs) {
            urlCache.delete(b.pathname);
          }
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
    },

    async exists(key) {
      const pathname = key.replace(/^\/+/, "");
      try {
        const meta = await head(pathname, { token });
        urlCache.set(pathname, meta.url);
        return true;
      } catch {
        return false;
      }
    },

    publicUrl(key) {
      const pathname = key.replace(/^\/+/, "");
      return urlCache.get(pathname) ?? `/${pathname}`;
    },
  };
}
