import type { NoteType } from "@prisma/client";
import type { TimelineEvent } from "@/lib/timeline";
import { formatDateKey } from "@/lib/travel-dates";
import { PLACE_TYPE_EMOJI, PLACE_TYPE_LABELS } from "@/lib/places";
import type { PlaceType } from "@prisma/client";
import { exportDisplayPathFromThumb } from "@/lib/export-images";

export interface StoryTimelineOptions {
  /** Si hay artículo de crónica, omitir trozos journal-chunk duplicados */
  excludeJournalChunks?: boolean;
  /** Título de la sección */
  title?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatWeekday(dayKey: string): string {
  return new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(
    new Date(`${dayKey}T12:00:00`)
  );
}

function noteKindLabel(noteType?: NoteType): string {
  if (noteType === "DAY") return "Vivencia del día";
  if (noteType === "TRIP") return "Sobre el viaje";
  if (noteType === "PHOTO") return "Comentario de foto";
  return "Nota";
}

function placeEmoji(type?: string): string {
  if (!type) return "📍";
  return PLACE_TYPE_EMOJI[type as PlaceType] ?? "📍";
}

function placeTypeLabel(type?: string): string {
  if (!type) return "Lugar";
  return PLACE_TYPE_LABELS[type as PlaceType] ?? "Lugar";
}

function bodyParagraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
}

export function prepareStoryEvents(
  events: TimelineEvent[],
  options: StoryTimelineOptions = {}
): { events: TimelineEvent[]; photoNotes: Map<string, string[]> } {
  const photoNotes = new Map<string, string[]>();
  const filtered: TimelineEvent[] = [];

  for (const ev of events) {
    if (options.excludeJournalChunks && ev.kind === "journal-chunk") continue;

    if (ev.kind === "note" && ev.meta?.noteType === "PHOTO" && ev.meta.photoId) {
      const pid = ev.meta.photoId;
      const list = photoNotes.get(pid) ?? [];
      if (ev.body?.trim()) list.push(ev.body.trim());
      photoNotes.set(pid, list);
      continue;
    }

    filtered.push(ev);
  }

  return { events: filtered, photoNotes };
}

function eventAttrs(ev: TimelineEvent): string {
  const hasGps = ev.lat != null && ev.lng != null;
  const parts = [
    `class="story-card tl-event story-card--${ev.kind}"`,
    `data-event-id="${escapeHtml(ev.id)}"`,
    `data-day="${escapeHtml(ev.dayKey)}"`,
  ];
  if (hasGps) parts.push(`data-lat="${ev.lat}"`, `data-lng="${ev.lng}"`);
  return parts.join(" ");
}

function renderDayBoundary(ev: TimelineEvent): string {
  const weekday = formatWeekday(ev.dayKey);
  const label = formatDateKey(ev.dayKey);
  return `
<div class="story-day" data-day="${escapeHtml(ev.dayKey)}" id="day-${escapeHtml(ev.dayKey)}">
  <div class="story-day-inner reveal">
    <span class="story-day-weekday">${escapeHtml(weekday)}</span>
    <h3 class="story-day-title">${escapeHtml(label)}</h3>
  </div>
</div>`;
}

