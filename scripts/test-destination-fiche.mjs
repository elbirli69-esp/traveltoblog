import test from "node:test";
import assert from "node:assert/strict";
import {
  destinationFicheFromTravel,
  destinationFichePromptAddon,
  hasDestinationFiche,
  normalizeDestinationThemes,
  serializeDestinationThemes,
} from "../src/lib/destination-fiche.ts";
import { buildTravelBlogVoiceBlock } from "../src/lib/ai-blog-voice.ts";
import { buildBlogCompleteness } from "../src/lib/blog-completeness.ts";

test("normalizeDestinationThemes caps at 3 and dedupes", () => {
  const themes = normalizeDestinationThemes([
    "Historia",
    " historia ",
    "Comida",
    "Barrios",
    "Extra",
  ]);
  assert.deepEqual(themes, ["Historia", "Comida", "Barrios"]);
});

test("serialize/parse roundtrip", () => {
  const json = serializeDestinationThemes(["Historia", "Comida"]);
  assert.equal(json, '["Historia","Comida"]');
  const fiche = destinationFicheFromTravel({
    destinationName: " Cracovia ",
    destinationThemes: json,
  });
  assert.equal(fiche.name, "Cracovia");
  assert.deepEqual(fiche.themes, ["Historia", "Comida"]);
  assert.ok(hasDestinationFiche(fiche));
});

test("destinationFichePromptAddon empty when no fiche", () => {
  assert.equal(destinationFichePromptAddon(null), "");
  assert.equal(
    destinationFichePromptAddon({ name: null, themes: [] }),
    ""
  );
});

test("destinationFichePromptAddon includes name and themes", () => {
  const addon = destinationFichePromptAddon({
    name: "Cracovia",
    themes: ["Historia", "Comida"],
  });
  assert.match(addon, /FICHA DESTINO/);
  assert.match(addon, /Cracovia/);
  assert.match(addon, /Historia/);
});

test("voice block mentions fiche themes when present", () => {
  const block = buildTravelBlogVoiceBlock({
    destination: { name: "Cracovia", themes: ["Barrios"] },
  });
  assert.match(block, /Cracovia|Barrios|ficha destino/i);
});

test("completeness skips destination_context when fiche set", () => {
  const base = {
    title: "Viaje",
    journalBrief: null,
    startDate: null,
    endDate: null,
    photos: Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      selected: true,
      exifDateTime: "2026-06-11T12:00:00.000Z",
      latitude: null,
      longitude: null,
      placeId: null,
      photoNoteCount: 1,
    })),
    places: [],
    dayNotes: [],
    tripNoteCount: 0,
    personalNoteChars: 200,
  };
  const without = buildBlogCompleteness(base);
  assert.ok(without.gaps.some((g) => g.code === "destination_context"));
  assert.ok(
    without.gaps.some((g) => g.actionKind === "destination_fiche")
  );

  const withFiche = buildBlogCompleteness({
    ...base,
    destinationName: "Cracovia",
    destinationThemes: ["Historia"],
  });
  assert.ok(!withFiche.gaps.some((g) => g.code === "destination_context"));
});
