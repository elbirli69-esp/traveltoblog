import type { TimelineEvent } from "@/lib/timeline";
import type { TypologyProfile } from "@/lib/export/typologies/registry";

const KIND_ICONS: Record<string, string> = {
  photo: "📷",
  place: "📍",
  note: "📝",
  "flight-out": "✈️",
  "flight-in": "🛬",
  "journal-chunk": "📖",
  "gps-segment": "🛤️",
};

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

export function buildTimelineSectionHtml(events: TimelineEvent[]): string {
  const content = events
    .map((ev) => {
      if (ev.kind === "day-boundary") {
        return `<div class="tl-day" data-day="${escapeHtml(ev.dayKey)}" id="day-${escapeHtml(ev.dayKey)}">
  <h3 class="tl-day-title">${escapeHtml(ev.title)}</h3>
</div>`;
      }
      const icon = KIND_ICONS[ev.kind] ?? "•";
      const hasGps = ev.lat != null && ev.lng != null;
      const media = ev.mediaUrl
        ? `<img class="tl-thumb" src="${escapeHtml(ev.mediaUrl)}" alt="" loading="lazy">`
        : "";
      const body = ev.body ? `<p class="tl-body">${escapeHtml(ev.body)}</p>` : "";
      const author = ev.author ? `<span class="tl-author">${escapeHtml(ev.author)}</span>` : "";
      return `<article class="tl-event" data-event-id="${escapeHtml(ev.id)}" data-day="${escapeHtml(ev.dayKey)}"${hasGps ? ` data-lat="${ev.lat}" data-lng="${ev.lng}"` : ""}>
  <button type="button" class="tl-event-btn" aria-label="${escapeHtml(ev.title)}">
    <span class="tl-icon">${icon}</span>
    <div class="tl-content">
      <div class="tl-head"><strong>${escapeHtml(ev.title)}</strong> <time>${formatTime(ev.at)}</time></div>
      ${body}
      ${author}
    </div>
    ${media}
  </button>
</article>`;
    })
    .join("\n");

  return `<section id="cronologia" class="export-timeline reveal">
  <h2 class="section-title">Cronología del viaje</h2>
  <div class="tl-list" role="list">${content}</div>
</section>`;
}

export function timelineExportStyles(): string {
  return `
.export-timeline { margin: 2rem 0; }
.tl-list { display: flex; flex-direction: column; gap: .5rem; }
.tl-day { margin-top: 1.25rem; padding-top: .75rem; border-top: 1px solid rgba(255,255,255,.12); }
.tl-day-title { font-size: 1rem; font-weight: 700; color: var(--accent, #2dd4bf); margin: 0; }
.tl-event { margin: 0; }
.tl-event-btn {
  display: flex; align-items: flex-start; gap: .75rem; width: 100%;
  text-align: left; padding: .65rem .75rem; border-radius: 12px;
  border: 1px solid transparent; background: rgba(255,255,255,.04);
  color: inherit; cursor: pointer; transition: border-color .15s, background .15s;
}
.tl-event-btn:hover, .tl-event.active .tl-event-btn {
  border-color: var(--accent, #2dd4bf); background: rgba(45,212,191,.08);
}
.tl-icon { font-size: 1.25rem; line-height: 1; flex-shrink: 0; }
.tl-content { flex: 1; min-width: 0; }
.tl-head { display: flex; flex-wrap: wrap; gap: .5rem; align-items: baseline; font-size: .9rem; }
.tl-head time { opacity: .65; font-size: .8rem; }
.tl-body { margin: .25rem 0 0; font-size: .85rem; opacity: .85; }
.tl-author { font-size: .75rem; opacity: .6; }
.tl-thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
`;
}

export function buildTimelineSyncScript(): string {
  return `
(function () {
  var list = document.querySelector(".tl-list");
  if (!list) return;
  list.addEventListener("click", function (e) {
    var btn = e.target.closest(".tl-event-btn");
    if (!btn) return;
    var article = btn.closest(".tl-event");
    if (!article) return;
    document.querySelectorAll(".tl-event.active").forEach(function (el) { el.classList.remove("active"); });
    article.classList.add("active");
    var lat = article.getAttribute("data-lat");
    var lng = article.getAttribute("data-lng");
    if (lat && lng && window.__travelMap) {
      window.__travelMap.flyTo([parseFloat(lat), parseFloat(lng)], 14, { duration: 1 });
    }
    var id = article.getAttribute("data-event-id");
    if (id) window.__travelPlay && window.__travelPlay.goToEvent(id);
  });
})();
`;
}

export function buildStatsSectionHtml(stats: {
  photoCount: number;
  placeCount: number;
  dayCount: number;
  distanceKm?: number;
  profile: TypologyProfile;
}): string {
  const pills: string[] = [];
  if (stats.profile.statsLabels?.days) {
    pills.push(`<span class="stat-pill">📅 ${stats.dayCount} días</span>`);
  }
  if (stats.profile.statsLabels?.distance && stats.distanceKm != null) {
    pills.push(`<span class="stat-pill">🛣️ ${stats.distanceKm.toFixed(0)} km</span>`);
  }
  if (stats.profile.statsLabels?.places) {
    pills.push(`<span class="stat-pill">📍 ${stats.placeCount} lugares</span>`);
  }
  pills.push(`<span class="stat-pill">📷 ${stats.photoCount} fotos</span>`);
  if (pills.length === 0) return "";
  return `<section class="trip-stats reveal">${pills.join("")}</section>`;
}