function renderPhotoCard(
  ev: TimelineEvent,
  notes: string[],
  index: number
): string {
  const media = ev.mediaUrl
    ? `<figure class="story-media">
        <button type="button" class="story-media-btn" aria-label="Ampliar foto">
          <img data-export-src="${escapeHtml(ev.mediaUrl)}" data-export-display="${escapeHtml(exportDisplayPathFromThumb(ev.mediaUrl))}" alt="Foto del viaje" loading="lazy" class="story-photo-img">
        </button>
        <figcaption class="story-photo-caption">${escapeHtml(ev.author ?? "Viajero")} · ${formatTime(ev.at)}</figcaption>
      </figure>`
    : "";

  const captions = notes.length
    ? `<div class="story-quotes">${notes.map((n) => `<blockquote class="story-quote">${escapeHtml(n)}</blockquote>`).join("")}</div>`
    : "";

  const side = index % 2 === 1 ? " story-card--flip" : "";

  return `
<article ${eventAttrs(ev)}${side}>
  <div class="story-card-inner reveal">
    <div class="story-card-rail">
      <span class="story-dot story-dot--photo" aria-hidden="true"></span>
      <span class="story-rail-line" aria-hidden="true"></span>
    </div>
    <div class="story-card-content">
      <header class="story-card-head">
        <span class="story-kind">📷 Momento capturado</span>
        <time datetime="${escapeHtml(ev.at)}">${formatTime(ev.at)}</time>
      </header>
      ${media}
      ${captions}
    </div>
  </div>
</article>`;
}

function renderPlaceCard(ev: TimelineEvent): string {
  const emoji = placeEmoji(ev.meta?.placeType);
  const typeLabel = placeTypeLabel(ev.meta?.placeType);
  const body = ev.body ? `<div class="story-place-note">${bodyParagraphs(ev.body)}</div>` : "";
  const media = ev.mediaUrl
    ? `<figure class="story-media story-media--compact">
        <img data-export-src="${escapeHtml(ev.mediaUrl)}" data-export-display="${escapeHtml(exportDisplayPathFromThumb(ev.mediaUrl))}" alt="" loading="lazy" class="story-photo-img">
      </figure>`
    : "";

  return `
<article ${eventAttrs(ev)}>
  <div class="story-card-inner reveal">
    <div class="story-card-rail">
      <span class="story-dot story-dot--place" aria-hidden="true"></span>
      <span class="story-rail-line" aria-hidden="true"></span>
    </div>
    <div class="story-card-content story-card-content--place">
      <header class="story-card-head">
        <span class="story-kind">${emoji} ${escapeHtml(typeLabel)}</span>
        <time datetime="${escapeHtml(ev.at)}">${formatTime(ev.at)}</time>
      </header>
      <h4 class="story-place-name">${escapeHtml(ev.title)}</h4>
      ${media}
      ${body}
      ${ev.author ? `<footer class="story-card-foot"><span class="story-author">${escapeHtml(ev.author)}</span></footer>` : ""}
    </div>
  </div>
</article>`;
}

function renderNoteCard(ev: TimelineEvent): string {
  const label = noteKindLabel(ev.meta?.noteType);
  const body = ev.body ? `<div class="story-note-body">${bodyParagraphs(ev.body)}</div>` : "";
  const variant =
    ev.meta?.noteType === "TRIP" ? " story-card--trip" : " story-card--daynote";

  return `
<article ${eventAttrs(ev)}${variant}>
  <div class="story-card-inner reveal">
    <div class="story-card-rail">
      <span class="story-dot story-dot--note" aria-hidden="true"></span>
      <span class="story-rail-line" aria-hidden="true"></span>
    </div>
    <div class="story-card-content story-card-content--note">
      <header class="story-card-head">
        <span class="story-kind">✍️ ${escapeHtml(label)}</span>
        <time datetime="${escapeHtml(ev.at)}">${formatTime(ev.at)}</time>
      </header>
      ${body}
      ${ev.author ? `<footer class="story-card-foot"><span class="story-author">${escapeHtml(ev.author)}</span></footer>` : ""}
    </div>
  </div>
</article>`;
}

