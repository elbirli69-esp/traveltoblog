import { exportThumbImgTag } from "@/lib/export-photo-html";
import { formatDateKey, isoToDateKey, resolveTravelDayRange } from "@/lib/travel-dates";

export interface GalleryPhotoInput {
  localPath: string;
  thumbPath: string;
  exifDateTime: Date | null;
  alias: string;
  isTransportStart: boolean;
  isTransportEnd: boolean;
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
    [...list].sort(
      (a, b) =>
        new Date(a.exifDateTime ?? 0).getTime() - new Date(b.exifDateTime ?? 0).getTime()
    );

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
  const when = photo.exifDateTime ? formatPhotoTime(photo.exifDateTime) : "";
  const caption = when ? `${photo.alias} · ${when}` : photo.alias;
  return `<figure class="gallery-tile">${exportThumbImgTag(photo, `Foto de ${photo.alias}`, "gallery-tile-img")}<figcaption>${escapeHtml(caption)}</figcaption></figure>`;
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
  font-size: .92rem;
}
.gallery-days {
  display: flex;
  flex-direction: column;
  gap: 2.25rem;
}
.gallery-day { scroll-margin-top: 4.5rem; }
.gallery-day-title {
  margin: 0 0 .25rem;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.3;
}
.gallery-day-meta {
  margin: 0 0 .85rem;
  font-size: .8rem;
  color: var(--muted);
}
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: .6rem;
  grid-auto-flow: dense;
}
.gallery-tile {
  position: relative;
  margin: 0;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: color-mix(in srgb, var(--muted) 18%, transparent);
}
.gallery-tile img,
.gallery-tile-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform .35s ease;
}
.gallery-tile:hover img { transform: scale(1.06); }
.gallery-tile figcaption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  margin: 0;
  padding: 1.75rem .55rem .45rem;
  background: linear-gradient(transparent, rgba(0,0,0,.78));
  font-size: .68rem;
  line-height: 1.35;
  color: #fff;
  pointer-events: none;
}
@media (min-width: 640px) {
  .gallery-grid { grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: .7rem; }
}
@media (min-width: 900px) {
  .gallery-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
}
@media (max-width: 480px) {
  .gallery-grid { grid-template-columns: repeat(3, 1fr); gap: .45rem; }
}
`;
}
