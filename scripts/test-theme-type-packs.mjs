/**
 * Phase A: ThemePack + TypePack — same template, different packs → different CSS;
 * structure lock still intact for dark brief on magazine.
 */
import assert from "node:assert/strict";
import {
  THEME_PACK_CATALOG,
  defaultThemePackForTemplate,
  themePackCss,
  suggestThemePackFromBrief,
} from "../src/lib/export/theme-packs.ts";
import {
  TYPE_PACK_CATALOG,
  defaultTypePackForTemplate,
  typePackCss,
  suggestTypePackFromBrief,
} from "../src/lib/export/type-packs.ts";
import { buildExportHtml } from "../src/lib/export-html.ts";
import { groundExportBriefHeuristically } from "../src/lib/export-brief.ts";
import {
  detectExplicitStructureChange,
  matchTemplateCatalog,
} from "../src/lib/export/template-match.ts";

assert.equal(THEME_PACK_CATALOG.length, 5);
assert.equal(TYPE_PACK_CATALOG.length, 3);

assert.equal(defaultThemePackForTemplate("magazine"), "light-paper");
assert.equal(defaultThemePackForTemplate("dark-photo-journey"), "dark-cinema");
assert.equal(defaultTypePackForTemplate("magazine"), "serif-editorial");
assert.equal(defaultTypePackForTemplate("visual-journey"), "sans-clean");

const paperCss = themePackCss("light-paper");
const sunsetCss = themePackCss("warm-sunset");
assert.ok(paperCss.includes("theme-pack: light-paper"));
assert.ok(sunsetCss.includes("theme-pack: warm-sunset"));
assert.notEqual(paperCss, sunsetCss);
assert.ok(paperCss.includes("--bg:"));
assert.ok(sunsetCss.includes("--accent:"));

const serifCss = typePackCss("serif-editorial");
const sansCss = typePackCss("sans-clean");
assert.ok(serifCss.includes("type-pack: serif-editorial"));
assert.ok(sansCss.includes("type-pack: sans-clean"));
assert.notEqual(serifCss, sansCss);
assert.ok(serifCss.includes("Georgia"));
assert.ok(sansCss.includes("Segoe UI"));

assert.equal(suggestThemePackFromBrief("quiero atardecer cálido"), "warm-sunset");
assert.equal(
  suggestThemePackFromBrief("modo oscuro cine"),
  "dark-cinema"
);
assert.equal(
  suggestTypePackFromBrief("tipografía editorial serif"),
  "serif-editorial"
);
assert.equal(
  suggestTypePackFromBrief("look moderno sans limpia"),
  "sans-clean"
);

const baseTravel = {
  id: "t1",
  title: "Pack Test Trip",
  startDate: new Date("2024-06-01"),
  endDate: new Date("2024-06-03"),
  journalMarkdown: "## Día 1\n\nPaseo.",
  travelType: null,
};

const users = [{ id: "u1", alias: "Ada", createdAt: new Date(), updatedAt: new Date() }];
const photos = [
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
    alias: "Ada",
    isTransportStart: false,
    isTransportEnd: false,
    highlightScore: 8,
  },
];

const htmlPaper = buildExportHtml({
  travel: baseTravel,
  users,
  photos,
  template: "magazine",
  themePack: "light-paper",
  typePack: "serif-editorial",
});
const htmlCoast = buildExportHtml({
  travel: baseTravel,
  users,
  photos,
  template: "magazine",
  themePack: "cool-coast",
  typePack: "sans-clean",
});

assert.ok(htmlPaper.includes('data-theme-pack="light-paper"'));
assert.ok(htmlCoast.includes('data-theme-pack="cool-coast"'));
assert.ok(htmlPaper.includes('data-type-pack="serif-editorial"'));
assert.ok(htmlCoast.includes('data-type-pack="sans-clean"'));
assert.ok(htmlPaper.includes("export-theme--light-paper"));
assert.ok(htmlCoast.includes("export-theme--cool-coast"));
assert.ok(htmlPaper.includes("export-type--serif-editorial"));
assert.ok(htmlCoast.includes("export-type--sans-clean"));
assert.ok(htmlPaper.includes("theme-pack: light-paper"));
assert.ok(htmlCoast.includes("theme-pack: cool-coast"));
assert.notEqual(htmlPaper, htmlCoast);

// Structure lock: dark brief on magazine stays magazine
const darkBrief = groundExportBriefHeuristically(
  "Quiero modo oscuro, fotos grandes y poca crónica",
  { target: "html" }
);
assert.equal(darkBrief.html?.theme, "dark");

const locked = matchTemplateCatalog({
  brief: "Quiero modo oscuro, fotos grandes y poca crónica",
  directives: darkBrief.html,
  uiTemplate: "magazine",
  lockStructure: true,
});
assert.equal(locked.suggestedTemplateId, "magazine");
assert.equal(locked.structureLocked, true);
assert.equal(
  detectExplicitStructureChange(
    "Quiero modo oscuro, fotos grandes",
    "magazine"
  ),
  false
);

// Dark brief suggests dark-cinema theme pack (look), not structure switch
assert.equal(
  suggestThemePackFromBrief("Quiero modo oscuro, fotos grandes"),
  "dark-cinema"
);

console.log("test-theme-type-packs: ok");