function renderFlightCard(ev: TimelineEvent): string {
  const isOut = ev.kind === "flight-out";
  const icon = isOut ? "✈️" : "🛬";
  const label = isOut ? "Salida — inicio del viaje" : "Regreso — fin del viaje";
  const media = ev.mediaUrl
    ? `<figure class="story-media story-media--compact">
        <img data-export-src="${escapeHtml(ev.mediaUrl)}" data-export-display="${escapeHtml(exportDisplayPathFromThumb(ev.mediaUrl))}" alt="" loading="lazy" class="story-photo-img">
      </figure>`
    : "";

  return `
<article ${eventAttrs(ev)}>
  <div class="story-card-inner reveal story-card-inner--flight">
    <div class="story-card-rail">
      <span class="story-dot story-dot--flight" aria-hidden="true"></span>
      <span class="story-rail-line" aria-hidden="true"></span>
    </div>
    <div class="story-card-content story-card-content--flight">
      <header class="story-card-head">
        <span class="story-kind">${icon} ${label}</span>
        <time datetime="${escapeHtml(ev.at)}">${formatTime(ev.at)}</time>
      </header>
      <h4 class="story-flight-title">${escapeHtml(ev.title)}</h4>
      ${media}
      ${ev.author ? `<footer class="story-card-foot"><span class="story-author">${escapeHtml(ev.author)}</span></footer>` : ""}
    </div>
  </div>
</article>`;
}

function renderGpsCard(ev: TimelineEvent): string {
  return `
<article ${eventAttrs(ev)}>
  <div class="story-card-inner reveal">
    <div class="story-card-rail">
      <span class="story-dot story-dot--gps" aria-hidden="true"></span>
      <span class="story-rail-line" aria-hidden="true"></span>
    </div>
    <div class="story-card-content story-card-content--gps">
      <header class="story-card-head">
        <span class="story-kind">🛤️ Recorrido GPS</span>
        <time datetime="${escapeHtml(ev.at)}">${formatTime(ev.at)}</time>
      </header>
      <p class="story-gps-label">${escapeHtml(ev.title)}</p>
    </div>
  </div>
</article>`;
}

function renderJournalChunk(ev: TimelineEvent): string {
  const body = ev.body
    ? `<div class="story-journal-body">${bodyParagraphs(ev.body)}</div>`
    : "";

  return `
<article ${eventAttrs(ev)}>
  <div class="story-card-inner reveal">
    <div class="story-card-rail">
      <span class="story-dot story-dot--journal" aria-hidden="true"></span>
      <span class="story-rail-line" aria-hidden="true"></span>
    </div>
    <div class="story-card-content story-card-content--journal">
      <header class="story-card-head">
        <span class="story-kind">📖 Crónica</span>
      </header>
      ${body}
    </div>
  </div>
</article>`;
}

export function buildVisualStoryTimelineHtml(
  events: TimelineEvent[],
  options: StoryTimelineOptions = {}
): string {
  const { events: storyEvents, photoNotes } = prepareStoryEvents(events, options);
  const title = options.title ?? "Recorrido del viaje";
  const contentEvents = storyEvents.filter((e) => e.kind !== "day-boundary");

  if (contentEvents.length === 0) {
    return "";
  }

  let photoIndex = 0;
  const cards = storyEvents
    .map((ev) => {
      if (ev.kind === "day-boundary") return renderDayBoundary(ev);
      if (ev.kind === "photo") {
        const pid = ev.meta?.photoId ?? "";
        const notes = pid ? photoNotes.get(pid) ?? [] : [];
        return renderPhotoCard(ev, notes, photoIndex++);
      }
      if (ev.kind === "place") return renderPlaceCard(ev);
      if (ev.kind === "note") return renderNoteCard(ev);
      if (ev.kind === "flight-out" || ev.kind === "flight-in") return renderFlightCard(ev);
      if (ev.kind === "gps-segment") return renderGpsCard(ev);
      if (ev.kind === "journal-chunk") return renderJournalChunk(ev);
      return "";
    })
    .join("\n");

  const eventCount = contentEvents.length;
  const dayCount = storyEvents.filter((e) => e.kind === "day-boundary").length;

  return `
<section id="cronologia" class="story-timeline export-timeline reveal">
  <header class="story-timeline-header">
    <p class="story-timeline-eyebrow">Línea de tiempo</p>
    <h2 class="section-title story-timeline-title">${escapeHtml(title)}</h2>
    <p class="story-timeline-lead">
      ${eventCount} momento${eventCount === 1 ? "" : "s"} en orden cronológico
      ${dayCount > 0 ? ` · ${dayCount} día${dayCount === 1 ? "" : "s"}` : ""}
    </p>
  </header>
  <div class="story-track tl-list" role="list">${cards}</div>
</section>`;
}

