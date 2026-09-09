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
    highlightScore: 0,
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
    highlightScore: 0,
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

// Destination trayectos must survive INTERNATIONAL (was wiped by showRoute:false).
const roadMatch = international.match(/var roadSegments = (\[[\s\S]*?\]);/);
assert.ok(roadMatch, "embeds roadSegments for Leaflet");
const embeddedRoads = JSON.parse(roadMatch[1]);
assert.ok(
  embeddedRoads.length > 0,
  "INTERNATIONAL destination map keeps computed road trayectos"
);

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
const navStart = international.indexOf('<nav class="mag-section-nav">');
assert.ok(navStart >= 0, "magazine section nav present");
const navChunk = international.slice(
  navStart,
  international.indexOf("</nav>", navStart)
);
const hrefPos = (hash) => navChunk.indexOf(`href="${hash}"`);
const navMap = hrefPos("#mapa");
const navTrip = hrefPos("#cronologia");
const navGal = hrefPos("#galeria");
const navGuide = hrefPos("#guia");
assert.ok(navGal >= 0 && (navGuide < 0 || navGal < navGuide), "nav: Galería before Guía");
assert.ok(navTrip >= 0 && navTrip < navGal, "nav: El viaje before Galería");
if (navMap >= 0) {
  assert.ok(navMap < navTrip, "nav: Mapa before El viaje (INTERNATIONAL)");
}
// Tabs must follow the same order as body sections.
assert.ok(
  (navMap < 0 || navMap < navTrip) && navTrip < navGal,
  "nav order mirrors body: map → El viaje → Galería"
);

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
assert.equal(cityProfile.mapConfig.showRoute, true);
assert.equal(cityProfile.mapConfig.emphasis, "pois");
assert.ok(!cityProfile.sectionOrder.includes("journal"), "typology has no separate journal slot");

const intlProfile = getTypologyProfile("INTERNATIONAL");
assert.equal(intlProfile.mapConfig.showRoute, true);
assert.equal(intlProfile.mapConfig.showDaySidebar, true);

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


// ZIP-friendly relative src: photos/maps must render on file:// without boot JS
assert.ok(
  /<img[^>]+src="photos\/\d+-thumb\.webp"/.test(unified) ||
    /<img[^>]+src="photos\/\d+\.webp"/.test(unified) ||
    /src="photos\//.test(unified),
  "exported HTML img tags include relative photo src for ZIP/file://"
);
const exportSrcImgs = [...unified.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
const dataExportImgs = exportSrcImgs.filter((tag) => tag.includes("data-export-src"));
assert.ok(dataExportImgs.length > 0, "has data-export-src images");
assert.ok(
  dataExportImgs.every((tag) => /\ssrc="/.test(tag)),
  "every data-export-src img also has src= for file:// ZIP"
);
assert.ok(
  international.includes('location.protocol === "file:"') ||
    international.includes("location.protocol === \"file:\""),
  "map prefers static fallback on file:// protocol"
);
assert.ok(
  international.includes(".map-canvas--hidden") &&
    !international.includes("#map.map-canvas--hidden"),
  "map hide class applies to all map canvases"
);
if (international.includes("map-static-fallback")) {
  assert.ok(
    /map-static-fallback"[^>]*\ssrc="/.test(international) ||
      /class="map-static-fallback"[^>]*src="/.test(international),
    "static map fallback includes src for ZIP"
  );
}

console.log("export-html ok", {
  internationalDualStatic: true,
  video: true,
  beachOrder: true,
  unifiedStory: true,
});
