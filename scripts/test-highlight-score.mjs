import assert from "node:assert/strict";
import {
  clampHighlightScore,
  compareHighlightScore,
  computeReelPhotoPriority,
  exportHighlightTier,
  highlightDelta,
} from "../src/lib/highlight-score.ts";

assert.equal(clampHighlightScore(5), 5);
assert.equal(clampHighlightScore(99), 10);
assert.equal(clampHighlightScore(-3), 0);
assert.equal(highlightDelta(5), 0);
assert.equal(highlightDelta(8), 3);

assert.ok(compareHighlightScore(8, 5) < 0);
assert.ok(compareHighlightScore(0, 5) > 0);
assert.ok(compareHighlightScore(0, 1) > 0);

const hi = computeReelPhotoPriority({ highlightScore: 9, hasCaption: true });
const lo = computeReelPhotoPriority({ highlightScore: 2, hasCaption: true });
const zero = computeReelPhotoPriority({ highlightScore: 0, hasCaption: true });
assert.ok(hi > lo);
assert.ok(lo > zero);

assert.equal(exportHighlightTier(8), "featured");
assert.equal(exportHighlightTier(5), "normal");
assert.equal(exportHighlightTier(0), "minimal");

console.log("highlight-score ok");
