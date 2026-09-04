import assert from "node:assert/strict";
import { buildExportHtml } from "../src/lib/export-html.ts";
import { getTypologyProfile } from "../src/lib/export/typologies/registry.ts";
import { formatDateKey } from "../src/lib/travel-dates.ts";

const baseTravel = {
  id: "t1",
  title: "Krakow 2024",
  startDate: new Date("2024-06-01"),
  endDate: new Date("2024-06-05"),
  journalMarkdown: "## Día 1\n\nLlegamos.",
  travelType: "INTERNATIONAL",
};

const photos = [
  {
    id: "ida",
    url: "/uploads/t1/ida.jpg",
    localPath: "photos/001.webp",
    thumbPath: "photos/001-thumb.webp",
    latitude: 40.47,
    longitude: -3.56,
    mediaType: "IMAGE",
    videoPath: null,
    exifDateTime: new Date("2024-06-01T08:00:00Z"),
    alias: "Ana",
    isTransportStart: true,
    isTransportEnd: false,
    highlightScore: 5,
  },
  {
    id: "p1",
    url: "/uploads/t1/p1.jpg",
    localPath: "photos/002.webp",
    thumbPath: "photos/002-thumb.webp",
    latitude: 50.06,
    longitude: 19.94,
    mediaType: "IMAGE",
    videoPath: null,
    exifDateTime: new Date("2024-06-02T10:00:00Z"),
    alias: "Ana",
    isTransportStart: false,
    isTransportEnd: false,
    highlightScore: 8,
  },
  {
    id: "vid",
    url: "/uploads/t1/clip.mp4",
    localPath: "photos/003.webp",
    thumbPath: "photos/003-thumb.webp",
    latitude: 50.061,
    longitude: 19.937,
    mediaType: "VIDEO",
    videoPath: "videos/003.mp4",
    durationMs: 12500,
    exportSourceUrl: "/uploads/t1/clip.poster.jpg",
    exifDateTime: new Date("2024-06-02T12:00:00Z"),
    alias: "Ana",
    isTransportStart: false,
    isTransportEnd: false,
    highlightScore: 7,
  },
  {
    id: "vuelta",
    url: "/uploads/t1/vuelta.jpg",
    localPath: "photos/004.webp",
    thumbPath: "photos/004-thumb.webp",
    latitude: 50.07,
    longitude: 19.79,
    mediaType: "IMAGE",
    videoPath: null,
    exifDateTime: new Date("2024-06-05T18:00:00Z"),
    alias: "Ana",
    isTransportStart: false,
    isTransportEnd: true,
    highlightScore: 5,
  },
];

const users = [{ id: "u1", alias: "Ana", createdAt: new Date(), updatedAt: new Date() }];

const international = buildExportHtml({
  travel: baseTravel,
  users,
  photos,
  places: [
    {
      id: "pl1",
      name: "Rynek",
      type: "LANDMARK",
      latitude: 50.0617,
      longitude: 19.9373,
      comment: null,
      alias: "Ana",
      visitedAt: new Date("2024-06-02T11:00:00Z"),
    },
  ],
  template: "magazine",
  typology: "INTERNATIONAL",
  mapStaticLocalPath: "map/local.png",
  mapStaticFlightPath: "map/flights.png",
});

assert.ok(international.includes('id="mapa"'), "has destination map");
assert.ok(international.includes("map-static-fallback"), "static fallback markup");
assert.ok(international.includes("map/local.png"), "local static path");
assert.ok(international.includes("map/flights.png"), "flight static path");
assert.ok(international.includes("story-video") || international.includes("gallery-tile-video"), "playable video markup");
assert.ok(international.includes("videos/003.mp4"), "video path in export");
assert.ok(international.includes("Internacional"), "typology label in footer");

// INTERNATIONAL section order: flights before map before timeline (play excluded in magazine)
const flightsIdx = international.indexOf("id=\"vuelos\"");
const mapIdx = international.indexOf("id=\"mapa\"");
const timelineIdx = international.indexOf("id=\"cronologia\"");
if (flightsIdx >= 0 && mapIdx >= 0) {
  assert.ok(flightsIdx < mapIdx, "INTERNATIONAL: flights section before map when present");
}
assert.ok(mapIdx >= 0 && timelineIdx >= 0 && mapIdx < timelineIdx, "INTERNATIONAL: map before timeline");
assert.ok(international.includes("El viaje"), "unified story nav/title");
assert.ok(!international.includes('href="#historia"'), "no separate crónica nav");
assert.ok(!international.includes("Crónica del viaje"), "no separate journal section");
assert.ok(international.includes("Llegamos") || international.includes("story-day-prose") || international.includes("story-intro"), "day prose interleaved or present");

