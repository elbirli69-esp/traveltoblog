import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPhotoNoteSuggestContext,
  buildPhotoNoteSystemPrompt,
  buildPhotoNoteUserPrompt,
  hasUsablePhotoNoteSeed,
  heuristicPhotoNote,
  normalizePhotoNoteSeed,
  parsePhotoNoteTone,
  PHOTO_NOTE_SEED_MIN_CHARS,
  pickNearbyPlaceNames,
  sanitizeSuggestionText,
} from "../src/lib/ai-suggest-photo-note.ts";
import { aiSuggestionsEnabled } from "../src/lib/ai-suggestions-enabled.ts";

test("parsePhotoNoteTone defaults to neutro", () => {
  assert.equal(parsePhotoNoteTone("poetico"), "poetico");
  assert.equal(parsePhotoNoteTone("nope"), "neutro");
});

test("user seed min length gate", () => {
  assert.equal(hasUsablePhotoNoteSeed("corta"), false);
  assert.equal(hasUsablePhotoNoteSeed("a".repeat(PHOTO_NOTE_SEED_MIN_CHARS)), true);
  assert.equal(normalizePhotoNoteSeed("  hola   mundo  "), "hola mundo");
});

test("heuristic keeps seed as core and may add place", () => {
  const ctx = buildPhotoNoteSuggestContext({
    travelTitle: "Krakow 2026",
    authorAlias: "Irene",
    userSeed: "Café en terraza con vistas al río",
    exifDateTime: "2026-06-11T10:00:00.000Z",
    place: { name: "Wawel", type: "VIEWPOINT" },
    existingNotes: [],
    nearbyPlaceNames: [],
    tone: "neutro",
  });
  const text = heuristicPhotoNote(ctx);
  assert.match(text, /Café en terraza/i);
  assert.match(text, /Wawel/);
});

test("heuristic without seed does not invent scenery", () => {
  const ctx = buildPhotoNoteSuggestContext({
    travelTitle: "Krakow 2026",
    authorAlias: "Irene",
    userSeed: "",
    exifDateTime: null,
    place: { name: "Kazimierz", type: "OTHER" },
    existingNotes: [],
    nearbyPlaceNames: [],
    tone: "neutro",
  });
  const text = heuristicPhotoNote(ctx);
  assert.match(text, /Kazimierz|descripción/i);
  assert.doesNotMatch(text, /gueto|puente|película/i);
});

test("pickNearbyPlaceNames respects radius and linked place", () => {
  const names = pickNearbyPlaceNames({
    latitude: 50.05,
    longitude: 19.93,
    linkedPlaceId: "p1",
    places: [
      { id: "p1", name: "Linked", latitude: 50.05, longitude: 19.93 },
      { id: "p2", name: "Cerca", latitude: 50.0505, longitude: 19.9305 },
      { id: "p3", name: "Lejos", latitude: 51.0, longitude: 20.0 },
    ],
  });
  assert.deepEqual(names, ["Cerca"]);
});

test("sanitizeSuggestionText strips wrappers", () => {
  assert.equal(sanitizeSuggestionText('"Hola mundo"'), "Hola mundo");
  assert.equal(sanitizeSuggestionText("Nota: algo"), "algo");
});

test("photo note prompts are seed-first and forbid inventing visuals", () => {
  const prompt = buildPhotoNoteSystemPrompt();
  assert.match(prompt, /semilla/i);
  assert.match(prompt, /COMPLEMENTAR/i);
  assert.match(prompt, /NO ves la imagen/i);
  assert.match(prompt, /PROHIBIDO inventar/i);

  const ctx = buildPhotoNoteSuggestContext({
    travelTitle: "Viaje",
    authorAlias: "A",
    userSeed: "Puente de madera sobre el canal",
    exifDateTime: null,
    place: null,
    existingNotes: [],
    nearbyPlaceNames: [],
    tone: "neutro",
  });
  const user = buildPhotoNoteUserPrompt(ctx);
  assert.match(user, /"semilla":"Puente de madera sobre el canal"/);
});

test("aiSuggestionsEnabled respects AI_SUGGESTIONS=0", () => {
  const prev = process.env.AI_SUGGESTIONS;
  process.env.AI_SUGGESTIONS = "0";
  assert.equal(aiSuggestionsEnabled(), false);
  process.env.AI_SUGGESTIONS = "1";
  assert.equal(aiSuggestionsEnabled(), true);
  if (prev === undefined) delete process.env.AI_SUGGESTIONS;
  else process.env.AI_SUGGESTIONS = prev;
});
