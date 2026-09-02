import { exportThumbImgTag } from "@/lib/export-photo-html";
import {
  compareHighlightScore,
  exportHighlightClass,
  exportHighlightTier,
} from "@/lib/highlight-score";
import { formatDateKey, isoToDateKey, resolveTravelDayRange } from "@/lib/travel-dates";

export interface GalleryPhotoInput {
  localPath: string;
  thumbPath: string;
  exifDateTime: Date | null;
  alias: string;
  isTransportStart: boolean;
  isTransportEnd: boolean;
  highlightScore?: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPhotoTime(date: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

interface GalleryDayGroup {
  key: string;
  label: string;
  photos: GalleryPhotoInput[];
}

function groupGalleryPhotosByDay(
  photos: GalleryPhotoInput[],
  startDate: Date | null,
  endDate: Date | null
): GalleryDayGroup[] {
  const filtered = photos.filter((p) => !p.isTransportStart && !p.isTransportEnd);
  if (filtered.length === 0) return [];

  const byDay = new Map<string, GalleryPhotoInput[]>();
  for (const photo of filtered) {
    const key = photo.exifDateTime
      ? isoToDateKey(photo.exifDateTime.toISOString())
      : "_sin_fecha";
    const list = byDay.get(key) ?? [];
    list.push(photo);
    byDay.set(key, list);
  }

  const { dayKeys } = resolveTravelDayRange({
    startDate: startDate?.toISOString() ?? null,
    endDate: endDate?.toISOString() ?? null,
    photoExifDates: filtered.map((p) => p.exifDateTime?.toISOString() ?? null),
  });

  const sortPhotos = (list: GalleryPhotoInput[]) =>
    [...list].sort((a, b) => {
      const byScore = compareHighlightScore(a.highlightScore ?? 5, b.highlightScore ?? 5);
      if (byScore !== 0) return byScore;
      return (
        new Date(a.exifDateTime ?? 0).getTime() - new Date(b.exifDateTime ?? 0).getTime()
      );
    });

  const orderedKeys: string[] = [];
  for (const key of dayKeys) {
    if ((byDay.get(key)?.length ?? 0) > 0) orderedKeys.push(key);
  }
  for (const key of [...byDay.keys()].sort()) {
    if (key !== "_sin_fecha" && !orderedKeys.includes(key)) orderedKeys.push(key);
  }
  if (byDay.has("_sin_fecha")) orderedKeys.push("_sin_fecha");

  return orderedKeys.map((key) => ({
    key,
    label: key === "_sin_fecha" ? "Sin fecha en EXIF" : formatDateKey(key, "long"),
    photos: sortPhotos(byDay.get(key) ?? []),
  }));
}

function buildGalleryTile(photo: GalleryPhotoInput): string {
  const score = photo.highlightScore ?? 5;
  const tier = exportHighlightTier(score);
  const tierClass = exportHighlightClass(score, "gallery-tile");
  const when = photo.exifDateTime ? formatPhotoTime(photo.exifDateTime) : "";
  const caption = when ? `${photo.alias} · ${when}` : photo.alias;
  const badge =
    tier === "featured"
      ? `<span class="gallery-score-badge gallery-score-badge--featured" title="Destacada (${score}/10)">★ ${score}</span>`
      : tier === "accent"
        ? `<span class="gallery-score-badge" title="Nota ${score}/10">${score}</span>`
        : "";
  return `<figure class="gallery-tile${tierClass ? ` ${tierClass}` : ""}">${badge}${exportThumbImgTag(photo, `Foto de ${photo.alias}`, "gallery-tile-img")}<figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

export function buildGallerySection(
  photos: GalleryPhotoInput[],
  startDate: Date | null,
  endDate: Date | null
): string {
  const dayGroups = groupGalleryPhotosByDay(photos, startDate, endDate);
  if (dayGroups.length === 0) return "";

  const totalPhotos = dayGroups.reduce((sum, g) => sum + g.photos.length, 0);
  const dayBlocks = dayGroups
    .map(
      (group) => `
  <section class="gallery-day reveal" aria-labelledby="gallery-day-${escapeHtml(group.key)}">
    <h3 class="gallery-day-title" id="gallery-day-${escapeHtml(group.key)}">${escapeHtml(group.label)}</h3>
    <p class="gallery-day-meta">${group.photos.length} foto${group.photos.length !== 1 ? "s" : ""}</p>
    <div class="gallery-grid">${group.photos.map(buildGalleryTile).join("\n")}</div>
  </section>`
    )
    .join("\n");

  return `
<section id="galeria" class="gallery-section reveal">
  <h2 class="section-title">Galería por días</h2>
  <p class="gallery-lead">${totalPhotos} momentos en ${dayGroups.length} día${dayGroups.length !== 1 ? "s" : ""} del viaje</p>
  <div class="gallery-days">${dayBlocks}</div>
</section>`;
}

/** Shared gallery layout for all export templates (day groups + square mosaic tiles). */
export function galleryExportStyles(): string {
  return `
.gallery-section { margin: 3rem 0 1rem; scroll-margin-top: 4.5rem; }
.gallery-lead {
  color: var(--muted);
  margin: -.35rem 0 1.75rem;
  font-size: .95rem;
}
.gallery-days { display: flex; flex-direction: column; gap: 2.5rem; }
.gallery-day-title {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0 0 .25rem;
  letter-spacing: -.02em;
}
.gallery-day-meta {
  margin: 0 0 1rem;
  font-size: .8rem;
  color: var(--muted);
}
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: .65rem;
}
.gallery-tile {
  position: relative;
  margin: 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface-2, rgba(0,0,0,.04));
  transition: transform .2s ease, box-shadow .2s ease;
}
.gallery-tile--featured {
  grid-column: span 2;
  grid-row: span 2;
}
.gallery-tile--accent {
  box-shadow: 0 0 0 2px rgba(45, 212, 191, .45);
}
.gallery-tile--subtle { opacity: .9; }
.gallery-tile--minimal { opacity: .82; transform: scale(.98); }
.gallery-score-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(0,0,0,.55);
  color: #fff;
}
.gallery-score-badge--featured {
  background: rgba(45, 212, 191, .92);
  color: #042f2e;
}
.gallery-tile img,
.gallery-tile-img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  transition: transform .35s ease;
}
.gallery-tile--featured img,
.gallery-tile--featured .gallery-tile-img {
  aspect-ratio: 1;
}
.gallery-tile:hover img { transform: scale(1.06); }
.gallery-tile figcaption {
  padding: .45rem .55rem;
  font-size: .72rem;
  color: var(--muted);
  line-height: 1.3;
}
`;
}
