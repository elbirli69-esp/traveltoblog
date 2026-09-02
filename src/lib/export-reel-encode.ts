import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  canEncodeVideo,
} from "mediabunny";
import type { ReelFramePlan, ReelManifest } from "@/lib/export-reel";
import { REEL_BITRATE, REEL_HEIGHT, REEL_WIDTH } from "@/lib/export-reel";
import { projectMapPoint, type ReelMapPlan } from "@/lib/export-reel-map";

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
    img.onerror = () => reject(new Error(`No se pudo cargar: ${url}`));
    img.src = url;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  width: number,
  height: number,
  scale: number,
  panX: number,
  panY: number,
  alpha = 1
) {
  const iw =
    "naturalWidth" in img
      ? (img as HTMLImageElement).naturalWidth || (img as HTMLImageElement).width
      : (img as HTMLCanvasElement).width;
  const ih =
    "naturalHeight" in img
      ? (img as HTMLImageElement).naturalHeight || (img as HTMLImageElement).height
      : (img as HTMLCanvasElement).height;
  if (!iw || !ih) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const base = Math.max(width / iw, height / ih) * scale;
  const dw = iw * base;
  const dh = ih * base;
  const dx = (width - dw) / 2 + panX * (dw - width) * 0.5;
  const dy = (height - dh) / 2 + panY * (dh - height) * 0.5;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
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
    ctx.fillStyle = "rgba(0,0,0,0.45)";
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
  g.addColorStop(0.68, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function paintPhotoClip(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  frameMeta: ReelFramePlan,
  t: number,
  index: number,
  width: number,
  height: number,
  map: ReelMapPlan | null,
  mapImg: HTMLImageElement | null
) {
  const zoomFrom = frameMeta.kenBurns === "in" ? 1.0 : 1.12;
  const zoomTo = frameMeta.kenBurns === "in" ? 1.1 : 1.0;
  const scale = zoomFrom + (zoomTo - zoomFrom) * easeInOut(t);
  const panX = frameMeta.kenBurns === "in" ? -0.07 + t * 0.14 : 0.07 - t * 0.14;
  const panY = index % 2 === 0 ? -0.05 + t * 0.09 : 0.05 - t * 0.09;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  if (frameMeta.layout === "mapInset" && map && mapImg) {
    // Photo top 62%, mini-map bottom strip with highlight
    const photoH = Math.round(height * 0.62);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, photoH);
    ctx.clip();
    drawCover(ctx, img, width, photoH, scale, panX, panY);
    ctx.restore();

    const mapTop = photoH;
    const mapH = height - photoH;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, mapTop, width, mapH);
    ctx.clip();
    ctx.translate(0, mapTop);
    drawCover(ctx, mapImg, width, mapH, 1.05, 0, 0);
    // Reproject roughly into the strip: use full canvas projection then scale Y
    paintMapOverlays(
      ctx,
      map,
      1,
      width,
      mapH,
      { scaleY: mapH / height, offsetY: 0 },
      true
    );
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(0, photoH - 2, width, 4);
  } else {
    drawCover(ctx, img, width, height, scale, panX, panY);
  }

  drawScrim(ctx, width, height);

  const overlayLines: { text: string; size: number; weight?: string }[] = [];
  if (frameMeta.caption) {
    overlayLines.push({ text: frameMeta.caption, size: 34, weight: "600" });
  } else if (frameMeta.placeName) {
    overlayLines.push({ text: frameMeta.placeName, size: 40, weight: "700" });
  }
  if (frameMeta.dayNote) {
    overlayLines.push({ text: frameMeta.dayNote, size: 26, weight: "500" });
  } else if (frameMeta.dayLabel && !frameMeta.caption) {
    overlayLines.push({ text: frameMeta.dayLabel, size: 26, weight: "500" });
  } else if (frameMeta.placeName && frameMeta.caption) {
    overlayLines.push({ text: frameMeta.placeName, size: 24, weight: "500" });
  }

  if (overlayLines.length > 0) {
    const y =
      frameMeta.layout === "mapInset" ? height * 0.52 : height * 0.76;
    drawSafeText(ctx, overlayLines.slice(0, 3), y, width);
  }
}