export function buildFlightsSectionHtml(events: TimelineEvent[]): string {
  const flights = events.filter((e) => e.kind === "flight-out" || e.kind === "flight-in");
  if (flights.length === 0) return "";
  const items = flights
    .map(
      (f) =>
        `<div class="flight-act reveal"><span>${f.kind === "flight-out" ? "✈️ Ida" : "🛬 Vuelta"}</span><strong>${escapeHtml(f.title)}</strong>${f.author ? ` — ${escapeHtml(f.author)}` : ""}</div>`
    )
    .join("");
  return `<section id="vuelos" class="flights-section reveal"><h2 class="section-title">Trayecto</h2>${items}</section>`;
}

export function buildPlayModeSectionHtml(): string {
  return `<section id="reproducir" class="play-section reveal">
  <h2 class="section-title">Reproducir viaje</h2>
  <div class="play-controls">
    <button type="button" id="play-toggle" class="play-btn" aria-label="Reproducir">▶ Reproducir</button>
    <input type="range" id="play-scrubber" min="0" max="0" value="0" aria-label="Avance temporal" />
    <span id="play-label" class="play-label"></span>
  </div>
</section>`;
}

export function playModeStyles(): string {
  return `
.play-section { margin: 2rem 0; padding: 1rem; border-radius: 16px; background: rgba(255,255,255,.05); }
.play-controls { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; }
.play-btn { padding: .5rem 1rem; border-radius: 999px; border: none; background: var(--accent,#2dd4bf); color: #0c0a09; font-weight: 600; cursor: pointer; }
#play-scrubber { flex: 1; min-width: 120px; accent-color: var(--accent,#2dd4bf); }
.play-label { font-size: .85rem; opacity: .8; }
.flights-section .flight-act { padding: .75rem 0; border-bottom: 1px solid rgba(255,255,255,.08); }
.trip-stats { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0; }
`;
}

export function buildPlayModeScript(
  events: TimelineEvent[],
  profile: TypologyProfile
): string {
  const playable = events.filter((e) => e.kind !== "day-boundary");
  const days = [...new Set(playable.map((e) => e.dayKey))].sort();
  const json = JSON.stringify(playable.map((e) => ({ id: e.id, dayKey: e.dayKey, at: e.at, lat: e.lat, lng: e.lng, title: e.title })));
  const daysJson = JSON.stringify(days);
  const unit = profile.playProfile.unit;
  const mapBehavior = profile.playProfile.mapBehavior;

  return `
(function () {
  var events = ${json};
  var days = ${daysJson};
  var unit = ${JSON.stringify(unit)};
  var mapBehavior = ${JSON.stringify(mapBehavior)};
  var idx = 0;
  var playing = false;
  var timer = null;
  var scrubber = document.getElementById("play-scrubber");
  var label = document.getElementById("play-label");
  var toggle = document.getElementById("play-toggle");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function maxIdx() { return unit === "day" ? days.length - 1 : events.length - 1; }
  if (scrubber) { scrubber.max = String(Math.max(0, maxIdx())); }

  function updateLabel() {
    if (!label) return;
    if (unit === "day") {
      label.textContent = days[idx] ? "Día: " + days[idx] : "";
    } else {
      label.textContent = events[idx] ? events[idx].title : "";
    }
  }

  function highlight() {
    document.querySelectorAll(".tl-event.active").forEach(function (el) { el.classList.remove("active"); });
    var targetId = unit === "day" ? null : events[idx] && events[idx].id;
    var dayKey = unit === "day" ? days[idx] : events[idx] && events[idx].dayKey;
    if (targetId) {
      var el = document.querySelector('[data-event-id="' + targetId + '"]');
      if (el) { el.classList.add("active"); el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" }); }
    }
    if (dayKey) {
      document.querySelectorAll(".map-day-item").forEach(function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-day") === dayKey);
      });
    }
    var ev = unit === "day" ? events.find(function (e) { return e.dayKey === days[idx]; }) : events[idx];
    if (ev && ev.lat != null && window.__travelMap) {
      if (mapBehavior === "follow" && !reduced) {
        window.__travelMap.flyTo([ev.lat, ev.lng], 13, { duration: 1.2 });
      } else {
        window.__travelMap.setView([ev.lat, ev.lng], 13);
      }
    }
    if (scrubber) scrubber.value = String(idx);
    updateLabel();
  }

  function next() {
    if (idx < maxIdx()) { idx++; highlight(); } else { pause(); }
  }

  function pause() {
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
    if (toggle) toggle.textContent = "▶ Reproducir";
  }

  function play() {
    if (reduced) return;
    playing = true;
    if (toggle) toggle.textContent = "⏸ Pausar";
    timer = setInterval(next, unit === "day" ? 4000 : 2500);
  }

  window.__travelPlay = {
    goToEvent: function (id) {
      var i = events.findIndex(function (e) { return e.id === id; });
      if (i >= 0) { idx = unit === "day" ? days.indexOf(events[i].dayKey) : i; highlight(); }
    }
  };

  if (toggle) toggle.addEventListener("click", function () { playing ? pause() : play(); });
  if (scrubber) scrubber.addEventListener("input", function () { idx = parseInt(scrubber.value, 10) || 0; highlight(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { idx = Math.min(maxIdx(), idx + 1); highlight(); }
    if (e.key === "ArrowLeft") { idx = Math.max(0, idx - 1); highlight(); }
  });

  var hash = location.hash.match(/day=([\\d-]+)/);
  if (hash) {
    var di = days.indexOf(hash[1]);
    if (di >= 0) { idx = di; highlight(); }
  } else {
    updateLabel();
  }
})();
`;
}
