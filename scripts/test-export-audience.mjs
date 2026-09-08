import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAudienceBrief,
  audienceIdFromBrief,
  EXPORT_AUDIENCE_OPTIONS,
  getExportAudiencePlan,
} from "../src/lib/export-audience.ts";

test("audience options cover blog album reel", () => {
  assert.deepEqual(
    EXPORT_AUDIENCE_OPTIONS.map((o) => o.id),
    ["blog-largo", "album", "reel"]
  );
});

test("blog-largo plans magazine html with reader guide", () => {
  const plan = getExportAudiencePlan("blog-largo");
  assert.ok(plan);
  assert.equal(plan.tab, "html");
  assert.equal(plan.html?.templateId, "magazine");
  assert.equal(plan.html?.includeReaderGuide, true);
  assert.match(plan.briefSeed, /blog largo/i);
});

test("album plans pdf-photo without requiring reel knobs", () => {
  const plan = getExportAudiencePlan("album");
  assert.ok(plan);
  assert.equal(plan.tab, "pdf");
  assert.equal(plan.pdf?.presetId, "pdf-photo");
  assert.equal(plan.reel, undefined);
});

test("reel plans punchy preset and video tab", () => {
  const plan = getExportAudiencePlan("reel");
  assert.ok(plan);
  assert.equal(plan.tab, "video");
  assert.equal(plan.reel?.presetId, "punchy-highlights");
  assert.equal(plan.reel?.durationSeconds, 30);
  assert.match(plan.briefSeed, /Instagram|Reel/i);
});

test("applyAudienceBrief merges without duplicating", () => {
  const seed = getExportAudiencePlan("reel")?.briefSeed;
  assert.ok(seed);
  assert.equal(applyAudienceBrief("", seed), seed);
  assert.equal(applyAudienceBrief(seed, seed), seed);
  const merged = applyAudienceBrief("Cuenta la tormenta", seed);
  assert.ok(merged.startsWith(seed));
  assert.match(merged, /tormenta/);
});

test("audienceIdFromBrief detects applied seeds", () => {
  const blog = getExportAudiencePlan("blog-largo")?.briefSeed;
  const album = getExportAudiencePlan("album")?.briefSeed;
  const reel = getExportAudiencePlan("reel")?.briefSeed;
  assert.ok(blog && album && reel);
  assert.equal(audienceIdFromBrief(blog), "blog-largo");
  assert.equal(audienceIdFromBrief(album), "album");
  assert.equal(audienceIdFromBrief(reel), "reel");
  assert.equal(audienceIdFromBrief("sin audiencia"), null);
});
