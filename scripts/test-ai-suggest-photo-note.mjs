import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPhotoNoteSuggestContext,
  buildPhotoNoteSystemPrompt,
  heuristicPhotoNote,
  isPhotoNoteContextSparse,
  parsePhotoNoteTone,
  pickNearbyPlaceNames,
  sanitizeSuggestionText,
} from "../src/lib/ai-suggest-photo-note.ts";
import { aiSuggestionsEnabled } from "../src/lib/ai-suggestions-enabled.ts";

test("parsePhotoNoteTone defaults to neutro", () => {
  assert.equal(parsePhotoNoteTone("poetico"), "poetico");
  assert.equal(parsePhotoNoteTone("nope"), "neutro");
});

test("sparse context detection", () => {
  assert.equal(
    isPhotoNoteContextSparse({
      place: null,
      existingNotes: [],
      exifLocal: null,
      nearbyPlaceNames: [],
    }),
    true
  );
  assert.equal(
    isPhotoNoteContextSparse({
      place: { name: "Wawel", type: "VIEWPOINT" },
      existingNotes: [],
      exifLocal: null,
      nearbyPlaceNames: [],
    }),
    false
  );
});

test("heuristic includes place name", () => {
  const ctx = buildPhotoNoteSuggestContext({
    travelTitle: "Krakow 2026",
    authorAlias: "Irene",
    exifDateTime: "2026-06-11T10:00:00.000Z",
    place: { name: "Wawel", type: "VIEWPOINT" },
    existingNotes: [],
    nearbyPlaceNames: [],
    tone: "neutro",
  });
  const text = heuristicPhotoNote(ctx);
  assert.match(text, /Wawel/);
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

test("photo note system prompt forbids inventing visuals", () => {
  const prompt = buildPhotoNoteSystemPrompt();
  assert.match(prompt, /NO ves la imagen/i);
  assert.match(prompt, /PROHIBIDO inventar/i);
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
