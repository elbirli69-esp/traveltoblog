import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  canEncodeVideo,
} from "mediabunny";
import type {
  ReelCaptionStyle,
  ReelFramePlan,
  ReelManifest,
  ReelTransition,
} from "@/lib/export-reel";
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

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 4
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) {
      const rest = [word, ...words.slice(i + 1)].join(" ");
      let last = rest;
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1).trimEnd();
      }
      lines.push(ctx.measureText(rest).width <= maxWidth ? rest : `${last}…`);
      return lines.slice(0, maxLines);
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

/** Visual story caption — pull quote / glass card / side accent (not subtitle bars). */
function drawStoryCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: ReelCaptionStyle,
  width: number,
  height: number,
  t: number,
  meta?: string | null
) {
  const appear = Math.min(1, easeInOut(Math.max(0, (t - 0.08) / 0.35)));
  if (appear <= 0.01 || !text.trim()) return;

  ctx.save();
  ctx.globalAlpha = appear;

  if (style === "pullQuote") {
    const boxW = width * 0.82;
    const x = (width - boxW) / 2;
    const y = height * 0.58;
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.font = `700 120px Georgia, "Times New Roman", serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("“", x - 8, y - 28);

    ctx.font = `600 42px Georgia, "Times New Roman", serif`;
    const lines = wrapCanvasText(ctx, text, boxW - 24, 4);
    let cursorY = y + 70;
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 18;
    for (const line of lines) {
      ctx.fillText(line, x + 12, cursorY, boxW - 24);
      cursorY += 52;
    }
    ctx.shadowBlur = 0;
    // Accent underline
    ctx.fillStyle = "#2dd4bf";
    ctx.fillRect(x + 12, cursorY + 10, Math.min(120, boxW * 0.28), 5);
    if (meta) {
      ctx.font = `600 22px "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(meta, x + 12, cursorY + 36, boxW - 24);
    }
    ctx.restore();
    return;
  }

  if (style === "sideAccent") {
    const pad = Math.round(width * 0.08);
    const boxW = width * 0.78;
    const x = pad;
    const y = height * 0.62;
    ctx.font = `600 38px "Segoe UI", system-ui, sans-serif`;
    const lines = wrapCanvasText(ctx, text, boxW - 40, 4);
    const blockH = lines.length * 48 + (meta ? 40 : 16);
    // Accent bar
    ctx.fillStyle = "#f97316";
    ctx.fillRect(x, y, 8, blockH);
    // Soft panel
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    roundedRectPath(ctx, x + 18, y - 8, boxW, blockH + 16, 16);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let cursorY = y + 8;
    for (const line of lines) {
      ctx.fillText(line, x + 36, cursorY, boxW - 48);
      cursorY += 48;
    }
    if (meta) {
      ctx.font = `600 22px "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = "#2dd4bf";
      ctx.fillText(meta, x + 36, cursorY + 4, boxW - 48);
    }
    ctx.restore();
    return;
  }

  // glassCard
  const boxW = width * 0.86;
  const x = (width - boxW) / 2;
  ctx.font = `600 36px "Segoe UI", system-ui, sans-serif`;
  const lines = wrapCanvasText(ctx, text, boxW - 64, 4);
  const blockH = lines.length * 46 + (meta ? 44 : 28);
  const y = height * 0.68 - blockH / 2;
  ctx.fillStyle = "rgba(12, 18, 32, 0.62)";
  roundedRectPath(ctx, x, y, boxW, blockH, 28);
  ctx.fill();
  // Top accent
  ctx.fillStyle = "#2dd4bf";
  roundedRectPath(ctx, x + 28, y + 14, 64, 6, 3);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let cursorY = y + 36;
  for (const line of lines) {
    ctx.fillText(line, x + 32, cursorY, boxW - 64);
    cursorY += 46;
  }
  if (meta) {
    ctx.font = `600 22px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(meta, x + 32, cursorY + 2, boxW - 64);
  }
  ctx.restore();
}

