import type { ExportPhoto } from "@/lib/export-html";
import { exportDisplayPathFromThumb } from "@/lib/export-images";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function exportThumbImgTag(
  photo: Pick<ExportPhoto, "thumbPath" | "localPath">,
  alt: string,
  extraClass = ""
): string {
  const cls = extraClass ? ` class="${escapeHtml(extraClass)}"` : "";
  return `<img data-export-src="${escapeHtml(photo.thumbPath)}" data-export-display="${escapeHtml(photo.localPath)}" alt="${escapeHtml(alt)}" loading="lazy"${cls}>`;
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

  function openLightboxFromImg(img) {
    var lightbox = document.getElementById("lightbox");
    var lightboxImg = lightbox && lightbox.querySelector("img");
    var lightboxCap = lightbox && lightbox.querySelector(".lightbox-caption");
    if (!lightbox || !lightboxImg || !img) return;
    var displayKey = img.getAttribute("data-export-display");
    lightboxImg.src = displayKey
      ? resolveExportAsset(displayKey)
      : exportDisplayFromThumb(img.getAttribute("data-export-src") || img.src);
    lightboxImg.alt = img.alt || "";
    if (lightboxCap) {
      var fig = img.closest("figure");
      var cap = fig && fig.querySelector("figcaption, .story-photo-caption");
      lightboxCap.textContent = cap ? cap.textContent : "";
    }
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
  }

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
