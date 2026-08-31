export const PENDING_SHARE_KEY = "traveltoblog_pending_share";

export interface SharedBundleResponse {
  bundle: {
    id: string;
    createdAt: string;
    files: { name: string; type: string; size: number; url: string }[];
  };
}

export async function fetchSharedFiles(bundleId: string): Promise<File[]> {
  const res = await fetch(`/api/share-target/${bundleId}`);
  if (!res.ok) throw new Error("shared-not-found");
  const data = (await res.json()) as SharedBundleResponse;

  return Promise.all(
    data.bundle.files.map(async (file) => {
      const fileRes = await fetch(file.url);
      if (!fileRes.ok) throw new Error("shared-file-missing");
      const blob = await fileRes.blob();
      return new File([blob], file.name, { type: file.type || blob.type || "image/jpeg" });
    })
  );
}

export function storePendingShareId(bundleId: string): void {
  sessionStorage.setItem(PENDING_SHARE_KEY, bundleId);
}

export function consumePendingShareId(): string | null {
  const id = sessionStorage.getItem(PENDING_SHARE_KEY);
  if (id) sessionStorage.removeItem(PENDING_SHARE_KEY);
  return id;
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
