/**
 * Phase B: PDF look presets — catalog, match, merge, layout knobs.
 */
import assert from "node:assert/strict";
import { groundExportBriefHeuristically } from "../src/lib/export-brief.ts";
import { summarizePdfDirectives } from "../src/lib/export-directives.ts";
import {
  PDF_PRESET_CATALOG,
  getPdfPresetCatalogEntry,
  mergePdfDirectives,
  resolvePdfDirectivesForPreset,
  themeForPdfPreset,
  typePackForPdfPreset,
} from "../src/lib/export/pdf-preset-catalog.ts";
import {
  matchPdfPresetCatalog,
  namedPdfPresetInBrief,
} from "../src/lib/export/pdf-preset-match.ts";
import { planPdfPages } from "../src/lib/export-pdf-layout.ts";

assert.equal(PDF_PRESET_CATALOG.length, 5);
assert.ok(getPdfPresetCatalogEntry("pdf-classic"));
assert.equal(themeForPdfPreset("pdf-dark"), "dark-magazine");
assert.equal(typePackForPdfPreset("pdf-minimal"), "sans-clean");
assert.equal(typePackForPdfPreset("pdf-classic"), "serif-editorial");

const photoHeavy = resolvePdfDirectivesForPreset("pdf-photo");
assert.equal(photoHeavy.imageEmphasis, "high");
assert.equal(photoHeavy.preferFullBleed, "high");
assert.equal(photoHeavy.proseDensity, "low");

const merged = mergePdfDirectives(photoHeavy, {
  imageEmphasis: "high",
  proseDensity: "medium",
  preferFullBleed: "high",
  mosaicBias: "low",
});
assert.equal(merged.proseDensity, "medium");
assert.equal(merged.mosaicBias, "low");

assert.equal(namedPdfPresetInBrief("quiero el preset guía"), "pdf-guide");
assert.equal(namedPdfPresetInBrief("pdf dark revista oscura"), "pdf-dark");

const photoBrief = groundExportBriefHeuristically(
  "Poca prosa, fotos grandes a sangre y muchos mosaicos",
  { target: "pdf" }
);
assert.ok(photoBrief.pdf);
const photoMatch = matchPdfPresetCatalog({
  brief: "Poca prosa, fotos grandes a sangre y muchos mosaicos",
  directives: photoBrief.pdf,
  uiPreset: "pdf-classic",
});
assert.equal(photoMatch.suggestedPresetId, "pdf-photo");
assert.equal(photoMatch.differsFromUi, true);

const summary = summarizePdfDirectives(photoHeavy);
assert.ok(summary.length > 10);

function fakeCtx(directives) {
  const photos = [];
  for (let d = 0; d < 3; d++) {
    for (let i = 0; i < 6; i++) {
      photos.push({
        id: `d${d}-p${i}`,
        url: `/x/${d}-${i}.jpg`,
        filename: `${d}-${i}.jpg`,
        imagePath: `photos/${d}-${i}.jpg`,
        bleedImagePath: `photos/${d}-${i}-bleed.jpg`,
        latitude: 40 + d * 0.01,
        longitude: -3 + i * 0.01,
        exifDateTime: new Date(`2024-06-0${d + 1}T1${i}:00:00Z`),
        alias: "Ada",
        placeName: null,
        highlightScore: i === 0 ? 9 : 4,
        notes: [],
      });
    }
  }
  return {
    travel: {
      id: "t1",
      title: "Test",
      startDate: new Date("2024-06-01"),
      endDate: new Date("2024-06-03"),
      journalMarkdown: "## Día 1\nHola\n\n## Día 2\nMás\n\n## Día 3\nFin",
    },
    users: [{ alias: "Ada" }],
    photos,
    notes: [],
    format: "a4-landscape",
    template: "classic",
    pdfDirectives: directives,
  };
}

const photoPages = planPdfPages(
  fakeCtx(resolvePdfDirectivesForPreset("pdf-photo"))
);
const minimalPages = planPdfPages(
  fakeCtx(resolvePdfDirectivesForPreset("pdf-minimal"))
);

const countKind = (pages, kind) => pages.filter((p) => p.kind === kind).length;
const photoBleeds = countKind(photoPages, "full-bleed");
const minimalBleeds = countKind(minimalPages, "full-bleed");
const photoMosaics = countKind(photoPages, "mosaic");
const minimalMosaics = countKind(minimalPages, "mosaic");

assert.ok(
  photoBleeds + photoMosaics > minimalBleeds + minimalMosaics,
  `photo look should favor bleed/mosaic (${photoBleeds}+${photoMosaics} vs ${minimalBleeds}+${minimalMosaics})`
);

console.log("test-pdf-preset-catalog: ok", {
  photoBleeds,
  minimalBleeds,
  photoMosaics,
  minimalMosaics,
  suggested: photoMatch.suggestedPresetId,
});
