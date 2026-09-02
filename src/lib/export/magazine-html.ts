import type { TimelineEvent } from "@/lib/timeline";
import { formatDateKey } from "@/lib/travel-dates";
import { PLACE_TYPE_EMOJI, PLACE_TYPE_LABELS, PLACE_EXPORT_CATEGORY_ORDER } from "@/lib/places";
import type { PlaceType } from "@prisma/client";
import { galleryExportStyles } from "@/lib/export/gallery-html";
import { compareHighlightScore, exportHighlightClass } from "@/lib/highlight-score";

export interface MagazineNote {
  type: string;
  text: string;
  createdAt: Date;
}

export interface MagazinePlace {
  id?: string;
  name: string;
  type: string;
  comment: string | null;
  alias: string;
  highlightScore?: number;
  /** Thumb paths for linked (or nearby) photos */
  photoPaths?: string[];
}

export interface MagazineMetaInput {
  title: string;
  deck: string;
  dateRange: string;
  coverImagePath: string | null;
  appUrl?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/** Extrae subtítulo desde nota TRIP o primer párrafo de la crónica */
export function extractDeck(
  journalMarkdown: string | null | undefined,
  tripNote: string | null | undefined
): string {
  if (tripNote?.trim()) {
    const line = stripMarkdown(tripNote.split(/\n+/)[0] ?? "").trim();
    if (line.length >= 20) return line.slice(0, 240);
  }
  if (journalMarkdown?.trim()) {
    const plain = stripMarkdown(journalMarkdown);
    const para = plain.split(/\n\n+/).find((p) => p.trim().length >= 20);
    if (para) return para.trim().slice(0, 240);
  }
  return "";
}

export function findTripNote(notes: MagazineNote[]): string | null {
  const trip = notes
    .filter((n) => n.type === "TRIP" && n.text.trim())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return trip[0]?.text.trim() ?? null;
}

export function buildHeadMeta(input: MagazineMetaInput): string {
  const description = input.deck || `${input.title} — ${input.dateRange}`;
  const image = input.coverImagePath ?? "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description,
    image: image || undefined,
    author: { "@type": "Organization", name: "TravelToBlog" },
    inLanguage: "es",
  };