const galleryIdx = international.indexOf('id="galeria"');
const guideIdx = international.indexOf('id="guia"');
const closingIdx = international.indexOf('id="cierre"');
assert.ok(timelineIdx >= 0 && galleryIdx >= 0 && timelineIdx < galleryIdx, "El viaje before Galería");
if (guideIdx >= 0) {
  assert.ok(galleryIdx < guideIdx, "Galería before Guía");
}
if (closingIdx >= 0 && guideIdx >= 0) {
  assert.ok(guideIdx < closingIdx, "Guía before Cierre");
}
const navChunk = international.slice(
  international.indexOf("mag-section-nav"),
  international.indexOf("</nav>", international.indexOf("mag-section-nav"))
);
const navGal = navChunk.indexOf("#galeria");
const navGuide = navChunk.indexOf("#guia");
assert.ok(navGal >= 0 && (navGuide < 0 || navGal < navGuide), "nav: Galería before Guía");

const beach = buildExportHtml({
  travel: { ...baseTravel, travelType: "BEACH_RESORT", journalMarkdown: null },
  users,
  photos: photos.filter((p) => !p.isTransportStart && !p.isTransportEnd),
  template: "magazine",
  typology: "BEACH_RESORT",
});
const beachGallery = beach.indexOf("id=\"galeria\"");
const beachMap = beach.indexOf("id=\"mapa\"");
const beachTimeline = beach.indexOf("id=\"cronologia\"");
assert.ok(beachGallery >= 0 && beachTimeline >= 0 && beachTimeline < beachGallery, "Magazine: El viaje before Galería");
if (beachMap >= 0) {
  // Map may sit before timeline (typology) or after gallery; never between viaje and galería.
  assert.ok(
    beachMap < beachTimeline || beachMap > beachGallery,
    "Magazine: map not between El viaje and Galería"
  );
}

const cityProfile = getTypologyProfile("CITY_BREAK");
assert.equal(cityProfile.mapConfig.showRoute, false);
assert.equal(cityProfile.mapConfig.emphasis, "pois");
assert.ok(!cityProfile.sectionOrder.includes("journal"), "typology has no separate journal slot");

const richJournal = `# Krakow

Empezamos con ganas.

---

## El viaje día a día

### ${formatDateKey("2024-06-02", "long")}

Plaza del Mercado al amanecer.

![Foto de Ana](/uploads/t1/p1.jpg)

*Ana*

---

Y volvimos con historias.
`;

const unified = buildExportHtml({
  travel: {
    ...baseTravel,
    journalMarkdown: richJournal,
  },
  users,
  photos: photos.filter((p) => !p.isTransportStart && !p.isTransportEnd),
  template: "magazine",
  typology: "CITY_BREAK",
});
assert.ok(unified.includes("Empezamos con ganas") || unified.includes("story-intro"), "intro in unified story");
assert.ok(unified.includes("Plaza del Mercado"), "day prose in unified story");
assert.ok(unified.includes("Y volvimos") || unified.includes("story-conclusion"), "conclusion in unified story");
const storySlice = unified.slice(
  unified.indexOf('id="cronologia"'),
  unified.indexOf('id="galeria"') >= 0 ? unified.indexOf('id="galeria"') : undefined
);
assert.ok(!storySlice.includes("Foto de Ana"), "no image alt dump inside El viaje");
assert.ok(!storySlice.includes("story-dot"), "no timeline rail dots");
assert.ok(!storySlice.includes("story-card-rail"), "no timeline rail column");
assert.ok(unified.includes("lightbox-prev"), "lightbox prev control");
assert.ok(unified.includes("stepLightbox") || unified.includes("ArrowLeft") || unified.includes("touchend"), "lightbox swipe/keyboard nav");
assert.ok(!unified.includes('id="historia"'), "no historia article id");
assert.ok(!unified.includes("Crónica del viaje"), "no separate journal heading");

console.log("export-html ok", {
  internationalDualStatic: true,
  video: true,
  beachOrder: true,
  unifiedStory: true,
});
