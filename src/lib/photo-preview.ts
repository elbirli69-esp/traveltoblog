const HEIC_EXT = /\.(heic|heif)$/i;

function isHeicFile(file: File): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || HEIC_EXT.test(file.name);
}

/** Browser preview URL — converts HEIC to JPEG when the img tag cannot render it. */
export async function createPhotoPreviewUrl(file: File): Promise<string> {
  if (!isHeicFile(file)) {
    return URL.createObjectURL(file);
  }

  // Dynamic import: heic2any touches `window` at module load and must not SSR.
  try {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.85,
    });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    return URL.createObjectURL(blob);
  } catch {
    return URL.createObjectURL(file);
  }
}