  return `
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(input.title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}
  <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeHtml(input.title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

export function buildTocHtml(events: TimelineEvent[]): string {
  const days = events.filter((e) => e.kind === "day-boundary");
  if (days.length === 0) return "";

  const links = days
    .map(
      (d) =>
        `<a href="#day-${escapeHtml(d.dayKey)}" class="mag-toc-link" data-day="${escapeHtml(d.dayKey)}">${escapeHtml(formatDateKey(d.dayKey))}</a>`
    )
    .join("");

  return `
<nav class="mag-toc reveal" aria-label="Índice del viaje">
  <p class="mag-toc-label">Saltar al día</p>
  <div class="mag-toc-links">${links}<a href="#cierre" class="mag-toc-link mag-toc-link--end">Para cerrar</a></div>
</nav>`;
}

const CALLOUT_TYPES = PLACE_EXPORT_CATEGORY_ORDER;

export function buildPlaceCalloutsHtml(places: MagazinePlace[]): string {
  if (places.length === 0) return "";

  const grouped = new Map<PlaceType, MagazinePlace[]>();
  for (const place of places) {
    const type = (place.type as PlaceType) ?? "OTHER";
    const list = grouped.get(type) ?? [];
    list.push(place);
    grouped.set(type, list);
  }

  const sections = CALLOUT_TYPES.filter((type) => grouped.has(type))
    .map((type) => {
      const items = [...grouped.get(type)!].sort((a, b) =>
        compareHighlightScore(a.highlightScore ?? 5, b.highlightScore ?? 5)
      );
      const emoji = PLACE_TYPE_EMOJI[type];
      const label = PLACE_TYPE_LABELS[type];
      const cards = items
        .map((p) => {
          const note = p.comment?.trim();
          const score = p.highlightScore ?? 5;
          const tierClass = exportHighlightClass(score, "mag-callout-card");
          const scoreBadge =
            score >= 8
              ? `<span class="mag-callout-score mag-callout-score--high">${score}/10</span>`
              : score !== 5
                ? `<span class="mag-callout-score">${score}/10</span>`
                : "";
          const thumbs = (p.photoPaths ?? [])
            .slice(0, 4)
            .map(
              (src) =>
                `<img class="mag-callout-thumb" data-export-src="${escapeHtml(src)}" alt="" loading="lazy">`
            )
            .join("");
          return `<article class="mag-callout-card${tierClass ? ` ${tierClass}` : ""}">
  <h4 class="mag-callout-name">${emoji} ${escapeHtml(p.name)}${scoreBadge}</h4>
  ${thumbs ? `<div class="mag-callout-photos">${thumbs}</div>` : ""}
  ${note ? `<p class="mag-callout-note">${escapeHtml(note)}</p>` : ""}
  <footer class="mag-callout-foot">${escapeHtml(p.alias)}</footer>
</article>`;
        })
        .join("");
      return `<div class="mag-callout-group">
  <h3 class="mag-callout-type">${escapeHtml(label)}</h3>
  <div class="mag-callout-grid">${cards}</div>
</div>`;
    })
    .join("");

  return `
<section id="guia" class="mag-callouts reveal visible">
  <header class="mag-section-head">
    <p class="mag-eyebrow">Guía práctica</p>
    <h2 class="section-title">Por categorías del viaje</h2>
  </header>
  ${sections}
</section>`;
}

export interface ClosingStats {
  photoCount: number;
  placeCount: number;
  dayCount: number;
  distanceKm?: number;
  travelers: string[];
}

export function buildClosingSectionHtml(
  tripNote: string | null,
  stats: ClosingStats
): string {
  const paragraphs = tripNote
    ? tripNote
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join("")
    : `<p>Un viaje de ${stats.dayCount || "varios"} días con ${stats.photoCount} fotos y ${stats.placeCount} lugares marcados por ${escapeHtml(stats.travelers.join(", "))}.</p>`;

  const statItems = [
    stats.dayCount > 0 ? `<span class="mag-stat">${stats.dayCount} días</span>` : "",
    `<span class="mag-stat">${stats.photoCount} fotos</span>`,
    stats.placeCount > 0 ? `<span class="mag-stat">${stats.placeCount} lugares</span>` : "",
    stats.distanceKm != null && stats.distanceKm > 0
      ? `<span class="mag-stat">${Math.round(stats.distanceKm)} km</span>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `
<section id="cierre" class="mag-closing reveal">
  <header class="mag-section-head">
    <p class="mag-eyebrow">Para cerrar</p>
    <h2 class="section-title">Lo esencial del viaje</h2>
  </header>
  <div class="mag-closing-body">${paragraphs}</div>
  <div class="mag-closing-stats">${statItems}</div>
</section>`;
}

export function buildMagazineHero(input: {
  title: string;
  deck: string;
  dateRange: string;
  travelers: string;
  typologyLabel: string;
  coverPhotoPath?: string | null;
  heroGradient?: string;
}): string {
  const heroAttrs = input.coverPhotoPath
    ? ` data-export-hero="${escapeHtml(input.coverPhotoPath)}"${
        input.heroGradient
          ? ` data-export-hero-gradient="${escapeHtml(input.heroGradient)}"`
          : ""
      }`
    : "";
  return `<header class="mag-hero"${heroAttrs}>
  <div class="mag-hero-inner reveal">
    <p class="mag-eyebrow">${escapeHtml(input.typologyLabel)} · ${escapeHtml(input.dateRange)}</p>
    <h1>${escapeHtml(input.title)}</h1>
    ${input.deck ? `<p class="mag-deck">${escapeHtml(input.deck)}</p>` : ""}
    <p class="mag-byline">${escapeHtml(input.travelers)}</p>
  </div>
</header>
<div class="mag-progress" aria-hidden="true"><span class="mag-progress-bar"></span></div>`;
}

export function buildMagazineNav(
  hasMap: boolean,
  hasJournal: boolean,
  hasGuide = false
): string {
  return `<nav class="mag-section-nav">
  ${hasMap ? '<a href="#mapa">Mapa</a>' : ""}
  <a href="#cronologia">Recorrido</a>
  ${hasJournal ? '<a href="#historia">Crónica</a>' : ""}
  ${hasGuide ? '<a href="#guia">Guía</a>' : ""}
  <a href="#cierre">Cierre</a>
  <a href="#galeria">Galería</a>
</nav>`;
}

