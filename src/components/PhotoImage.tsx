"use client";

import { useState } from "react";
import { isHeicPath, photoFullUrl, photoThumbUrl } from "@/lib/photo-display";

interface PhotoImageProps {
  photoId: string;
  url: string;
  alt?: string;
  className?: string;
  /** thumb = miniatura para listas; full = resolución original (detalle / export preview) */
  variant?: "thumb" | "full";
  loading?: "lazy" | "eager";
}

export default function PhotoImage({
  photoId,
  url,
  alt = "",
  className,
  variant = "thumb",
  loading = "lazy",
}: PhotoImageProps) {
  const preferred =
    variant === "full"
      ? photoFullUrl(photoId)
      : isHeicPath(url)
        ? photoThumbUrl(photoId)
        : photoThumbUrl(photoId);

  const [src, setSrc] = useState(preferred);
  const [failed, setFailed] = useState(false);

  return (
    // eslint-disable-next-line @next/next/no-img-element
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
  );
}