function drawMetaChip(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  y: number
) {
  if (!text.trim()) return;
  ctx.save();
  ctx.font = `600 22px "Segoe UI", system-ui, sans-serif`;
  const tw = Math.min(ctx.measureText(text).width + 36, width * 0.7);
  const x = (width - tw) / 2;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  roundedRectPath(ctx, x, y - 18, tw, 36, 18);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, y, tw - 20);
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

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawPlacePinBadge(
  ctx: CanvasRenderingContext2D,
  placeName: string,
  x: number,
  y: number,
  pulse = 1
) {
  ctx.save();
  const label = placeName.length > 28 ? `${placeName.slice(0, 27)}…` : placeName;
  ctx.font = `700 28px "Segoe UI", system-ui, sans-serif`;
  const tw = Math.min(ctx.measureText(label).width + 56, 520);
  const th = 52;
  const r = 18;
  // Drop pin head
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.arc(x, y - 18 * pulse, 14 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 4 * pulse);
  ctx.lineTo(x - 9 * pulse, y + 16 * pulse);
  ctx.lineTo(x + 9 * pulse, y + 16 * pulse);
  ctx.closePath();
  ctx.fill();
  // Label chip
  const bx = x - tw / 2;
  const by = y + 28;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundedRectPath(ctx, bx, by, tw, th, r);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, by + th / 2, tw - 24);
  ctx.restore();
}

