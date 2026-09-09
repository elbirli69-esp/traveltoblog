import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlaceNoteSuggestContext,
  buildPlaceNoteSystemPrompt,
  buildPlaceNoteUserPrompt,
  hasUsablePlaceNoteSeed,
  heuristicPlaceNote,
  normalizePlaceNoteSeed,
  parsePlaceNoteTone,
  PLACE_NOTE_SEED_MIN_CHARS,
} from "../src/lib/ai-suggest-place-note.ts";
import { sanitizeSuggestionText } from "../src/lib/ai-suggest-photo-note.ts";

test("parsePlaceNoteTone defaults to neutro", () => {
  assert.equal(parsePlaceNoteTone("poetico"), "poetico");
  assert.equal(parsePlaceNoteTone("nope"), "neutro");
});

test("place note seed min length gate", () => {
  assert.equal(hasUsablePlaceNoteSeed("corta"), false);
  assert.equal(
    hasUsablePlaceNoteSeed("a".repeat(PLACE_NOTE_SEED_MIN_CHARS)),
    true
  );
  assert.equal(normalizePlaceNoteSeed("  hola   museo  "), "hola museo");
});

test("heuristic keeps seed and anchors place name", () => {
  const ctx = buildPlaceNoteSuggestContext({
    travelTitle: "Krakow 2026",
    authorAlias: "Irene",
    userSeed: "Cola larga pero mereció la pena",
    placeName: "Wawel",
    placeType: "VIEWPOINT",
    existingNotes: [],
    tone: "neutro",
  });
  const text = heuristicPlaceNote(ctx);
  assert.match(text, /Cola larga/i);
  assert.match(text, /Wawel/);
});

test("heuristic without seed does not invent visit anecdotes", () => {
  const ctx = buildPlaceNoteSuggestContext({
    travelTitle: "Krakow 2026",
    authorAlias: "Irene",
    userSeed: "",
    placeName: "Kazimierz",
    placeType: "OTHER",
    existingNotes: [],
    tone: "neutro",
  });
  const text = heuristicPlaceNote(ctx);
  assert.match(text, /Kazimierz/i);
  assert.doesNotMatch(text, /gueto|cena|entradas/i);
});

test("place note prompts require name anchor and forbid invented visits", () => {
  const prompt = buildPlaceNoteSystemPrompt();
  assert.match(prompt, /NOMBRE del lugar/i);
  assert.match(prompt, /COMPLEMENTAR/i);
  assert.match(prompt, /NO inventes/i);
  assert.match(prompt, /curiosidad/i);

  const ctx = buildPlaceNoteSuggestContext({
    travelTitle: "Viaje",
    authorAlias: "A",
    userSeed: "Café buenísimo en la plaza",
    placeName: "Rynek",
    placeType: "CAFE",
    existingNotes: ["Ya fuimos al mediodía"],
    tone: "neutro",
  });
  const user = buildPlaceNoteUserPrompt(ctx);
  assert.match(user, /"semilla":"Café buenísimo en la plaza"/);
  assert.match(user, /"nombre":"Rynek"/);
  assert.match(user, /"tipo":"CAFE"/);
  assert.match(user, /Ya fuimos al mediodía/);
});

test("sanitizeSuggestionText still works for place drafts", () => {
  assert.equal(sanitizeSuggestionText('"Hola Rynek"'), "Hola Rynek");
});