export function magazineStyles(): string {
  return `
:root {
  --bg: #faf9f7;
  --surface: #ffffff;
  --text: #1c1917;
  --muted: #78716c;
  --accent: #0d9488;
  --accent-2: #b45309;
  --border: #e7e5e4;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.75;
}

.mag-progress {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 3px;
  z-index: 100;
  background: transparent;
}
.mag-progress-bar {
  display: block;
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, var(--accent), #14b8a6);
  transition: width .1s linear;
}

.mag-hero {
  position: relative;
  min-height: 68vh;
  display: flex;
  align-items: flex-end;
  background: linear-gradient(135deg, #ccfbf1 0%, #faf9f7 60%, #fef3c7 100%);
  background-size: cover;
  background-position: center;
}
.mag-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(250,249,247,.97) 0%, rgba(250,249,247,.55) 50%, rgba(250,249,247,.2) 100%);
}
.mag-hero-inner {
  position: relative;
  z-index: 1;
  max-width: 760px;
  margin: 0 auto;
  padding: 3rem 1.5rem 2.5rem;
  width: 100%;
}
.mag-eyebrow {
  margin: 0 0 .75rem;
  font-family: system-ui, sans-serif;
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--accent);
}
.mag-hero h1 {
  margin: 0 0 1rem;
  font-size: clamp(2.2rem, 5.5vw, 3.4rem);
  font-weight: 400;
  letter-spacing: -.03em;
  line-height: 1.08;
}
.mag-deck {
  margin: 0 0 1rem;
  font-size: 1.2rem;
  line-height: 1.55;
  color: #44403c;
  font-style: italic;
}
.mag-byline {
  margin: 0;
  font-family: system-ui, sans-serif;
  font-size: .9rem;
  color: var(--muted);
}

.mag-section-nav {
  position: sticky;
  top: 3px;
  z-index: 50;
  display: flex;
  gap: .35rem;
  padding: .65rem 1rem;
  background: rgba(250,249,247,.92);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(10px);
  overflow-x: auto;
  font-family: system-ui, sans-serif;
}
.mag-section-nav a {
  color: var(--muted);
  text-decoration: none;
  font-size: .82rem;
  font-weight: 600;
  white-space: nowrap;
  padding: .35rem .75rem;
  border-radius: 999px;
  transition: color .15s, background .15s;
}
.mag-section-nav a:hover { color: var(--text); background: rgba(13,148,136,.08); }

#cronologia,
#mapa,
#galeria,
#guia,
#cierre,
#historia,
.journal-section {
  scroll-margin-top: 4.5rem;
}

.mag-toc {
  max-width: 760px;
  margin: 0 auto;
  padding: 1.25rem 1.5rem 0;
  font-family: system-ui, sans-serif;
}
.mag-toc-label {
  margin: 0 0 .5rem;
  font-size: .7rem;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--muted);
}
.mag-toc-links {
  display: flex;
  flex-wrap: wrap;
  gap: .4rem;
}
.mag-toc-link {
  padding: .35rem .8rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  font-size: .8rem;
  font-weight: 500;
  transition: border-color .15s, background .15s;
}
.mag-toc-link:hover, .mag-toc-link.active {
  border-color: var(--accent);
  background: rgba(13,148,136,.08);
  color: var(--accent);
}
.mag-toc-link--end { font-style: italic; }

.wrap { max-width: 760px; margin: 0 auto; padding: 0 1.5rem 4rem; }

.mag-section-head { margin-bottom: 1.75rem; text-align: center; }
.mag-section-head .section-title { margin: 0; }

.mag-callouts { margin: 3rem 0; }
.mag-callout-group { margin-bottom: 2rem; }
.mag-callout-type {
  margin: 0 0 .85rem;
  font-family: system-ui, sans-serif;
  font-size: .85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--accent-2);
}
.mag-callout-grid {
  display: grid;
  gap: .75rem;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
.mag-callout-card {
  padding: 1rem 1.1rem;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 4px 20px rgba(28,25,23,.04);
}
.mag-callout-card--featured {
  grid-column: span 2;
  border-color: rgba(45, 212, 191, .45);
  box-shadow: 0 8px 28px rgba(45, 212, 191, .12);
}
.mag-callout-card--accent { border-color: rgba(45, 212, 191, .28); }
.mag-callout-card--subtle { opacity: .92; }
.mag-callout-card--minimal { opacity: .85; }
.mag-callout-score {
  margin-left: .35rem;
  font-size: .72rem;
  font-weight: 700;
  color: var(--muted);
}
.mag-callout-score--high { color: var(--accent-2); }
.mag-callout-name { margin: 0 0 .4rem; font-size: 1rem; font-weight: 600; }
.mag-callout-photos {
  display: flex;
  flex-wrap: wrap;
  gap: .35rem;
  margin: 0 0 .55rem;
}
.mag-callout-thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 8px;
  background: #e7e5e4;
}
.mag-callout-note { margin: 0; font-size: .9rem; color: #57534e; line-height: 1.5; }
.mag-callout-foot { margin-top: .5rem; font-family: system-ui, sans-serif; font-size: .72rem; color: var(--muted); }

.mag-closing {
  margin: 3rem 0;
  padding: 2rem 1.5rem;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(13,148,136,.08), rgba(180,83,9,.06));
  border: 1px solid rgba(13,148,136,.2);
}
.mag-closing-body p { margin: 0 0 1rem; font-size: 1.1rem; }
.mag-closing-body p:last-child { margin-bottom: 0; }
.mag-closing-stats {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(13,148,136,.15);
  font-family: system-ui, sans-serif;
}
.mag-stat {
  padding: .35rem .85rem;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: .8rem;
  font-weight: 600;
  color: var(--muted);
}

/* Story timeline — tema claro magazine */
.story-day-inner {
  background: linear-gradient(135deg, rgba(13,148,136,.1), rgba(180,83,9,.06));
  border-color: rgba(13,148,136,.25);
  box-shadow: 0 8px 30px rgba(28,25,23,.06);
}
.story-day-title { color: var(--text); }
.story-card-content {
  background: var(--surface);
  border-color: var(--border);
  box-shadow: 0 8px 30px rgba(28,25,23,.05);
}
.story-card:hover .story-card-content, .story-card.active .story-card-content {
  border-color: rgba(13,148,136,.35);
}
.story-quote { background: rgba(13,148,136,.08); color: var(--text); }
.story-place-note p, .story-note-body p, .story-journal-body p { color: var(--text); opacity: 1; }
.story-rail-line { background: linear-gradient(180deg, rgba(28,25,23,.12), rgba(28,25,23,.04)); }
.story-dot { border-color: var(--bg); }

.section-title {
  font-size: 1.6rem;
  font-weight: 400;
  letter-spacing: -.02em;
  margin: 0 0 1rem;
}
.journal-section { margin: 3rem 0; }
.journal-section article { font-size: 1.1rem; }
.journal-section article h2 { font-size: 1.35rem; margin-top: 2rem; }
.journal-section article img { width: 100%; border-radius: 8px; margin: 1.5rem 0; }

${galleryExportStyles()}

#lightbox {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(12,10,9,.92);
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 2rem;
}
#lightbox.open { display: flex; }
#lightbox img { max-width: 95vw; max-height: 80vh; border-radius: 8px; }
.lightbox-caption { color: #d6d3d1; margin-top: 1rem; font-family: system-ui, sans-serif; font-size: .9rem; }

.reveal { opacity: 1; transform: none; }
.reveal.visible { opacity: 1; transform: none; }

footer {
  margin-top: 3rem;
  text-align: center;
  color: var(--muted);
  font-size: .85rem;
  font-family: system-ui, sans-serif;
}

@media (max-width: 640px) {
  .mag-hero { min-height: 55vh; }
  .mag-callout-grid { grid-template-columns: 1fr; }
}
`;
}

