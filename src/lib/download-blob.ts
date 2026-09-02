import { isCapacitorNative } from "@/lib/capacitor-native";

export class DownloadCancelledError extends Error {
  constructor() {
    super("Descarga cancelada");
    this.name = "DownloadCancelledError";
  }
}

/** Save or share a generated file (WebView/Android often ignores <a download>). */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, {
    type: blob.type || "application/octet-stream",
  });

  if (typeof navigator.share === "function" && typeof navigator.canShare === "function") {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new DownloadCancelledError();
      }
      if (!isCapacitorNative()) throw error;
    }
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

    if (isCapacitorNative()) {
      throw new Error(
        "Tu dispositivo no pudo guardar el archivo automáticamente. Prueba «Vista previa» y usa Compartir → Guardar en Descargas."
      );
    }
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
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
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Vista previa del viaje" });
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
      return;
    }
  }

  URL.revokeObjectURL(url);
  throw new Error(
    "No se pudo abrir la vista previa. Permite ventanas emergentes o usa «Exportar» y elige dónde guardar."
  );
}
