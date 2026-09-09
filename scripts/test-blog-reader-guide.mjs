import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReaderGuideHtml,
  READER_GUIDE_MAX_ITEMS,
  selectReaderGuideItems,
} from "../src/lib/export/reader-guide.ts";
import { buildExportHtml } from "../src/lib/export-html.ts";

test("selectReaderGuideItems prefers tips then highlight, caps at 5", () => {
  const places = [
    { name: "A", type: "MUSEUM", comment: null, highlightScore: 9 },
    { name: "B", type: "CAFE", comment: "Pedid el szarlotka", highlightScore: 4 },
    { name: "C", type: "VIEWPOINT", comment: "Subid al atardecer", highlightScore: 8 },
    { name: "D", type: "PARK", comment: null, highlightScore: 7 },
    { name: "E", type: "RESTAURANT", comment: "Reservad", highlightScore: 6 },
    { name: "F", type: "SHOP", comment: null, highlightScore: 10 },
    { name: "G", type: "HOTEL", comment: "Check-in tarde", highlightScore: 5 },
  ];
  const items = selectReaderGuideItems(places);
  assert.equal(items.length, READER_GUIDE_MAX_ITEMS);
  assert.deepEqual(
    items.map((i) => i.name),
    ["C", "E", "G", "B", "F"]
  );
  assert.ok(items.every((i) => places.some((p) => p.name === i.name)));
  assert.equal(items[0].tip, "Subid al atardecer");
});

test("selectReaderGuideItems never invents places", () => {
  assert.deepEqual(selectReaderGuideItems([]), []);
  const one = selectReaderGuideItems([
    { name: "Solo", type: "OTHER", comment: null, highlightScore: 0 },
  ]);
  assert.equal(one.length, 1);
  assert.equal(one[0].name, "Solo");
  assert.equal(one[0].tip, null);
});

test("buildReaderGuideHtml uses Si vais copy and ≤5 items", () => {
  const places = Array.from({ length: 8 }, (_, i) => ({
    name: `Lugar ${i}`,
    type: "VIEWPOINT",
    comment: i % 2 === 0 ? `Tip ${i}` : null,
    alias: "Ana",
    highlightScore: i,
  }));
  const html = buildReaderGuideHtml(places);
  assert.match(html, /Si vais, no os perdáis/);
  assert.match(html, /id="guia"/);
  assert.equal((html.match(/<li class="mag-reader-item">/g) || []).length, 5);
  assert.doesNotMatch(html, /Lugar inventado|Disney|Torre Eiffel/);
});

test("magazine export includes reader guide and public title", () => {
  const html = buildExportHtml({
    travel: {
      id: "t1",
      title: "Interno Krakow",
      startDate: new Date("2024-06-01"),
      endDate: new Date("2024-06-03"),
      journalMarkdown: "## Día 1\n\nHola.",
      travelType: "CITY_BREAK",
    },
    users: [{ id: "u1", alias: "Ana", createdAt: new Date(), updatedAt: new Date() }],
    photos: [
      {
        id: "p1",
        url: "/uploads/t1/p1.jpg",
        localPath: "photos/001.webp",
        thumbPath: "photos/001-thumb.webp",
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
    ],
    places: [
      {
        id: "pl1",
        name: "Wawel",
        type: "VIEWPOINT",
        latitude: 50.05,
        longitude: 19.93,
        comment: "Entrada por la puerta norte",
        alias: "Ana",
        highlightScore: 9,
      },
      {
        id: "pl2",
        name: "Rynek",
        type: "OTHER",
        latitude: 50.06,
        longitude: 19.94,
        comment: null,
        alias: "Ana",
        highlightScore: 7,
      },
    ],
    template: "magazine",
    publicTitle: "Cracovia: tres días entre torres",
    includeReaderGuide: true,
  });

  assert.match(html, /<title>Cracovia: tres días entre torres/);
  assert.match(html, /<h1>Cracovia: tres días entre torres<\/h1>/);
  assert.doesNotMatch(html, /<h1>Interno Krakow<\/h1>/);
  assert.match(html, /Si vais, no os perdáis/);
  assert.match(html, /Wawel/);
  assert.match(html, /Entrada por la puerta norte/);
  assert.match(html, /Rynek/);
  assert.equal(
    (html.match(/<li class="mag-reader-item">/g) || []).length,
    2
  );
});

test("includeReaderGuide false omits guide section", () => {
  const html = buildExportHtml({
    travel: {
      id: "t1",
      title: "Trip",
      startDate: null,
      endDate: null,
      journalMarkdown: null,
      travelType: null,
    },
    users: [{ id: "u1", alias: "Ana", createdAt: new Date(), updatedAt: new Date() }],
    photos: [],
    places: [
      {
        id: "pl1",
        name: "Café",
        type: "CAFE",
        latitude: 50,
        longitude: 19,
        comment: "Buen flat white",
        alias: "Ana",
      },
    ],
    template: "magazine",
    includeReaderGuide: false,
  });
  assert.doesNotMatch(html, /id="guia"/);
  assert.doesNotMatch(html, /Si vais/);
});
