import assert from "node:assert/strict";
import { groundExportBriefHeuristically } from "../src/lib/export-brief.ts";
import {
  REEL_PRESET_CATALOG,
  getReelPresetCatalogEntry,
  mergeReelDirectives,
  resolveReelDirectivesForPreset,
} from "../src/lib/export/reel-preset-catalog.ts";
import {
  matchReelPresetCatalog,
  namedReelPresetInBrief,
} from "../src/lib/export/reel-preset-match.ts";

assert.equal(REEL_PRESET_CATALOG.length, 6);
assert.ok(getReelPresetCatalogEntry("balanced-story"));
assert.equal(
  getReelPresetCatalogEntry("textless-photos")?.defaultDirectives.captionMode,
  "none"
);

// calm brief → calm-story
const calm = groundExportBriefHeuristically(
  "Quiero pocas fotos tranquilas, casi sin prisa, con fundidos suaves y textos narrativos",
  { target: "reel", durationSeconds: 30 }
);
assert.equal(calm.reel?.pacing, "calm");
const calmMatch = matchReelPresetCatalog({
  brief: "pocas fotos tranquilas, fundidos suaves, textos narrativos",
  directives: calm.reel,
  uiPreset: "balanced-story",
});
assert.equal(calmMatch.suggestedPresetId, "calm-story");
assert.equal(calmMatch.differsFromUi, true);
assert.ok(calmMatch.reasons.some((r) => /calm|suave|narrativ|poca/i.test(r)));

// textless
const mute = groundExportBriefHeuristically(
  "Sin texto, solo imagenes, mute text",
  { target: "reel", durationSeconds: 30 }
);
assert.equal(mute.reel?.captionMode, "none");
const muteMatch = matchReelPresetCatalog({
  brief: "sin texto, solo imagenes",
  directives: mute.reel,
  uiPreset: "balanced-story",
});
assert.equal(muteMatch.suggestedPresetId, "textless-photos");

// punchy
const punchy = groundExportBriefHeuristically(
  "Ritmo rapido, textos cortos, muchas fotos, cortes rapidos",
  { target: "reel", durationSeconds: 30 }
);
assert.equal(punchy.reel?.pacing, "punchy");
const punchyMatch = matchReelPresetCatalog({
  brief: "ritmo rapido, textos cortos, muchas fotos",
  directives: punchy.reel,
  uiPreset: "balanced-story",
});
assert.equal(punchyMatch.suggestedPresetId, "punchy-highlights");

// place only
const places = groundExportBriefHeuristically(
  "Solo nombres de lugares, place only",
  { target: "reel", durationSeconds: 30 }
);
assert.equal(places.reel?.captionMode, "placeOnly");
const placeMatch = matchReelPresetCatalog({
  brief: "solo nombres de lugares",
  directives: places.reel,
  uiPreset: "balanced-story",
});
assert.ok(
  placeMatch.suggestedPresetId === "place-labels" ||
    placeMatch.suggestedPresetId === "map-pulse"
);

// map cue prefers map-pulse when captions are place-only-ish
const mapBrief = groundExportBriefHeuristically(
  "Quiero el mapa protagonista del recorrido, solo nombres de sitios, ritmo dinamico",
  { target: "reel", durationSeconds: 30 }
);
const mapMatch = matchReelPresetCatalog({
  brief: "mapa protagonista del recorrido, solo nombres de sitios, ritmo dinamico",
  directives: mapBrief.reel,
  uiPreset: "balanced-story",
});
assert.equal(mapMatch.suggestedPresetId, "map-pulse");

const mapOnly = matchReelPresetCatalog({
  brief: "preset mapa, recorrido gps protagonista",
  directives: mapBrief.reel,
  uiPreset: "balanced-story",
});
assert.equal(mapOnly.suggestedPresetId, "map-pulse");

// named preset wins
assert.equal(namedReelPresetInBrief("usa el preset Solo fotos"), "textless-photos");
const named = matchReelPresetCatalog({
  brief: "usa el preset Solo fotos aunque diga ritmo rapido",
  directives: punchy.reel,
  uiPreset: "punchy-highlights",
});
assert.equal(named.suggestedPresetId, "textless-photos");

// merge: brief overrides preset defaults
const merged = resolveReelDirectivesForPreset("calm-story", {
  pacing: "punchy",
  captionMode: "short",
  captionPlacement: "bottom",
  transitionStyle: "mixed",
  heroBias: "medium",
});
assert.equal(merged.pacing, "punchy");
assert.equal(merged.captionMode, "short");
// fields only on preset remain if overlay had them from defaults... overlay fully provided here

const soft = mergeReelDirectives(
  getReelPresetCatalogEntry("calm-story").defaultDirectives,
  { pacing: "punchy", captionMode: "short", captionPlacement: "bottom", transitionStyle: "fastCut", heroBias: "low" }
);
assert.equal(soft.pacing, "punchy");
assert.equal(soft.transitionStyle, "fastCut");
assert.equal(soft.captionPlacement, "bottom");

// empty-ish balanced stays on ui when already balanced-story
const balanced = groundExportBriefHeuristically("un reel normal", {
  target: "reel",
  durationSeconds: 30,
});
const stay = matchReelPresetCatalog({
  brief: "un reel normal",
  directives: balanced.reel,
  uiPreset: "balanced-story",
});
assert.equal(stay.suggestedPresetId, "balanced-story");
assert.equal(stay.differsFromUi, false);

console.log("reel-preset-catalog ok", {
  calm: calmMatch.suggestedPresetId,
  mute: muteMatch.suggestedPresetId,
  punchy: punchyMatch.suggestedPresetId,
  map: mapMatch.suggestedPresetId,
});
