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
    if (!key) return;
    var resolved = resolveExportAsset(key);
    if (el.tagName === "VIDEO" || el.tagName === "SOURCE") {
      el.src = resolved;
    } else if ("src" in el) {
      el.src = resolved;
    }
  });

  document.querySelectorAll("video[data-export-poster]").forEach(function (el) {
    var key = el.getAttribute("data-export-poster");
    if (key) el.setAttribute("poster", resolveExportAsset(key));
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

    var galleryImgs = Array.prototype.slice.call(
      document.querySelectorAll(".gallery-tile:not(.gallery-tile--video) img")
    );
    var idx = galleryImgs.indexOf(img);
    lightbox._gallery = galleryImgs;
    lightbox._index = idx >= 0 ? idx : -1;

    function showAt(i) {
      if (!lightbox._gallery || lightbox._gallery.length === 0) return;
      if (i < 0) i = lightbox._gallery.length - 1;
      if (i >= lightbox._gallery.length) i = 0;
      lightbox._index = i;
      var current = lightbox._gallery[i];
      var displayKey = current.getAttribute("data-export-display");
      lightboxImg.src = displayKey
        ? resolveExportAsset(displayKey)
        : exportDisplayFromThumb(current.getAttribute("data-export-src") || current.src);
      lightboxImg.alt = current.alt || "";
      if (lightboxCap) {
        var fig = current.closest("figure");
        var cap = fig && fig.querySelector("figcaption, .story-photo-caption");
        lightboxCap.textContent = cap ? cap.textContent : "";
      }
      var counter = lightbox.querySelector(".lightbox-counter");
      if (counter) {
        counter.textContent = lightbox._gallery.length > 1
          ? (i + 1) + " / " + lightbox._gallery.length
          : "";
      }
      var prevBtn = lightbox.querySelector(".lightbox-prev");
      var nextBtn = lightbox.querySelector(".lightbox-next");
      var multi = lightbox._gallery.length > 1;
      if (prevBtn) prevBtn.hidden = !multi;
      if (nextBtn) nextBtn.hidden = !multi;
    }

    lightbox._showAt = showAt;

    if (idx >= 0) {
      showAt(idx);
    } else {
      // Story / article photo outside gallery — single-image mode
      lightbox._gallery = [img];
      lightbox._index = 0;
      showAt(0);
    }

    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    var lightbox = document.getElementById("lightbox");
    if (!lightbox) return;
    lightbox.classList.remove("open");
    document.body.style.overflow = "";
  }

  function stepLightbox(delta) {
    var lightbox = document.getElementById("lightbox");
    if (!lightbox || !lightbox.classList.contains("open") || !lightbox._showAt) return;
    if (!lightbox._gallery || lightbox._gallery.length < 2) return;
    lightbox._showAt(lightbox._index + delta);
  }

  document.querySelectorAll(".photo-block img, .gallery-tile:not(.gallery-tile--video) img").forEach(function (img) {
    img.addEventListener("click", function () { openLightboxFromImg(img); });
  });

  document.querySelectorAll(".story-media-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var img = btn.querySelector("img");
      if (img) openLightboxFromImg(img);
    });
  });

  var lightbox = document.getElementById("lightbox");
  if (lightbox) {
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox || e.target.classList.contains("lightbox-backdrop")) {
        closeLightbox();
      }
    });
    var prevBtn = lightbox.querySelector(".lightbox-prev");
    var nextBtn = lightbox.querySelector(".lightbox-next");
    if (prevBtn) prevBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      stepLightbox(-1);
    });
    if (nextBtn) nextBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      stepLightbox(1);
    });
    lightbox.querySelector("img") && lightbox.querySelector("img").addEventListener("click", function (e) {
      e.stopPropagation();
    });

    var touchX = null;
    lightbox.addEventListener("touchstart", function (e) {
      if (!e.changedTouches || !e.changedTouches[0]) return;
      touchX = e.changedTouches[0].clientX;
    }, { passive: true });
    lightbox.addEventListener("touchend", function (e) {
      if (touchX == null || !e.changedTouches || !e.changedTouches[0]) return;
      var dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) < 48) return;
      stepLightbox(dx < 0 ? 1 : -1);
    }, { passive: true });

    document.addEventListener("keydown", function (e) {
      if (!lightbox.classList.contains("open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") { e.preventDefault(); stepLightbox(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); stepLightbox(-1); }
    });
  }
})();
`;
}

export function buildExportPhotoRegistryScript(
  registry: Record<string, string>
): string {
  const json = JSON.stringify(registry).replace(/</g, "\\u003c");
  return `<script>window.__EXPORT_PHOTOS__=${json};</script>`;
}
