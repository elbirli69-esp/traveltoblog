"use client";

import { useState } from "react";
import { isHeicPath, photoImageUrl } from "@/lib/photo-display";

interface PhotoImageProps {
  photoId: string;
  url: string;
  alt?: string;
  className?: string;
}

/**
 * Muestra una foto del viaje. Usa la ruta API para HEIC y como fallback si /uploads falla.
 */
export default function PhotoImage({ photoId, url, alt = "", className }: PhotoImageProps) {
  const initialSrc = isHeicPath(url) ? photoImageUrl(photoId) : url;
  const [src, setSrc] = useState(initialSrc);
  const [failed, setFailed] = useState(false);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        if (failed) return;
        setFailed(true);
        const fallback = photoImageUrl(photoId);
        if (src !== fallback) setSrc(fallback);
      }}
    />
  );
}