export function storyTimelineStyles(): string {
  return `
.story-timeline { margin: 3rem 0 4rem; scroll-margin-top: 4.5rem; }
.story-timeline-header { margin-bottom: 2.5rem; text-align: center; max-width: 640px; margin-left: auto; margin-right: auto; }
.story-timeline-eyebrow {
  margin: 0 0 .5rem;
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--accent, #2dd4bf);
}
.story-timeline-title { margin: 0 0 .75rem; }
.story-timeline-lead { margin: 0; color: var(--muted, #a8a29e); font-size: .95rem; }

.story-track { position: relative; display: flex; flex-direction: column; gap: 0; padding: 0; }

.story-day {
  position: relative;
  margin: 2.5rem 0 1.25rem;
  scroll-margin-top: 5rem;
}
.story-day:first-child { margin-top: 0; }
.story-day-inner {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: .15rem;
  padding: .85rem 1.35rem;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(45,212,191,.14), rgba(245,158,11,.08));
  border: 1px solid rgba(45,212,191,.28);
  box-shadow: 0 12px 40px rgba(0,0,0,.18);
}
.story-day-weekday {
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--accent-2, #f59e0b);
}
.story-day-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -.02em;
  color: var(--text, #fafaf9);
}

.story-card { margin: 0 0 1.5rem; scroll-margin-top: 5rem; }
.story-card-inner {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 1rem;
  align-items: stretch;
}
.story-card-rail { position: relative; display: flex; flex-direction: column; align-items: center; }
.story-dot {
  width: 14px; height: 14px;
  border-radius: 50%;
  border: 3px solid var(--bg, #0c0a09);
  flex-shrink: 0;
  z-index: 1;
}
.story-dot--photo { background: linear-gradient(135deg, #2dd4bf, #0d9488); box-shadow: 0 0 0 4px rgba(45,212,191,.2); }
.story-dot--place { background: linear-gradient(135deg, #f59e0b, #d97706); box-shadow: 0 0 0 4px rgba(245,158,11,.2); }
.story-dot--note { background: linear-gradient(135deg, #a78bfa, #7c3aed); box-shadow: 0 0 0 4px rgba(167,139,250,.2); }
.story-dot--flight { background: linear-gradient(135deg, #818cf8, #4f46e5); box-shadow: 0 0 0 4px rgba(129,140,248,.2); }
.story-dot--gps { background: #64748b; }
.story-dot--journal { background: #f472b6; }
.story-rail-line {
  flex: 1;
  width: 2px;
  min-height: 24px;
  margin-top: 4px;
  background: linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.04));
  border-radius: 2px;
}

.story-card-content {
  padding: 1.1rem 1.15rem 1.15rem;
  border-radius: 18px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.08);
  backdrop-filter: blur(10px);
  transition: border-color .2s, box-shadow .2s, transform .2s;
}
.story-card:hover .story-card-content,
.story-card.active .story-card-content {
  border-color: rgba(45,212,191,.35);
  box-shadow: 0 16px 48px rgba(0,0,0,.22);
}
.story-card-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: .5rem;
  margin-bottom: .85rem;
}
.story-kind {
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--accent, #2dd4bf);
}
.story-card-head time {
  font-size: .78rem;
  color: var(--muted, #a8a29e);
  font-variant-numeric: tabular-nums;
}

.story-media { margin: 0 0 .85rem; border-radius: 14px; overflow: hidden; }
.story-media-btn {
  display: block; width: 100%; padding: 0; border: none; background: none; cursor: zoom-in;
}
.story-photo-img {
  width: 100%;
  display: block;
  aspect-ratio: 4/3;
  object-fit: cover;
  transition: transform .45s ease;
}
.story-photo-caption {
  margin: .5rem 0 0;
  font-size: .78rem;
  color: var(--muted, #a8a29e);
  text-align: center;
  font-family: system-ui, sans-serif;
}
.story-media-btn:hover .story-photo-img { transform: scale(1.03); }
.story-media--compact .story-photo-img { aspect-ratio: 16/9; max-height: 220px; }

.story-quotes { display: flex; flex-direction: column; gap: .65rem; }
.story-quote {
  margin: 0;
  padding: .75rem 1rem;
  border-left: 3px solid var(--accent, #2dd4bf);
  border-radius: 0 12px 12px 0;
  background: rgba(45,212,191,.08);
  font-size: .95rem;
  font-style: italic;
  color: var(--text, #fafaf9);
  line-height: 1.55;
}

.story-place-name, .story-flight-title {
  margin: 0 0 .5rem;
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: -.02em;
}
.story-place-note p, .story-note-body p, .story-journal-body p {
  margin: 0 0 .65rem;
  font-size: 1rem;
  line-height: 1.7;
  color: var(--text, #fafaf9);
  opacity: .92;
}
.story-place-note p:last-child, .story-note-body p:last-child, .story-journal-body p:last-child { margin-bottom: 0; }

.story-card-content--note {
  background: linear-gradient(135deg, rgba(167,139,250,.1), rgba(255,255,255,.03));
  border-color: rgba(167,139,250,.22);
}
.story-card--trip .story-card-content--note {
  background: linear-gradient(135deg, rgba(129,140,248,.12), rgba(255,255,255,.03));
  border-color: rgba(129,140,248,.25);
}
.story-card-content--place {
  background: linear-gradient(135deg, rgba(245,158,11,.1), rgba(255,255,255,.03));
  border-color: rgba(245,158,11,.22);
}
.story-card-content--flight {
  background: linear-gradient(135deg, rgba(99,102,241,.12), rgba(255,255,255,.03));
  border-color: rgba(99,102,241,.25);
}
.story-card-content--gps {
  padding: .85rem 1rem;
  font-size: .9rem;
  opacity: .85;
}
.story-gps-label { margin: 0; }

.story-card-foot { margin-top: .75rem; padding-top: .65rem; border-top: 1px solid rgba(255,255,255,.06); }
.story-author { font-size: .78rem; color: var(--muted, #a8a29e); }

.tl-event .story-card-inner { cursor: pointer; }
.story-card-inner--flight { cursor: default; }

@media (min-width: 768px) {
  .story-card--flip .story-card-inner { direction: rtl; }
  .story-card--flip .story-card-content { direction: ltr; }
  .story-card-content { padding: 1.25rem 1.35rem 1.35rem; }
  .story-photo-img { aspect-ratio: 16/10; }
}

@media (max-width: 640px) {
  .story-card-inner { grid-template-columns: 20px 1fr; gap: .65rem; }
  .story-day-inner { width: 100%; }
}
`;
}

export function buildStoryTimelineSyncScript(): string {
  return `
(function () {
  var track = document.querySelector(".story-track");
  if (!track) return;

  track.addEventListener("click", function (e) {
    var card = e.target.closest(".story-card");
    if (!card) return;
    if (e.target.closest(".story-media-btn")) return;

    document.querySelectorAll(".story-card.active").forEach(function (el) { el.classList.remove("active"); });
    card.classList.add("active");

    var lat = card.getAttribute("data-lat");
    var lng = card.getAttribute("data-lng");
    if (lat && lng && window.__travelMap) {
      window.__travelMap.flyTo([parseFloat(lat), parseFloat(lng)], 14, { duration: 1 });
    }
    var id = card.getAttribute("data-event-id");
    if (id && window.__travelPlay) window.__travelPlay.goToEvent(id);
  });
})();
`;
}
