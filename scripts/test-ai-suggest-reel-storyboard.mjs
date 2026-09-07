import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStoryboardCandidates,
  buildStoryboardSystemPrompt,
  buildStoryboardUserPrompt,
  hasUsableReelStoryboardSeed,
  heuristicStoryboard,
  normalizeReelStoryboardSeed,
  parseStoryboardResponse,
  REEL_STORYBOARD_SEED_MIN_CHARS,
  slotCountForDuration,
} from "../src/lib/ai-suggest-reel-storyboard.ts";

test("slotCountForDuration matches soft targets", () => {
  assert.equal(slotCountForDuration(15), 6);
  assert.equal(slotCountForDuration(30), 10);
  assert.equal(slotCountForDuration(60), 20);
});

test("reel storyboard seed min length gate", () => {
  assert.equal(hasUsableReelStoryboardSeed("corto"), false);
  assert.equal(
    hasUsableReelStoryboardSeed("a".repeat(REEL_STORYBOARD_SEED_MIN_CHARS)),
    true
  );
  assert.equal(normalizeReelStoryboardSeed("  hola   mundo  "), "hola mundo");
});

test("buildStoryboardCandidates filters day and ranks", () => {
  const candidates = buildStoryboardCandidates(
    [
      {
        id: "a",
        selected: true,
        exifDateTime: "2026-06-11T10:00:00.000Z",
        placeName: "Wawel",
        highlightScore: 9,
        comments: ["Muralla"],
      },
      {
        id: "b",
        selected: true,
        exifDateTime: "2026-06-12T10:00:00.000Z",
        placeName: "Otro",
        highlightScore: 5,
        comments: [],
      },
      {
        id: "c",
        selected: false,
        exifDateTime: "2026-06-11T12:00:00.000Z",
        highlightScore: 10,
        comments: [],
      },
    ],
    { dayKey: "2026-06-11", max: 10 }
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].photoId, "a");
});

test("heuristicStoryboard opens with transport start", () => {
  const frames = heuristicStoryboard(
    [
      {
        photoId: "mid",
        dayKey: "2026-06-11",
        placeName: "Plaza",
        highlightScore: 7,
        isTransportStart: false,
        isTransportEnd: false,
        existingCaption: null,
        priority: 3,
      },
      {
        photoId: "out",
        dayKey: "2026-06-11",
        placeName: null,
        highlightScore: 5,
        isTransportStart: true,
        isTransportEnd: false,
        existingCaption: null,
        priority: 2,
      },
      {
        photoId: "back",
        dayKey: "2026-06-15",
        placeName: null,
        highlightScore: 5,
        isTransportStart: false,
        isTransportEnd: true,
        existingCaption: null,
        priority: 2,
      },
    ],
    30
  );
  assert.equal(frames[0]?.photoId, "out");
  assert.equal(frames[frames.length - 1]?.photoId, "back");
});

test("parseStoryboardResponse rejects unknown ids", () => {
  const allowed = new Set(["a", "b"]);
  const frames = parseStoryboardResponse(
    {
      frames: [
        { photoId: "a", caption: "Hola" },
        { photoId: "evil" },
        { photoId: "b" },
        { photoId: "a" },
      ],
    },
    allowed,
    10
  );
  assert.deepEqual(
    frames?.map((f) => f.photoId),
    ["a", "b"]
  );
});

test("parseStoryboardResponse returns null for empty valid set", () => {
  assert.equal(
    parseStoryboardResponse({ frames: [{ photoId: "x" }] }, new Set(["a"]), 5),
    null
  );
});

test("storyboard prompts are seed-first blog voice and forbid inventing visuals", () => {
  const prompt = buildStoryboardSystemPrompt();
  assert.match(prompt, /semilla/i);
  assert.match(prompt, /BLOG/i);
  assert.match(prompt, /curiosidad/i);
  assert.match(prompt, /PROHIBIDO inventar/i);

  const user = buildStoryboardUserPrompt({
    travelTitle: "Krakow",
    userSeed: "Ritmo rápido comida y atardecer",
    durationSeconds: 30,
    maxFrames: 8,
    dayKey: "2026-06-11",
    brief: null,
    candidates: [
      {
        photoId: "a",
        dayKey: "2026-06-11",
        placeName: "Wawel",
        highlightScore: 8,
        isTransportStart: false,
        isTransportEnd: false,
        existingCaption: "Muralla",
        priority: 4,
      },
    ],
  });
  assert.match(user, /"semilla":"Ritmo rápido comida y atardecer"/);
  assert.match(user, /"photoId":"a"/);
});
