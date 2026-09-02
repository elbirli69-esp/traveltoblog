import {
  formatCapacitorError,
  isCapacitorNative,
  isPhotoExifPluginAvailable,
  PhotoExif,
} from "@/lib/capacitor-native";

export class DownloadCancelledError extends Error {
  constructor() {
    super("Descarga cancelada");
    this.name = "DownloadCancelledError";
  }
}

export type DownloadResult = "saved" | "shared" | "preview";

function isNativeMethodMissing(error: unknown): boolean {
  const msg = formatCapacitorError(error).toLowerCase();
  return (
    msg.includes("not implemented") ||
    msg.includes("unimplemented") ||
    msg.includes("plugin is not implemented")
  );
}

async function shareFileWithWebApi(file: File, title: string): Promise<boolean> {
  if (typeof navigator.share !== "function") return false;

  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new DownloadCancelledError();
    }
    return false;
  }
}

/** Native save/share when PhotoExif plugin supports it; null → use web fallbacks. */
async function saveWithNativePlugin(
  base64: string,
  filename: string,
  mimeType: string
): Promise<"shared" | "saved" | null> {
  if (!isPhotoExifPluginAvailable()) {
    return null;
  }

  let shareMissing = false;
  let saveMissing = false;

  try {
    const saved = await PhotoExif.saveExportFile({ base64, filename, mimeType });
    if (saved.ok) return "saved";
  } catch (saveError) {
    if (isNativeMethodMissing(saveError)) {
      saveMissing = true;
    }
  }

  try {
    await PhotoExif.shareExportFile({ base64, filename, mimeType });
    return "shared";
  } catch (shareError) {
    if (isNativeMethodMissing(shareError)) {
      shareMissing = true;
    } else if (!saveMissing) {
      throw shareError;
    }
  }

  if (saveMissing && shareMissing) {
    return null;
  }

  return null;
}

/** Save or share a generated file (WebView/Android often ignores <a download>). */
export async function downloadBlob(
  blob: Blob,
  filename: string,
  options?: { base64?: string }
): Promise<DownloadResult> {
  const mimeType = blob.type || "application/octet-stream";
  const file = new File([blob], filename, { type: mimeType });

  if (isCapacitorNative() && isPhotoExifPluginAvailable()) {
    const base64 = options?.base64 ?? (await blobToBase64(blob));
    const mode = await saveWithNativePlugin(base64, filename, mimeType);
    if (mode === "shared") return "shared";
    if (mode === "saved") return "saved";
  }

  if (await shareFileWithWebApi(file, filename)) {
    return "shared";
  }

  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    if (!isCapacitorNative()) {
      return "saved";
    }
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  if (await shareFileWithWebApi(file, filename)) {
    return "shared";
  }

  await openBlobPreview(blob);
  return "preview";
}

export async function downloadFromBase64(
  base64: string,
  filename: string,
  contentType: string
): Promise<DownloadResult> {
  const blob = base64ToBlob(base64, contentType);
  return downloadBlob(blob, filename, { base64 });
}

export async function openBlobPreview(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank", "noopener,noreferrer");
  if (tab) {
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }

  if (typeof navigator.share === "function") {
    const file = new File([blob], "vista-previa.html", { type: blob.type || "text/html" });
    try {
      await navigator.share({ files: [file], title: "Vista previa del viaje" });
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new DownloadCancelledError();
      }
    }
  }

  URL.revokeObjectURL(url);
  throw new Error(
    "No se pudo abrir la vista previa. Permite ventanas emergentes o usa «Exportar» y elige dónde guardar."
  );
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