export function buildMagazineInteractiveScript(): string {
  return `
(function () {
  var bar = document.querySelector(".mag-progress-bar");
  if (bar) {
    window.addEventListener("scroll", function () {
      var h = document.documentElement;
      var pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
      bar.style.width = Math.min(100, Math.max(0, pct)) + "%";
    }, { passive: true });
  }

  function revealBlock(el) {
    if (!el) return;
    el.classList.add("visible");
    el.querySelectorAll(".reveal").forEach(function (child) { child.classList.add("visible"); });
    if (el.id === "mapa" && window.__refreshTravelMap) {
      setTimeout(function () { window.__refreshTravelMap(); }, 80);
    }
  }

  var tocLinks = document.querySelectorAll(".mag-toc-link[data-day]");
  if (tocLinks.length && "IntersectionObserver" in window) {
    var days = document.querySelectorAll(".story-day");
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id.replace("day-", "");
        tocLinks.forEach(function (a) {
          a.classList.toggle("active", a.getAttribute("data-day") === id);
        });
      });
    }, { rootMargin: "-30% 0px -55% 0px" });
    days.forEach(function (d) { obs.observe(d); });
  }

  if ("IntersectionObserver" in window) {
    var reveals = document.querySelectorAll(".reveal");
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        revealBlock(e.target);
        revObs.unobserve(e.target);
        if (e.target.id === "mapa" && window.__refreshTravelMap) {
          setTimeout(function () { window.__refreshTravelMap(); }, 80);
        }
      });
    }, { threshold: 0.05, rootMargin: "-4.5rem 0px -10% 0px" });
    reveals.forEach(function (el) { revObs.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("visible"); });
  }
})();
`;
}