function paintMapOverlays(
  ctx: CanvasRenderingContext2D,
  map: ReelMapPlan,
  progress: number,
  width: number,
  height: number,
  transform?: { scaleY: number; offsetY: number },
  allVisible = false
) {
  const scaleY = transform?.scaleY ?? 1;
  const offsetY = transform?.offsetY ?? 0;
  const count = map.points.length;
  const visible = allVisible
    ? count
    : Math.min(count, Math.max(1, Math.ceil(progress * count)));
  const routeT = allVisible ? 1 : Math.min(1, progress * 1.15);

  const projected = map.points.map((p) => {
    const pt = projectMapPoint(
      p.lat,
      p.lng,
      map.center,
      map.zoom,
      width,
      height / scaleY,
      map.imageWidth,
      map.imageHeight
    );
    return { x: pt.x, y: pt.y * scaleY + offsetY, label: p.label, kind: p.kind };
  });

  // Route polyline up to routeT
  if (projected.length >= 2) {
    const routeCount = Math.max(
      2,
      Math.floor(1 + (projected.length - 1) * routeT)
    );
    ctx.strokeStyle = "rgba(14, 165, 164, 0.95)";
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < routeCount; i++) {
      const p = projected[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    // Partial segment
    if (routeCount < projected.length && routeT < 1) {
      const segT = routeT * (projected.length - 1) - (routeCount - 1);
      const a = projected[routeCount - 1];
      const b = projected[routeCount];
      if (a && b && segT > 0) {
        ctx.lineTo(a.x + (b.x - a.x) * segT, a.y + (b.y - a.y) * segT);
      }
    }
    ctx.stroke();
  }

  for (let i = 0; i < visible; i++) {
    const p = projected[i];
    const appear =
      allVisible || progress * count >= i + 0.15
        ? 1
        : Math.max(0, (progress * count - i) / 0.15);
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.fillStyle = p.kind === "place" ? "#f97316" : "#06b6d4";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.kind === "place" ? 14 : 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
}

function paintMapIntro(
  ctx: CanvasRenderingContext2D,
  map: ReelMapPlan,
  mapImg: HTMLImageElement,
  t: number,
  title: string,
  dateRangeLabel: string | null,
  width: number,
  height: number
) {
  const progress = easeInOut(Math.min(1, t / 0.85));
  const scale = 1.12 - easeInOut(t) * 0.1;
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, width, height);
  drawCover(ctx, mapImg, width, height, scale, 0, 0.02 * (1 - t));
  // Darken for text readability
  ctx.fillStyle = `rgba(0,0,0,${0.18 + t * 0.12})`;
  ctx.fillRect(0, 0, width, height);
  paintMapOverlays(ctx, map, progress, width, height);
  drawSafeText(
    ctx,
    [
      { text: title, size: 56, weight: "700" },
      ...(dateRangeLabel ? [{ text: dateRangeLabel, size: 28, weight: "500" }] : []),
      {
        text: `${map.points.length} puntos en el recorrido`,
        size: 24,
        weight: "500",
      },
    ],
    height * 0.18,
    width
  );
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

  // Offscreen buffers for crossfade
  const layerA = document.createElement("canvas");
  layerA.width = width;
  layerA.height = height;
  const ctxA = layerA.getContext("2d", { alpha: false });
  const layerB = document.createElement("canvas");
  layerB.width = width;
  layerB.height = height;
  const ctxB = layerB.getContext("2d", { alpha: false });
  if (!ctxA || !ctxB) throw new Error("Canvas auxiliar no disponible");

  onProgress?.({
    phase: "frames",
    current: 0,
    total: manifest.frames.length + (manifest.map?.staticUrl ? 1 : 0),
    message: "Descargando fotogramas…",
  });

  let mapPlan = manifest.map;
  let mapImg: HTMLImageElement | null = null;
  if (mapPlan?.staticUrl) {
    try {
      mapImg = await loadImage(mapPlan.staticUrl);
    } catch {
      mapPlan = null;
      mapImg = null;
    }
  }

  const images: HTMLImageElement[] = [];
  for (let i = 0; i < manifest.frames.length; i++) {
    const frame = manifest.frames[i];
    const img = await loadImage(`/api/photos/${frame.photoId}/reel-frame`);
    images.push(img);
    onProgress?.({
      phase: "frames",
      current: i + 1 + (mapImg ? 1 : 0),
      total: manifest.frames.length + (mapImg ? 1 : 0),
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

  const mapIntroSeconds = mapImg && mapPlan ? manifest.mapIntroSeconds : 0;
  const titleIntroSeconds = manifest.titleIntroSeconds;
  const outroSeconds = manifest.outroSeconds;
  const crossfade = manifest.crossfadeSeconds;
  const clipsDuration = manifest.frames.reduce((s, f) => s + f.durationSeconds, 0);
  const totalSeconds =
    mapIntroSeconds + titleIntroSeconds + clipsDuration + outroSeconds;
  const totalFramesEstimate = Math.max(1, Math.round(totalSeconds * fps));
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

  const paintTitleIntro = (t: number) => {
    const img = images[0];
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, width, height);
    if (img) {
      const scale = 1.06 + easeInOut(t) * 0.06;
      drawCover(ctx, img, width, height, scale, 0, -0.04);
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
      drawCover(ctx, img, width, height, 1.1 - easeInOut(t) * 0.04, 0, 0.03);
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

  if (mapImg && mapPlan) {
    const plan = mapPlan;
    const basemap = mapImg;
    await addSegment(
      mapIntroSeconds,
      (t) =>
        paintMapIntro(
          ctx,
          plan,
          basemap,
          t,
          manifest.title,
          manifest.dateRangeLabel,
          width,
          height
        ),
      "Mapa del viaje…"
    );
  }

  await addSegment(titleIntroSeconds, paintTitleIntro, "Título…");

  // Clips with crossfade: hold (duration - crossfade) then blend into next
  for (let i = 0; i < images.length; i++) {
    const meta = manifest.frames[i];
    const img = images[i];
    const nextImg = images[i + 1];
    const nextMeta = manifest.frames[i + 1];
    const hold = Math.max(0.35, meta.durationSeconds - (nextImg ? crossfade : 0));

    await addSegment(
      hold,
      (t) =>
        paintPhotoClip(ctx, img, meta, t * 0.85, i, width, height, mapPlan, mapImg),
      `Clip ${i + 1}/${images.length}`
    );

    if (nextImg && nextMeta) {
      const fadeFrames = Math.max(1, Math.round(crossfade * fps));
      for (let f = 0; f < fadeFrames; f++) {
        const u = fadeFrames === 1 ? 1 : f / (fadeFrames - 1);
        const tA = 0.85 + u * 0.15;
        const tB = u * 0.2;
        paintPhotoClip(ctxA, img, meta, tA, i, width, height, mapPlan, mapImg);
        paintPhotoClip(
          ctxB,
          nextImg,
          nextMeta,
          tB,
          i + 1,
          width,
          height,
          mapPlan,
          mapImg
        );
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1 - u;
        ctx.drawImage(layerA, 0, 0);
        ctx.globalAlpha = u;
        ctx.drawImage(layerB, 0, 0);
        ctx.globalAlpha = 1;
        const timestamp = frameIndex / fps;
        await videoSource.add(timestamp, 1 / fps);
        reportEncode(`Transición ${i + 1}→${i + 2}`);
        frameIndex += 1;
      }
    }
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

  if (mapImg && mapPlan) {
    paintMapIntro(
      ctx,
      mapPlan,
      mapImg,
      0.7,
      manifest.title,
      manifest.dateRangeLabel,
      width,
      height
    );
  } else {
    paintTitleIntro(0.35);
  }
  const cover = await canvasToJpegBlob(canvas);

  const mp4 = new Blob([buffer], { type: "video/mp4" });
  return { mp4, cover };
}
