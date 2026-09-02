import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  canEncodeVideo,
} from "mediabunny";
import type { ReelManifest } from "@/lib/export-reel";
import { REEL_BITRATE, REEL_HEIGHT, REEL_WIDTH } from "@/lib/export-reel";

export type ReelEncodeProgress = {
  phase: "frames" | "encode" | "cover" | "zip";
  current: number;
  total: number;
  message: string;
};

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar el fotograma: ${url}`));
    img.src = url;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  scale: number,
  panX: number,
  panY: number
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const base = Math.max(width / iw, height / ih) * scale;
  const dw = iw * base;
  const dh = ih * base;
  const dx = (width - dw) / 2 + panX * (dw - width) * 0.5;
  const dy = (height - dh) / 2 + panY * (dh - height) * 0.5;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawSafeText(
  ctx: CanvasRenderingContext2D,
  lines: { text: string; size: number; weight?: string }[],
  y: number,
  width: number
) {
  const padX = Math.round(width * 0.1);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let cursorY = y;
  for (const line of lines) {
    if (!line.text) continue;
    ctx.font = `${line.weight ?? "600"} ${line.size}px "Segoe UI", system-ui, sans-serif`;
    const metrics = ctx.measureText(line.text);
    const tw = Math.min(metrics.width + 48, width - padX * 2);
    const th = line.size * 1.55;
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect((width - tw) / 2, cursorY - th / 2, tw, th);
    ctx.fillStyle = "#fff";
    ctx.fillText(line.text, width / 2, cursorY, width - padX * 2 - 24);
    cursorY += th + 10;
  }
  ctx.restore();
}

function drawScrim(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, "rgba(0,0,0,0.35)");
  g.addColorStop(0.22, "rgba(0,0,0,0)");
  g.addColorStop(0.72, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo crear cover.jpg"))),
      "image/jpeg",
      0.88
    );
  });
}

export async function canEncodeInstagramReel(): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    return await canEncodeVideo("avc", { width: REEL_WIDTH, height: REEL_HEIGHT });
  } catch {
    return false;
  }
}

/**
 * Encode an Instagram Reels-ready mute MP4 (H.264 / AVC, 9:16) in the browser.
 */
export async function encodeInstagramReelMp4(
  manifest: ReelManifest,
  onProgress?: (p: ReelEncodeProgress) => void
): Promise<{ mp4: Blob; cover: Blob }> {
  const ok = await canEncodeInstagramReel();
  if (!ok) {
    throw new Error(
      "Este navegador no puede generar MP4 H.264 (hace falta Chrome, Edge o Android reciente)."
    );
  }

  const width = manifest.width;
  const height = manifest.height;
  const fps = manifest.fps;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas no disponible");

  onProgress?.({
    phase: "frames",
    current: 0,
    total: manifest.frames.length,
    message: "Descargando fotogramas…",
  });

  const images: HTMLImageElement[] = [];
  for (let i = 0; i < manifest.frames.length; i++) {
    const frame = manifest.frames[i];
    const img = await loadImage(`/api/photos/${frame.photoId}/reel-frame`);
    images.push(img);
    onProgress?.({
      phase: "frames",
      current: i + 1,
      total: manifest.frames.length,
      message: `Fotograma ${i + 1}/${manifest.frames.length}`,
    });
  }

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });

  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    bitrate: REEL_BITRATE,
    keyFrameInterval: 2,
    bitrateMode: "variable",
  });
  output.addVideoTrack(videoSource, { frameRate: fps });
  await output.start();

  const introSeconds = 1.6;
  const outroSeconds = 1.4;
  const clipSeconds = manifest.secondsPerClip;
  const totalFramesEstimate =
    Math.round((introSeconds + outroSeconds + clipSeconds * images.length) * fps) || 1;
  let frameIndex = 0;

  const reportEncode = (message: string) => {
    if (frameIndex % 10 === 0 || frameIndex + 1 >= totalFramesEstimate) {
      onProgress?.({
        phase: "encode",
        current: Math.min(frameIndex + 1, totalFramesEstimate),
        total: totalFramesEstimate,
        message,
      });
    }
  };

  const paintIntro = (t: number) => {
    const img = images[0];
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, width, height);
    if (img) {
      const scale = 1.08 + easeInOut(t) * 0.06;
      drawCover(ctx, img, width, height, scale, 0, -0.05);
    }
    drawScrim(ctx, width, height);
    drawSafeText(
      ctx,
      [
        { text: manifest.title, size: 64, weight: "700" },
        ...(manifest.dateRangeLabel
          ? [{ text: manifest.dateRangeLabel, size: 32, weight: "500" }]
          : []),
      ],
      height * 0.42,
      width
    );
  };

  const paintOutro = (t: number) => {
    const img = images[images.length - 1] ?? images[0];
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, width, height);
    if (img) {
      drawCover(ctx, img, width, height, 1.12 - easeInOut(t) * 0.04, 0, 0.04);
    }
    drawScrim(ctx, width, height);
    const people =
      manifest.participants.length > 0
        ? manifest.participants.join(" · ")
        : "TravelToBlog";
    drawSafeText(
      ctx,
      [
        { text: manifest.title, size: 52, weight: "700" },
        { text: people, size: 28, weight: "500" },
      ],
      height * 0.45,
      width
    );
  };

  const paintClip = (
    img: HTMLImageElement,
    frameMeta: ReelManifest["frames"][number],
    t: number,
    index: number
  ) => {
    const zoomFrom = frameMeta.kenBurns === "in" ? 1.0 : 1.14;
    const zoomTo = frameMeta.kenBurns === "in" ? 1.12 : 1.0;
    const scale = zoomFrom + (zoomTo - zoomFrom) * easeInOut(t);
    const panX = frameMeta.kenBurns === "in" ? -0.08 + t * 0.16 : 0.08 - t * 0.16;
    const panY = index % 2 === 0 ? -0.06 + t * 0.1 : 0.06 - t * 0.1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    drawCover(ctx, img, width, height, scale, panX, panY);
    drawScrim(ctx, width, height);
    const overlayLines: { text: string; size: number; weight?: string }[] = [];
    if (frameMeta.placeName) {
      overlayLines.push({ text: frameMeta.placeName, size: 40, weight: "700" });
    }
    if (frameMeta.dayLabel) {
      overlayLines.push({ text: frameMeta.dayLabel, size: 26, weight: "500" });
    }
    if (overlayLines.length > 0) {
      drawSafeText(ctx, overlayLines, height * 0.78, width);
    }
  };

  const addSegment = async (
    seconds: number,
    paint: (localT: number) => void,
    label: string
  ) => {
    const frameCount = Math.max(1, Math.round(seconds * fps));
    for (let i = 0; i < frameCount; i++) {
      const localT = frameCount === 1 ? 1 : i / (frameCount - 1);
      paint(localT);
      const timestamp = frameIndex / fps;
      await videoSource.add(timestamp, 1 / fps);
      reportEncode(label);
      frameIndex += 1;
    }
  };

  await addSegment(introSeconds, paintIntro, "Intro…");

  for (let i = 0; i < images.length; i++) {
    const meta = manifest.frames[i];
    const img = images[i];
    await addSegment(
      clipSeconds,
      (t) => paintClip(img, meta, t, i),
      `Clip ${i + 1}/${images.length}`
    );
  }

  await addSegment(outroSeconds, paintOutro, "Cierre…");

  await output.finalize();
  const buffer = target.buffer;
  if (!buffer) throw new Error("No se generó el MP4");

  onProgress?.({
    phase: "cover",
    current: 1,
    total: 1,
    message: "Generando portada…",
  });
  paintIntro(0.35);
  const cover = await canvasToJpegBlob(canvas);

  const mp4 = new Blob([buffer], { type: "video/mp4" });
  return { mp4, cover };
}