function paintMapOverlays(
  ctx: CanvasRenderingContext2D,
  map: ReelMapPlan,
  progress: number,
  width: number,
  height: number,
  transform?: { scaleY: number; offsetY: number },
  allVisible = false,
  highlight?: { lat: number; lng: number; label?: string | null } | null
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
    return {
      x: pt.x,
      y: pt.y * scaleY + offsetY,
      label: p.label,
      kind: p.kind,
      lat: p.lat,
      lng: p.lng,
    };
  });

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

  let highlightIdx = -1;
  if (highlight) {
    let best = Infinity;
    for (let i = 0; i < projected.length; i++) {
      const p = projected[i]!;
      const d =
        Math.hypot(p.lat - highlight.lat, p.lng - highlight.lng) * 111_000;
      if (d < best) {
        best = d;
        highlightIdx = i;
      }
    }
    if (best > 2500) highlightIdx = -1;
  }

  for (let i = 0; i < visible; i++) {
    const p = projected[i]!;
    const appear =
      allVisible || progress * count >= i + 0.15
        ? 1
        : Math.max(0, (progress * count - i) / 0.15);
    const isHi = i === highlightIdx;
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.fillStyle = isHi ? "#f97316" : p.kind === "place" ? "#f97316" : "#06b6d4";
    ctx.beginPath();
    ctx.arc(p.x, p.y, isHi ? 18 : p.kind === "place" ? 14 : 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = isHi ? 4 : 3;
    ctx.stroke();
    if (isHi && (highlight?.label || p.label)) {
      const label = highlight?.label || p.label || "";
      ctx.font = `700 22px "Segoe UI", system-ui, sans-serif`;
      const tw = Math.min(ctx.measureText(label).width + 28, width * 0.7);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(p.x - tw / 2, p.y + 22, tw, 36);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, p.x, p.y + 40, tw - 12);
    }
    ctx.restore();
  }

  // If no nearby map point, still drop a pin at projected highlight coords
  if (highlight && highlightIdx < 0) {
    const pt = projectMapPoint(
      highlight.lat,
      highlight.lng,
      map.center,
      map.zoom,
      width,
      height / scaleY,
      map.imageWidth,
      map.imageHeight
    );
    const x = pt.x;
    const y = pt.y * scaleY + offsetY;
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.stroke();
    if (highlight.label) {
      ctx.font = `700 22px "Segoe UI", system-ui, sans-serif`;
      const tw = Math.min(ctx.measureText(highlight.label).width + 28, width * 0.7);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - tw / 2, y + 22, tw, 36);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(highlight.label, x, y + 40, tw - 12);
    }
  }
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
  const treatment = frameMeta.treatment ?? "clean";
  const highlight =
    frameMeta.latitude != null && frameMeta.longitude != null
      ? {
          lat: frameMeta.latitude,
          lng: frameMeta.longitude,
          label: frameMeta.placeName,
        }
      : null;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  if (treatment === "mapFocus" && map && mapImg) {
    const pulse = 1 + Math.sin(t * Math.PI * 2) * 0.06;
    drawCover(ctx, mapImg, width, height, 1.08 + t * 0.04, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, width, height);
    paintMapOverlays(ctx, map, 1, width, height, undefined, true, highlight);
    // Small photo inset
    const insetW = Math.round(width * 0.38);
    const insetH = Math.round(height * 0.22);
    const insetX = width - insetW - 36;
    const insetY = height - insetH - 120;
    ctx.save();
    roundedRectPath(ctx, insetX, insetY, insetW, insetH, 18);
    ctx.clip();
    drawCover(ctx, img, insetW, insetH, 1.05, 0, 0);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 4;
    roundedRectPath(ctx, insetX, insetY, insetW, insetH, 18);
    ctx.stroke();
    if (frameMeta.placeName) {
      drawPlacePinBadge(ctx, frameMeta.placeName, width / 2, height * 0.22, pulse);
    }
    if (frameMeta.dayLabel) {
      drawSafeText(
        ctx,
        [{ text: frameMeta.dayLabel, size: 24, weight: "500" }],
        height * 0.34,
        width
      );
    }
    return;
  }

  if (treatment === "mapInset" && map && mapImg) {
    const photoH = Math.round(height * 0.58);
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
    paintMapOverlays(
      ctx,
      map,
      1,
      width,
      mapH,
      { scaleY: mapH / height, offsetY: 0 },
      true,
      highlight
    );
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(0, photoH - 2, width, 4);
    drawScrim(ctx, width, photoH);
    if (frameMeta.caption) {
      drawStoryCaption(
        ctx,
        frameMeta.caption,
        frameMeta.captionStyle ?? "glassCard",
        width,
        photoH + mapH * 0.15,
        t,
        frameMeta.placeName
      );
    } else if (frameMeta.placeName) {
      drawPlacePinBadge(ctx, frameMeta.placeName, width / 2, photoH * 0.78, 1);
    } else if (frameMeta.dayLabel) {
      drawMetaChip(ctx, frameMeta.dayLabel, width, photoH * 0.82);
    }
    return;
  }

  drawCover(ctx, img, width, height, scale, panX, panY);
  drawScrim(ctx, width, height);

  if (treatment === "placePin" && frameMeta.placeName) {
    const pulse = 1 + Math.sin(easeInOut(t) * Math.PI) * 0.08;
    drawPlacePinBadge(ctx, frameMeta.placeName, width / 2, height * 0.7, pulse);
    if (frameMeta.caption) {
      drawStoryCaption(
        ctx,
        frameMeta.caption,
        "sideAccent",
        width,
        height,
        t,
        frameMeta.dayLabel
      );
    } else if (frameMeta.dayNote) {
      drawStoryCaption(ctx, frameMeta.dayNote, "sideAccent", width, height, t, null);
    }
    return;
  }

  if (treatment === "story") {
    const body = frameMeta.caption || frameMeta.dayNote;
    if (body) {
      drawStoryCaption(
        ctx,
        body,
        frameMeta.captionStyle ?? "pullQuote",
        width,
        height,
        t,
        frameMeta.placeName || frameMeta.dayLabel
      );
    } else if (frameMeta.placeName) {
      drawPlacePinBadge(ctx, frameMeta.placeName, width / 2, height * 0.72, 1);
    }
    return;
  }

  // clean — minimal chrome
  if (frameMeta.dayNote) {
    drawStoryCaption(ctx, frameMeta.dayNote, "sideAccent", width, height, t, null);
  } else if (frameMeta.dayLabel && index % 2 === 0) {
    drawMetaChip(ctx, frameMeta.dayLabel, width, height * 0.84);
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

function blendTransition(
  ctx: CanvasRenderingContext2D,
  layerA: HTMLCanvasElement,
  layerB: HTMLCanvasElement,
  u: number,
  type: ReelTransition,
  width: number,
  height: number
) {
  const e = easeInOut(u);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  if (type === "slideLeft") {
    ctx.drawImage(layerA, -e * width, 0);
    ctx.drawImage(layerB, (1 - e) * width, 0);
    return;
  }
  if (type === "slideUp") {
    ctx.drawImage(layerA, 0, -e * height);
    ctx.drawImage(layerB, 0, (1 - e) * height);
    return;
  }
  if (type === "zoomSoft") {
    ctx.save();
    ctx.globalAlpha = 1 - e;
    const sA = 1 + e * 0.08;
    ctx.translate(width / 2, height / 2);
    ctx.scale(sA, sA);
    ctx.drawImage(layerA, -width / 2, -height / 2);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = e;
    const sB = 1.06 - e * 0.06;
    ctx.translate(width / 2, height / 2);
    ctx.scale(sB, sB);
    ctx.drawImage(layerB, -width / 2, -height / 2);
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }

  // fade
  ctx.globalAlpha = 1 - e;
  ctx.drawImage(layerA, 0, 0);
  ctx.globalAlpha = e;
  ctx.drawImage(layerB, 0, 0);
  ctx.globalAlpha = 1;
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
      const transition = meta.transitionOut ?? "fade";
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
        blendTransition(ctx, layerA, layerB, u, transition, width, height);
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
