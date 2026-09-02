/** Client-only: grab a still frame + duration from a video File. */

export interface VideoPosterResult {
  posterBlob: Blob;
  durationMs: number;
}

export async function extractVideoPoster(file: File): Promise<VideoPosterResult> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      const onError = () => reject(new Error("No se pudo leer el vídeo"));
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", onError, { once: true });
    });

    const durationMs = Number.isFinite(video.duration)
      ? Math.round(video.duration * 1000)
      : 0;

    const seekTo = Math.min(0.5, Math.max(0.05, (video.duration || 1) * 0.1));
    await new Promise<void>((resolve) => {
      const onSeeked = () => resolve();
      video.addEventListener("seeked", onSeeked, { once: true });
      try {
        video.currentTime = seekTo;
      } catch {
        resolve();
      }
      // Some browsers fire seeked immediately at 0
      setTimeout(resolve, 800);
    });

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    const maxW = 1280;
    const scale = width > maxW ? maxW / width : 1;
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas no disponible");
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const posterBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Poster vacío"))),
        "image/jpeg",
        0.85
      );
    });

    return { posterBlob, durationMs };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
