import type { ExifMetadata } from "@/types";

export interface SharedFileResponse {
  name: string;
  type: string;
  size: number;
  url: string;
  exifDateTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SharedBundleResponse {
  bundle: {
    id: string;
    createdAt: string;
    files: SharedFileResponse[];
  };
}

export interface FetchedSharedBatch {
  files: File[];
  /** Server-extracted EXIF keyed by sanitized filename. */
  exifByName: Record<string, ExifMetadata>;
}

export const PENDING_SHARE_KEY = "traveltoblog_pending_share";

export async function fetchSharedFiles(bundleId: string): Promise<FetchedSharedBatch> {
  const res = await fetch(`/api/share-target/${bundleId}`);
  if (!res.ok) throw new Error("shared-not-found");
  const data = (await res.json()) as SharedBundleResponse;

  const exifByName: Record<string, ExifMetadata> = {};
  for (const file of data.bundle.files) {
    exifByName[file.name] = {
      dateTime: file.exifDateTime ? new Date(file.exifDateTime) : null,
      latitude: file.latitude ?? null,
      longitude: file.longitude ?? null,
    };
  }

  const files = await Promise.all(
    data.bundle.files.map(async (file) => {
      const fileRes = await fetch(file.url);
      if (!fileRes.ok) throw new Error("shared-file-missing");
      const blob = await fileRes.blob();
      return new File([blob], file.name, { type: file.type || blob.type || "image/jpeg" });
    })
  );

  return { files, exifByName };
}

export function storePendingShareId(bundleId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PENDING_SHARE_KEY, bundleId);
}

export function peekPendingShareId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(PENDING_SHARE_KEY);
}

export function consumePendingShareId(): string | null {
  if (typeof window === "undefined") return null;
  const id = sessionStorage.getItem(PENDING_SHARE_KEY);
  if (id) sessionStorage.removeItem(PENDING_SHARE_KEY);
  return id;
}

export function clearPendingShareId(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PENDING_SHARE_KEY);
}

export function travelUrlWithShare(travelId: string, bundleId?: string | null): string {
  const pending = bundleId ?? peekPendingShareId();
  if (pending) {
    return `/travel/${travelId}?shared=${encodeURIComponent(pending)}`;
  }
  return `/travel/${travelId}`;
}

export function buildTravelUrlWithPendingShare(travelId: string): string {
  const pending = consumePendingShareId();
  if (pending) {
    return `/travel/${travelId}?shared=${encodeURIComponent(pending)}`;
  }
  return `/travel/${travelId}`;
}

export async function discardSharedBundle(bundleId: string): Promise<void> {
  await fetch(`/api/share-target/${bundleId}`, { method: "DELETE" }).catch(() => undefined);
}
