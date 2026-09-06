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
import type { ReelLook } from "@/lib/export-directives";
import { REEL_BITRATE, REEL_HEIGHT, REEL_WIDTH, truncateAtWordBoundary } from "@/lib/export-reel";
import { projectMapPoint, type ReelMapPlan,
  buildReelPlaceBasemapPath,
  REEL_PLACE_FOCUS_ZOOM,
} from "@/lib/export-reel-map";
import { gpsTrailMapColor } from "@/lib/gps-track-map";

export type ReelEncodeProgress = {
  phase: "frames" | "encode" | "cover" | "zip";
  current: number;
  total: number;
  message: string;
};

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Map→photo reveal inside mapFocus/mapInset:
 * early = map-led, mid = expand photo, late = photo-led.
 */
function mapToPhotoReveal(t: number): number {
  if (t <= 0.36) return 0;
  if (t >= 0.78) return 1;
  return easeInOut((t - 0.36) / 0.42);
}

function kenBurnsZoom(direction: "in" | "out", look?: ReelLook): { from: number; to: number; pan: number } {
  // Memories: barely-there drift (iPhone Recuerdos). Default: stronger travel-reel push.
  const max = look === "memories" ? 1.08 : 1.24;
  const pan = look === "memories" ? 0.04 : 0.1;
  if (direction === "in") return { from: 1.0, to: max, pan };
  return { from: max, to: 1.0, pan };
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

/** Ellipsize to width, dropping whole words first (never mid-word when avoidable). */
function ellipsizeCanvasLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return "";
  if (words.length > 1) {
    let kept = words.slice();
    while (kept.length > 1) {
      kept.pop();
      const candidate = `${kept.join(" ")}…`;
      if (ctx.measureText(candidate).width <= maxWidth) return candidate;
    }
  }
  // Single overlong token: character trim is the only option left.
  let hard = words[0]!;
  while (hard.length > 1 && ctx.measureText(`${hard}…`).width > maxWidth) {
    hard = hard.slice(0, -1);
  }
  return `${hard}…`;
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
      lines.push(ellipsizeCanvasLine(ctx, rest, maxWidth));
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
  // Hold timeline 0→1: fade in quickly, stay readable most of the hold, soft out at end.
  let appear = 1;
  if (t < 0.08) appear = easeInOut(Math.max(0, t / 0.08));
  else if (t > 0.88) appear = easeInOut(Math.max(0, (1 - t) / 0.12));
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

    ctx.font = `600 48px Georgia, "Times New Roman", serif`;
    const lines = wrapCanvasText(ctx, text, boxW - 24, 2);
    let cursorY = y + 70;
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 18;
    for (const line of lines) {
      ctx.fillText(line, x + 12, cursorY, boxW - 24);
      cursorY += 58;
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
    ctx.font = `600 44px "Segoe UI", system-ui, sans-serif`;
    const lines = wrapCanvasText(ctx, text, boxW - 40, 2);
    const blockH = lines.length * 54 + (meta ? 40 : 16);
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
      cursorY += 54;
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
  ctx.font = `600 42px "Segoe UI", system-ui, sans-serif`;
  const lines = wrapCanvasText(ctx, text, boxW - 64, 2);
  const blockH = lines.length * 52 + (meta ? 44 : 28);
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
    cursorY += 52;
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
  const label = truncateAtWordBoundary(placeName, 28);
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


/** Canvas plane silhouette — emoji fonts are unreliable in OffscreenCanvas/encode. */
function drawPlaneIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleRad: number,
  size: number,
  fill = "#f8fafc"
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRad);
  ctx.scale(size / 28, size / 28);
  ctx.fillStyle = fill;
  ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  // Fuselage
  ctx.moveTo(14, 0);
  ctx.lineTo(-10, 3.5);
  ctx.lineTo(-10, -3.5);
  ctx.closePath();
  // Wings
  ctx.moveTo(2, 0);
  ctx.lineTo(-4, 12);
  ctx.lineTo(-7, 12);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-7, -12);
  ctx.lineTo(-4, -12);
  ctx.closePath();
  // Tail
  ctx.moveTo(-8, 0);
  ctx.lineTo(-13, 5);
  ctx.lineTo(-11, 0);
  ctx.lineTo(-13, -5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function flightPathAngle(
  coords: Array<[number, number]>,
  t: number,
  project: (lat: number, lng: number) => { x: number; y: number }
): { x: number; y: number; angle: number } {
  const n = coords.length - 1;
  const f = Math.max(0, Math.min(1, t)) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const local = f - i;
  const a = coords[i]!;
  const b = coords[i + 1]!;
  const pa = project(a[0], a[1]);
  const pb = project(b[0], b[1]);
  return {
    x: pa.x + (pb.x - pa.x) * local,
    y: pa.y + (pb.y - pa.y) * local,
    angle: Math.atan2(pb.y - pa.y, pb.x - pa.x),
  };
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
  const trailT = allVisible ? 1 : Math.min(1, easeInOut(progress));

  const project = (lat: number, lng: number) => {
    const pt = projectMapPoint(
      lat,
      lng,
      map.center,
      map.zoom,
      width,
      height / scaleY,
      map.imageWidth,
      map.imageHeight
    );
    return { x: pt.x, y: pt.y * scaleY + offsetY };
  };

  // Animated GPS trails (destination only — skipped on flight overview).
  const trails = map.overview === "flights" ? [] : map.gpsTrails ?? [];
  if (trails.length > 0) {
    ctx.save();
    ctx.strokeStyle = gpsTrailMapColor();
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 10]);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.9;
    for (const trail of trails) {
      if (trail.coords.length < 2) continue;
      const totalSeg = trail.coords.length - 1;
      const drawSeg = Math.max(1, Math.floor(totalSeg * trailT));
      ctx.beginPath();
      for (let i = 0; i <= drawSeg; i++) {
        const c = trail.coords[i]!;
        const p = project(c[0], c[1]);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      if (drawSeg < totalSeg && trailT < 1) {
        const segT = trailT * totalSeg - drawSeg;
        const a = trail.coords[drawSeg]!;
        const b = trail.coords[drawSeg + 1]!;
        const pa = project(a[0], a[1]);
        const pb = project(b[0], b[1]);
        ctx.lineTo(pa.x + (pb.x - pa.x) * segT, pa.y + (pb.y - pa.y) * segT);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  const projected = map.points.map((p) => {
    const pt = project(p.lat, p.lng);
    return {
      x: pt.x,
      y: pt.y,
      label: p.label,
      kind: p.kind,
      lat: p.lat,
      lng: p.lng,
    };
  });

  // Flight arcs (Lugares trayecto) — dashed indigo + moving plane icon.
  const flightLegs = map.flightLegs ?? [];
  if (flightLegs.length > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(129, 140, 248, 0.95)";
    ctx.lineWidth = 6;
    ctx.setLineDash([16, 12]);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.95;
    for (const leg of flightLegs) {
      if (leg.coords.length < 2) continue;
      const totalSeg = leg.coords.length - 1;
      const drawSeg = Math.max(1, Math.floor(totalSeg * routeT));
      ctx.beginPath();
      for (let i = 0; i <= drawSeg; i++) {
        const c = leg.coords[i]!;
        const p = project(c[0], c[1]);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      if (drawSeg < totalSeg && routeT < 1) {
        const segT = routeT * totalSeg - drawSeg;
        const a = leg.coords[drawSeg]!;
        const b = leg.coords[drawSeg + 1]!;
        const pa = project(a[0], a[1]);
        const pb = project(b[0], b[1]);
        ctx.lineTo(pa.x + (pb.x - pa.x) * segT, pa.y + (pb.y - pa.y) * segT);
      }
      ctx.stroke();

      // Moving plane along the drawn portion of the arc.
      const planeT = Math.max(0.02, Math.min(1, routeT));
      const plane = flightPathAngle(leg.coords, planeT, project);
      drawPlaneIcon(ctx, plane.x, plane.y, plane.angle, allVisible ? 34 : 38, "#f8fafc");
    }
    ctx.restore();
  } else if (projected.length >= 2) {
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
    if (p.kind === "flight") {
      // Airport marker + plane icon (emoji fonts often fail while encoding).
      ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, isHi ? 22 : 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = isHi ? 3 : 2;
      ctx.stroke();
      const inbound = Boolean(p.label?.includes("🛬") || p.label?.toLowerCase().includes("vuelta"));
      drawPlaneIcon(
        ctx,
        p.x,
        p.y,
        inbound ? Math.PI * 0.85 : -Math.PI * 0.15,
        isHi ? 30 : 26,
        inbound ? "#86efac" : "#fde68a"
      );
      if (p.label) {
        const label = p.label.replace(/^[✈️🛬]\s*/, "");
        ctx.font = `700 20px "Segoe UI", system-ui, sans-serif`;
        const tw = Math.min(ctx.measureText(label).width + 24, width * 0.7);
        ctx.fillStyle = "rgba(0,0,0,0.62)";
        ctx.fillRect(p.x - tw / 2, p.y + 24, tw, 32);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, p.x, p.y + 40, tw - 10);
      }
    } else {
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
    }
    ctx.restore();
  }

  // If no nearby map point, still drop a pin at projected highlight coords
  if (highlight && highlightIdx < 0) {
    const pt = project(highlight.lat, highlight.lng);
    const x = pt.x;
    const y = pt.y;
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


function drawPlaceSticker(
  ctx: CanvasRenderingContext2D,
  sticker: string,
  width: number,
  height: number,
  t: number
) {
  const appear = Math.min(1, easeInOut(Math.max(0, (t - 0.05) / 0.25)));
  if (appear <= 0.01) return;
  const bounce = 1 + Math.sin(easeInOut(Math.min(1, t * 1.4)) * Math.PI) * 0.12;
  ctx.save();
  ctx.globalAlpha = appear;
  ctx.font = `${Math.round(72 * bounce)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 12;
  ctx.fillText(sticker, width - 48, height * 0.14);
  ctx.restore();
}

function paintChapterCard(
  ctx: CanvasRenderingContext2D,
  _img: HTMLImageElement,
  frameMeta: ReelFramePlan,
  t: number,
  width: number,
  height: number
) {
  // Solid chapter card — never reuse the next clip's still (that looked like a loop).
  const g = ctx.createLinearGradient(0, 0, width * 0.2, height);
  g.addColorStop(0, "#0b1020");
  g.addColorStop(0.55, "#111827");
  g.addColorStop(1, "#0f172a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(45,212,191,0.12)";
  ctx.fillRect(0, height * 0.42, width, 3);
  const label =
    frameMeta.dayIndex != null
      ? `Día ${frameMeta.dayIndex}`
      : frameMeta.dayLabel || "Nuevo día";
  // Readable for almost the whole chapter card.
  const appear =
    t < 0.1
      ? easeInOut(t / 0.1)
      : t > 0.9
        ? easeInOut((1 - t) / 0.1)
        : 1;
  ctx.save();
  ctx.globalAlpha = appear;
  drawSafeText(
    ctx,
    [
      { text: label, size: 72, weight: "700" },
      ...(frameMeta.dayLabel && frameMeta.dayIndex != null
        ? [{ text: frameMeta.dayLabel, size: 28, weight: "500" }]
        : []),
    ],
    height * 0.45,
    width
  );
  ctx.restore();
}

function paintHookClip(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  t: number,
  width: number,
  height: number
) {
  // Hook also begins on the full letterboxed still, then eases in.
  const scale = 1.0 + easeInOut(t) * 0.18;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  drawCover(ctx, img, width, height, scale, 0, -0.02 * easeInOut(t));
  // Soft edge vignette only — no title chrome on the hook.
  ctx.fillStyle = `rgba(0,0,0,${0.08 + t * 0.06})`;
  ctx.fillRect(0, 0, width, height * 0.18);
  ctx.fillRect(0, height * 0.82, width, height * 0.18);
}

type PlaceBasemapEntry = { img: HTMLImageElement; zoom: number };

function placeBasemapKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function focusedPlaceMapPlan(
  map: ReelMapPlan,
  highlight: { lat: number; lng: number; label?: string | null },
  zoom: number
): ReelMapPlan {
  return {
    ...map,
    center: { lat: highlight.lat, lng: highlight.lng },
    zoom,
    gpsTrails: [],
    flightLegs: [],
    overview: "route",
    points: map.points.filter((p) => {
      const dlat = Math.abs(p.lat - highlight.lat);
      const dlng = Math.abs(p.lng - highlight.lng);
      return dlat < 0.03 && dlng < 0.03;
    }),
  };
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
  mapImg: HTMLImageElement | null,
  showChrome = true,
  placeMaps?: Map<string, PlaceBasemapEntry>,
  look?: ReelLook
) {
  if (frameMeta.role === "hook") {
    paintHookClip(ctx, img, t, width, height);
    return;
  }
  if (frameMeta.role === "chapter") {
    paintChapterCard(ctx, img, frameMeta, t, width, height);
    return;
  }

  // Motion-only pass used during crossfade inbound so captions don't peek then restart.
  if (!showChrome) {
    // Full photo at the contain end: zoom-in starts at 1.0, zoom-out ends at 1.0 (letterboxed stills).
    const kb = kenBurnsZoom(frameMeta.kenBurns === "in" ? "in" : "out", look);
    const scale = kb.from + (kb.to - kb.from) * easeInOut(t);
    const panAmt = frameMeta.kenBurns === "in" ? t : 1 - t; // 0 when full photo is shown
    const panX = (index % 2 === 0 ? -1 : 1) * kb.pan * panAmt;
    const panY = (index % 2 === 0 ? -1 : 1) * kb.pan * 0.6 * panAmt;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    drawCover(ctx, img, width, height, scale, panX, panY);
    drawScrim(ctx, width, height);
    return;
  }

  // Full photo at the contain end: zoom-in starts at 1.0, zoom-out ends at 1.0 (letterboxed stills).
  const kb = kenBurnsZoom(frameMeta.kenBurns === "in" ? "in" : "out", look);
  const scale = kb.from + (kb.to - kb.from) * easeInOut(t);
  const panAmt = frameMeta.kenBurns === "in" ? t : 1 - t; // 0 when full photo is shown
  const panX = (index % 2 === 0 ? -1 : 1) * kb.pan * panAmt;
  const panY = (index % 2 === 0 ? -1 : 1) * kb.pan * 0.6 * panAmt;
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

  if (treatment === "mapFocus" && map && mapImg && highlight) {
    // Prefer a street-level basemap centered on the marked place (not the whole-trip overview).
    const placeEntry = placeMaps?.get(placeBasemapKey(highlight.lat, highlight.lng));
    const focusImg = placeEntry?.img ?? mapImg;
    const focusZoom = placeEntry?.zoom ?? Math.max(map.zoom, REEL_PLACE_FOCUS_ZOOM);
    const focusMap = placeEntry
      ? focusedPlaceMapPlan(map, highlight, focusZoom)
      : map;
    const pin = projectMapPoint(
      highlight.lat,
      highlight.lng,
      focusMap.center,
      focusMap.zoom,
      width,
      height,
      focusMap.imageWidth,
      focusMap.imageHeight
    );
    const reveal = mapToPhotoReveal(t);
    // Mild canvas zoom — geographic zoom already comes from the place basemap.
    const mapT = Math.min(1, t / 0.72);
    const zoom = placeEntry ? 1.0 + easeInOut(mapT) * 0.08 : 1.08 + easeInOut(mapT) * 0.5;
    const panTowardX = ((width / 2 - pin.x) / width) * easeInOut(mapT) * (placeEntry ? 0.35 : 1.35);
    const panTowardY = ((height / 2 - pin.y) / height) * easeInOut(mapT) * (placeEntry ? 0.35 : 1.35);
    // Map layer fades as photo expands so the handoff isn't a hard cut.
    ctx.save();
    ctx.globalAlpha = 1 - reveal * 0.92;
    drawCover(ctx, focusImg, width, height, zoom, panTowardX, panTowardY);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, width, height);
    paintMapOverlays(ctx, focusMap, 1, width, height, undefined, true, highlight);
    ctx.restore();

    const insetW0 = Math.round(width * 0.38);
    const insetH0 = Math.round(height * 0.22);
    const insetX0 = width - insetW0 - 36;
    const insetY0 = height - insetH0 - 120;
    const photoW = Math.round(lerp(insetW0, width, reveal));
    const photoH = Math.round(lerp(insetH0, height, reveal));
    const photoX = Math.round(lerp(insetX0, 0, reveal));
    const photoY = Math.round(lerp(insetY0, 0, reveal));
    const radius = Math.round(lerp(18, 0, reveal));
    ctx.save();
    roundedRectPath(ctx, photoX, photoY, photoW, photoH, radius);
    ctx.clip();
    drawCover(ctx, img, photoW, photoH, 1.0 + reveal * 0.08, 0, 0);
    ctx.restore();
    if (reveal < 0.92) {
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - reveal)})`;
      ctx.lineWidth = 4;
      roundedRectPath(ctx, photoX, photoY, photoW, photoH, Math.max(2, radius));
      ctx.stroke();
    }
    if (reveal > 0.55) {
      drawScrim(ctx, width, height);
    }
    if (frameMeta.placeName && reveal < 0.85) {
      const pulse = 1 + Math.sin(t * Math.PI * 2) * 0.06;
      drawPlacePinBadge(ctx, frameMeta.placeName, width / 2, height * 0.2, pulse);
    }
    if (frameMeta.sticker && reveal > 0.4) {
      drawPlaceSticker(ctx, frameMeta.sticker, width, height, t);
    }
    if (showChrome && reveal > 0.62 && frameMeta.caption) {
      drawStoryCaption(
        ctx,
        frameMeta.caption,
        frameMeta.captionStyle ?? "glassCard",
        width,
        height,
        Math.max(0, (t - 0.62) / 0.38),
        frameMeta.placeName
      );
    }
    return;
  }

  if (treatment === "mapFocus" && map && mapImg) {
    const reveal = mapToPhotoReveal(t);
    const pulse = 1 + Math.sin(t * Math.PI * 2) * 0.06;
    ctx.save();
    ctx.globalAlpha = 1 - reveal * 0.92;
    drawCover(ctx, mapImg, width, height, 1.08 + Math.min(1, t / 0.72) * 0.04, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, width, height);
    paintMapOverlays(ctx, map, 1, width, height, undefined, true, highlight);
    ctx.restore();
    const insetW0 = Math.round(width * 0.38);
    const insetH0 = Math.round(height * 0.22);
    const insetX0 = width - insetW0 - 36;
    const insetY0 = height - insetH0 - 120;
    const photoW = Math.round(lerp(insetW0, width, reveal));
    const photoH = Math.round(lerp(insetH0, height, reveal));
    const photoX = Math.round(lerp(insetX0, 0, reveal));
    const photoY = Math.round(lerp(insetY0, 0, reveal));
    const radius = Math.round(lerp(18, 0, reveal));
    ctx.save();
    roundedRectPath(ctx, photoX, photoY, photoW, photoH, radius);
    ctx.clip();
    drawCover(ctx, img, photoW, photoH, 1.0 + reveal * 0.08, 0, 0);
    ctx.restore();
    if (reveal < 0.92) {
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - reveal)})`;
      ctx.lineWidth = 4;
      roundedRectPath(ctx, photoX, photoY, photoW, photoH, Math.max(2, radius));
      ctx.stroke();
    }
    if (reveal > 0.55) drawScrim(ctx, width, height);
    if (frameMeta.placeName && reveal < 0.85) {
      drawPlacePinBadge(ctx, frameMeta.placeName, width / 2, height * 0.22, pulse);
    }
    if (frameMeta.sticker && reveal > 0.4) {
      drawPlaceSticker(ctx, frameMeta.sticker, width, height, t);
    }
    if (showChrome && reveal > 0.62 && frameMeta.caption) {
      drawStoryCaption(
        ctx,
        frameMeta.caption,
        frameMeta.captionStyle ?? "glassCard",
        width,
        height,
        Math.max(0, (t - 0.62) / 0.38),
        frameMeta.placeName
      );
    }
    return;
  }

  if (treatment === "mapInset" && map && mapImg) {
    // Start map-heavier, end photo-heavier so both get readable time.
    const photoShare = lerp(0.42, 0.72, mapToPhotoReveal(t));
    const photoH = Math.round(height * photoShare);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, photoH);
    ctx.clip();
    drawCover(ctx, img, width, photoH, scale, panX, panY);
    ctx.restore();

    const placeEntry = highlight
      ? placeMaps?.get(placeBasemapKey(highlight.lat, highlight.lng))
      : undefined;
    const insetMapImg = placeEntry?.img ?? mapImg;
    const insetMap =
      placeEntry && highlight
        ? focusedPlaceMapPlan(map, highlight, placeEntry.zoom)
        : map;

    const mapTop = photoH;
    const mapH = height - photoH;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, mapTop, width, mapH);
    ctx.clip();
    ctx.translate(0, mapTop);
    drawCover(ctx, insetMapImg, width, mapH, 1.05, 0, 0);
    paintMapOverlays(
      ctx,
      insetMap,
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
    if (frameMeta.sticker) {
      drawPlaceSticker(ctx, frameMeta.sticker, width, photoH, t);
    }
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
  if (frameMeta.sticker) {
    drawPlaceSticker(ctx, frameMeta.sticker, width, height, t);
  }

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
  } else if (frameMeta.dayLabel && frameMeta.showDayChip) {
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
  height: number,
  look?: ReelLook
) {
  const memories = look === "memories";
  const progress = easeInOut(Math.min(1, t / (memories ? 0.92 : 0.85)));
  const scale = memories
    ? 1.06 - easeInOut(t) * 0.04
    : 1.12 - easeInOut(t) * 0.1;
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, width, height);
  drawCover(ctx, mapImg, width, height, scale, 0, 0.02 * (1 - t));
  ctx.fillStyle = `rgba(0,0,0,${(memories ? 0.22 : 0.18) + t * (memories ? 0.1 : 0.12)})`;
  ctx.fillRect(0, 0, width, height);
  paintMapOverlays(ctx, map, progress, width, height, undefined, true);
  const subtitle = memories
    ? dateRangeLabel
      ? dateRangeLabel
      : "Recuerdos del viaje"
    : map.overview === "flights"
      ? map.flightLegs.length > 1
        ? "Ida y vuelta en el mapa"
        : "Trayecto de vuelo"
      : `${map.points.length} puntos en el recorrido`;
  drawSafeText(
    ctx,
    [
      ...(memories
        ? [{ text: "Recuerdos", size: 28, weight: "600" as const }]
        : []),
      { text: title, size: memories ? 64 : 56, weight: "700" },
      ...(dateRangeLabel && !memories
        ? [{ text: dateRangeLabel, size: 28, weight: "500" }]
        : []),
      { text: subtitle, size: memories ? 26 : 24, weight: "500" },
    ],
    height * (memories ? 0.2 : 0.18),
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

  const placeCoords = new Map<string, { lat: number; lng: number }>();
  for (const frame of manifest.frames) {
    if (
      (frame.treatment === "mapFocus" || frame.treatment === "mapInset") &&
      frame.latitude != null &&
      frame.longitude != null
    ) {
      placeCoords.set(placeBasemapKey(frame.latitude, frame.longitude), {
        lat: frame.latitude,
        lng: frame.longitude,
      });
    }
  }
  const placeCoordList = [...placeCoords.values()];

  onProgress?.({
    phase: "frames",
    current: 0,
    total:
      manifest.frames.length +
      (manifest.map?.staticUrl ? 1 : 0) +
      placeCoordList.length,
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
  const imageByPhotoId = new Map<string, HTMLImageElement>();
  for (let i = 0; i < manifest.frames.length; i++) {
    const frame = manifest.frames[i]!;
    let img = imageByPhotoId.get(frame.photoId);
    if (!img) {
      img = await loadImage(`/api/photos/${frame.photoId}/reel-frame`);
      imageByPhotoId.set(frame.photoId, img);
    }
    images.push(img);
    onProgress?.({
      phase: "frames",
      current: i + 1 + (mapImg ? 1 : 0),
      total: manifest.frames.length + (mapImg ? 1 : 0) + placeCoordList.length,
      message: `Fotograma ${i + 1}/${manifest.frames.length}`,
    });
  }

  // Street-level basemaps centered on each marked place (mapFocus / mapInset).
  const placeMaps = new Map<string, PlaceBasemapEntry>();
  for (let pi = 0; pi < placeCoordList.length; pi++) {
    const { lat, lng } = placeCoordList[pi]!;
    const key = placeBasemapKey(lat, lng);
    try {
      const zoom = REEL_PLACE_FOCUS_ZOOM;
      const img = await loadImage(buildReelPlaceBasemapPath(lat, lng, zoom));
      placeMaps.set(key, { img, zoom });
    } catch {
      // Fall back to trip overview map in paintPhotoClip.
    }
    onProgress?.({
      phase: "frames",
      current: manifest.frames.length + (mapImg ? 1 : 0) + pi + 1,
      total: manifest.frames.length + (mapImg ? 1 : 0) + placeCoordList.length,
      message: `Mapa del lugar ${pi + 1}/${placeCoordList.length}`,
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
  const look = manifest.look === "memories" ? "memories" : "default";

  const hookIndices: number[] = [];
  const bodyIndices: number[] = [];
  for (let i = 0; i < manifest.frames.length; i++) {
    if (manifest.frames[i]!.role === "hook") hookIndices.push(i);
    else bodyIndices.push(i);
  }
  const clipsDuration = manifest.frames.reduce(
    (s, f) => s + f.durationSeconds,
    0
  );
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
    const coverId = manifest.coverPhotoId;
    const img =
      (coverId ? imageByPhotoId.get(coverId) : null) ??
      images[hookIndices[0] ?? bodyIndices[0] ?? 0];
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
    const coverId = manifest.coverPhotoId;
    const img =
      (coverId ? imageByPhotoId.get(coverId) : null) ??
      images[images.length - 1] ??
      images[0];
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, width, height);
    if (img) {
      drawCover(ctx, img, width, height, 1.12 - easeInOut(t) * 0.05, 0, 0.02);
    }
    drawScrim(ctx, width, height);
    const people =
      manifest.participants.length > 0
        ? manifest.participants.join(" · ")
        : "TravelToBlog";
    const cta = manifest.ctaLine || `Comenta tu momento favorito de ${manifest.title}`;
    const appear = easeInOut(Math.min(1, t / 0.35));
    ctx.save();
    ctx.globalAlpha = appear;
    drawSafeText(
      ctx,
      [
        { text: cta, size: 44, weight: "700" },
        { text: people, size: 26, weight: "500" },
        { text: "TravelToBlog", size: 22, weight: "600" },
      ],
      height * 0.42,
      width
    );
    ctx.restore();
  };

  const addSegment = async (
    seconds: number,
    paint: (localT: number) => void,
    label: string
  ) => {
    // 0s must paint 0 frames (Math.max(1,…) caused a 1-frame title flash).
    if (seconds <= 0) return;
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

  // 1) Hook first (~1s best still) — before map/title.
  for (const hi of hookIndices) {
    const meta = manifest.frames[hi]!;
    const img = images[hi]!;
    await addSegment(
      meta.durationSeconds,
      (t) => paintPhotoClip(ctx, img, meta, t, hi, width, height, mapPlan, mapImg, true, placeMaps, look),
      "Gancho…"
    );
  }

  // 2) Map with animated GPS trail
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
          height,
          look
        ),
      "Mapa del viaje…"
    );
  }

  // 3) Short title flash
  await addSegment(titleIntroSeconds, paintTitleIntro, "Título…");

  // 4) Chapters + clips with transitions
  for (let bi = 0; bi < bodyIndices.length; bi++) {
    const i = bodyIndices[bi]!;
    const meta = manifest.frames[i]!;
    const img = images[i]!;
    const nextIdx = bodyIndices[bi + 1];
    const nextImg = nextIdx != null ? images[nextIdx] : undefined;
    const nextMeta = nextIdx != null ? manifest.frames[nextIdx] : undefined;
    // Floor so a scaled-down clip still shows before the ~0.4 s transition.
    // Map treatments need a longer on-screen hold for the map→photo reveal.
    const isMapTx =
      meta.treatment === "mapFocus" || meta.treatment === "mapInset";
    const nextIsMap =
      nextMeta?.treatment === "mapFocus" || nextMeta?.treatment === "mapInset";
    const needsRead = Boolean(
      meta.caption || meta.dayNote || meta.role === "chapter" || isMapTx
    );
    const fadeSec =
      nextImg && (isMapTx || nextIsMap)
        ? Math.max(crossfade, 0.7)
        : nextImg
          ? crossfade
          : 0;
    const hold = Math.max(
      isMapTx ? 2.6 : needsRead ? 2.0 : 0.7,
      meta.durationSeconds - fadeSec
    );

    // Hold uses full 0→1 motion; captions fade in once at the start of the hold.
    await addSegment(
      hold,
      (t) =>
        paintPhotoClip(
          ctx,
          img,
          meta,
          t,
          i,
          width,
          height,
          mapPlan,
          mapImg,
          true,
          placeMaps,
          look
        ),
      meta.role === "chapter"
        ? `Capítulo…`
        : `Clip ${bi + 1}/${bodyIndices.length}`
    );

    if (nextImg && nextMeta) {
      const fadeFrames = Math.max(1, Math.round(fadeSec * fps));
      const transition =
        meta.role === "chapter"
          ? "fade"
          : isMapTx || nextIsMap
            ? "fade"
            : (meta.transitionOut ?? "fade");
      for (let f = 0; f < fadeFrames; f++) {
        const u = fadeFrames === 1 ? 1 : f / (fadeFrames - 1);
        // Outgoing: freeze near end of Ken Burns with chrome on (layer alpha fades).
        const tA = 1;
        // Incoming: ease into Ken Burns WITHOUT chrome so text doesn't peek then restart.
        const tB = u * 0.15;
        paintPhotoClip(ctxA, img, meta, tA, i, width, height, mapPlan, mapImg, true, placeMaps, look);
        paintPhotoClip(
          ctxB,
          nextImg,
          nextMeta,
          tB,
          nextIdx!,
          width,
          height,
          mapPlan,
          mapImg,
          false,
          placeMaps,
          look
        );
        blendTransition(ctx, layerA, layerB, u, transition, width, height);
        const timestamp = frameIndex / fps;
        await videoSource.add(timestamp, 1 / fps);
        reportEncode(`Transición ${bi + 1}→${bi + 2}`);
        frameIndex += 1;
      }
    }
  }

  // 5) Strong CTA outro
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

  // Brutal cover = best still (point 8), not generic map.
  const coverImg =
    (manifest.coverPhotoId
      ? imageByPhotoId.get(manifest.coverPhotoId)
      : null) ??
    images[hookIndices[0] ?? 0] ??
    images[0];
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  if (coverImg) {
    drawCover(ctx, coverImg, width, height, 1.08, 0, -0.02);
    drawScrim(ctx, width, height);
    drawSafeText(
      ctx,
      [
        { text: manifest.title, size: 52, weight: "700" },
        ...(manifest.dateRangeLabel
          ? [{ text: manifest.dateRangeLabel, size: 26, weight: "500" }]
          : []),
      ],
      height * 0.78,
      width
    );
  } else if (mapImg && mapPlan) {
    paintMapIntro(
      ctx,
      mapPlan,
      mapImg,
      0.7,
      manifest.title,
      manifest.dateRangeLabel,
      width,
      height,
          look
    );
  } else {
    paintTitleIntro(0.35);
  }
  const cover = await canvasToJpegBlob(canvas);

  const mp4 = new Blob([buffer], { type: "video/mp4" });
  return { mp4, cover };
}
