import type { ExportPhoto } from "@/lib/export-html";
import { exportDisplayPathFromThumb } from "@/lib/export-images";
import { formatDurationMs } from "@/lib/media-types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function exportVideoBadgeHtml(durationMs?: number | null): string {
  const label = formatDurationMs(durationMs);
  return `<span class="export-video-badge" aria-hidden="true">▶${label ? ` ${escapeHtml(label)}` : ""}</span>`;
}

export function exportThumbImgTag(
  photo: Pick<
    ExportPhoto,
    "thumbPath" | "localPath" | "mediaType" | "videoPath" | "durationMs"
  >,
  alt: string,
  extraClass = ""
): string {
  const cls = extraClass ? ` class="${escapeHtml(extraClass)}"` : "";
  const isVideo = photo.mediaType === "VIDEO";
  const videoAttr =
    isVideo && photo.videoPath
      ? ` data-export-video="${escapeHtml(photo.videoPath)}"`
      : isVideo
        ? ` data-export-video-missing="1"`
        : "";
  const mediaAttr = isVideo ? ` data-export-media="video"` : "";
  return `<img data-export-src="${escapeHtml(photo.thumbPath)}" data-export-display="${escapeHtml(photo.localPath)}" alt="${escapeHtml(alt)}" loading="lazy"${cls}${videoAttr}${mediaAttr}>`;
}

/** Gallery / story wrapper with optional ▶ badge over the thumb. */
export function exportThumbWithBadge(
  photo: Pick<
    ExportPhoto,
    "thumbPath" | "localPath" | "mediaType" | "videoPath" | "durationMs"
  >,
  alt: string,
  imgClass = ""
): string {
  const img = exportThumbImgTag(photo, alt, imgClass);
  if (photo.mediaType !== "VIDEO") return img;
  return `<span class="export-media-wrap">${img}${exportVideoBadgeHtml(photo.durationMs)}</span>`;
}

export function exportDisplayPathFromPhotoPath(photoPath: string): string {
  if (/-thumb\.webp$/i.test(photoPath)) {
    return exportDisplayPathFromThumb(photoPath);
  }
  return photoPath;
}

/** Resolves export assets in ZIP (relative paths) and single-file HTML (__EXPORT_PHOTOS__). */
export function buildExportPhotoBootScript(): string {
  return `
(function () {
  function resolveExportAsset(key) {
    if (!key) return "";
    var reg = window.__EXPORT_PHOTOS__;
    if (reg && reg[key]) return reg[key];
    return key;
  }

  function exportDisplayFromThumb(thumbOrDisplayKey) {
    if (!thumbOrDisplayKey) return "";
    var displayKey = String(thumbOrDisplayKey).replace(/-thumb\\.webp$/i, ".webp");
    return resolveExportAsset(displayKey);
  }

  window.__resolveExportAsset = resolveExportAsset;
  window.__exportDisplayFromThumb = exportDisplayFromThumb;

  document.querySelectorAll("[data-export-src]").forEach(function (el) {
    var key = el.getAttribute("data-export-src");
    if (key) el.src = resolveExportAsset(key);
  });

  document.querySelectorAll("img[src^='photos/']").forEach(function (el) {
    if (el.getAttribute("data-export-src")) return;
    var key = el.getAttribute("src");
    if (key) {
      el.setAttribute("data-export-src", key);
      el.src = resolveExportAsset(key);
    }
  });

  document.querySelectorAll("[data-export-hero]").forEach(function (el) {
    var key = el.getAttribute("data-export-hero");
    if (!key) return;
    var url = resolveExportAsset(key);
    var gradient = el.getAttribute("data-export-hero-gradient");
    el.style.backgroundImage = gradient
      ? gradient + ", url('" + String(url).replace(/'/g, "%27") + "')"
      : "url('" + String(url).replace(/'/g, "%27") + "')";
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
  });

  function closeLightbox() {
    var lightbox = document.getElementById("lightbox");
    var lightboxImg = lightbox && lightbox.querySelector("img");
    var lightboxVideo = lightbox && lightbox.querySelector("video");
    if (!lightbox) return;
    lightbox.classList.remove("open");
    document.body.style.overflow = "";
    if (lightboxVideo) {
      try { lightboxVideo.pause(); } catch (e) {}
      lightboxVideo.removeAttribute("src");
      lightboxVideo.load();
      lightboxVideo.style.display = "none";
    }
    if (lightboxImg) {
      lightboxImg.style.display = "";
      lightboxImg.src = "";
    }
  }

  function openLightboxFromImg(img) {
    var lightbox = document.getElementById("lightbox");
    var lightboxImg = lightbox && lightbox.querySelector("img");
    var lightboxVideo = lightbox && lightbox.querySelector("video");
    var lightboxCap = lightbox && lightbox.querySelector(".lightbox-caption");
    if (!lightbox || !lightboxImg || !img) return;

    var displayKey = img.getAttribute("data-export-display");
    var posterUrl = displayKey
      ? resolveExportAsset(displayKey)
      : exportDisplayFromThumb(img.getAttribute("data-export-src") || img.src);
    var videoPath = img.getAttribute("data-export-video");
    var videoMissing = img.getAttribute("data-export-video-missing") === "1";
    var isVideo = img.getAttribute("data-export-media") === "video" || Boolean(videoPath) || videoMissing;

    var fig = img.closest("figure");
    var cap = fig && fig.querySelector("figcaption, .story-photo-caption");
    var captionText = cap ? cap.textContent : "";

    if (lightboxVideo && isVideo && videoPath) {
      lightboxImg.style.display = "none";
      lightboxVideo.style.display = "block";
      lightboxVideo.poster = posterUrl || "";
      lightboxVideo.src = videoPath;
      lightboxVideo.load();
      try { lightboxVideo.play(); } catch (e) {}
      if (lightboxCap) {
        lightboxCap.textContent = captionText ? "▶ " + captionText : "▶ Vídeo";
      }
    } else {
      if (lightboxVideo) {
        try { lightboxVideo.pause(); } catch (e) {}
        lightboxVideo.removeAttribute("src");
        lightboxVideo.load();
        lightboxVideo.style.display = "none";
      }
      lightboxImg.style.display = "";
      lightboxImg.src = posterUrl;
      lightboxImg.alt = img.alt || "";
      if (lightboxCap) {
        if (isVideo && videoMissing) {
          lightboxCap.textContent = (captionText ? captionText + " · " : "") + "Vídeo (abre el ZIP para reproducirlo)";
        } else if (isVideo) {
          lightboxCap.textContent = captionText ? "▶ " + captionText : "▶ Vídeo";
        } else {
          lightboxCap.textContent = captionText || "";
        }
      }
    }

    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  window.__closeExportLightbox = closeLightbox;

  document.querySelectorAll(".photo-block img, .gallery-tile img").forEach(function (img) {
    img.addEventListener("click", function () { openLightboxFromImg(img); });
  });

  document.querySelectorAll(".story-media-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var img = btn.querySelector("img");
      if (img) openLightboxFromImg(img);
    });
  });
})();
`;
}

export function buildExportPhotoRegistryScript(
  registry: Record<string, string>
): string {
  const json = JSON.stringify(registry).replace(/</g, "\\u003c");
  return `<script>window.__EXPORT_PHOTOS__=${json};</script>`;
}
