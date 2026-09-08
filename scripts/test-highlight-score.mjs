import assert from "node:assert/strict";
import {
  clampHighlightScore,
  compareHighlightScore,
  computeReelPhotoPriority,
  exportHighlightTier,
  highlightDelta,
  HIGHLIGHT_SCORE_DEFAULT,
  resolveHighlightScore,
} from "../src/lib/highlight-score.ts";

assert.equal(HIGHLIGHT_SCORE_DEFAULT, 0);
assert.equal(clampHighlightScore(5), 5);
assert.equal(clampHighlightScore(99), 10);
assert.equal(clampHighlightScore(-3), 0);
assert.equal(clampHighlightScore("nope"), 0);
assert.equal(resolveHighlightScore(undefined), 0);
assert.equal(resolveHighlightScore(null), 0);
assert.equal(highlightDelta(5), 0);
assert.equal(highlightDelta(8), 3);
assert.equal(highlightDelta(0), -5);

assert.ok(compareHighlightScore(8, 5) < 0);
assert.ok(compareHighlightScore(0, 5) > 0);
assert.ok(compareHighlightScore(0, 1) > 0);

const hi = computeReelPhotoPriority({ highlightScore: 9, hasCaption: true });
const mid = computeReelPhotoPriority({ highlightScore: 5, hasCaption: true });
const lo = computeReelPhotoPriority({ highlightScore: 2, hasCaption: true });
const unscored = computeReelPhotoPriority({ highlightScore: 0, hasCaption: true });
assert.ok(hi > mid);
assert.ok(mid > lo);
// Unscored is baseline (0 boost); intentional low (2) is below mid but may sit near unscored.
assert.ok(mid > unscored);
assert.ok(hi > unscored);

assert.equal(exportHighlightTier(8), "featured");
assert.equal(exportHighlightTier(5), "normal");
assert.equal(exportHighlightTier(0), "normal");
assert.equal(exportHighlightTier(1), "minimal");
assert.equal(exportHighlightTier(3), "subtle");

console.log("highlight-score ok");
