"use client";

import { useState } from "react";
import { isHeicPath, photoFullUrl, photoThumbUrl } from "@/lib/photo-display";
import { formatDurationMs } from "@/lib/media-types";

interface PhotoImageProps {
  photoId: string;
  url: string;
  alt?: string;
  className?: string;
  /** thumb = miniatura para listas; full = resolución original (detalle / export preview) */
  variant?: "thumb" | "full";
  loading?: "lazy" | "eager";
  mediaType?: "IMAGE" | "VIDEO";
  durationMs?: number | null;
}

export default function PhotoImage({
  photoId,
  url,
  alt = "",
  className,
  variant = "thumb",
  loading = "lazy",
  mediaType = "IMAGE",
  durationMs = null,
}: PhotoImageProps) {
  const preferred =
    variant === "full" && mediaType !== "VIDEO"
      ? photoFullUrl(photoId)
      : isHeicPath(url)
        ? photoThumbUrl(photoId)
        : photoThumbUrl(photoId);

  const [src, setSrc] = useState(preferred);
  const [failed, setFailed] = useState(false);

  if (mediaType === "VIDEO" && variant === "full") {
    return (
      <video
        src={photoFullUrl(photoId)}
        poster={photoThumbUrl(photoId)}
        controls
        playsInline
        preload="metadata"
        className={className}
      >
        {alt}
      </video>
    );
  }

  return (
    <span className="relative block w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={className}
        loading={loading}
        decoding="async"
        onError={() => {
          if (failed) return;
          setFailed(true);
          const fallbacks =
            variant === "full"
              ? [photoFullUrl(photoId), url]
              : [photoThumbUrl(photoId), photoFullUrl(photoId), url];
          const next = fallbacks.find((f) => f !== src);
          if (next) setSrc(next);
        }}
      />
      {mediaType === "VIDEO" && (
        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          ▶ {formatDurationMs(durationMs) || "Vídeo"}
        </span>
      )}
    </span>
  );
}
