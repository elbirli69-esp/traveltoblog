import test from "node:test";
import assert from "node:assert/strict";
import {
  activeJournalIntentions,
  appendSeedStarter,
  briefFreeText,
  DAY_SEED_STARTERS,
  journalIntentionPromptAddon,
  JOURNAL_INTENTION_CHIPS,
  photoSeedPlaceholder,
  photoSeedStarters,
  toggleJournalIntention,
} from "../src/lib/blog-seed-prompts.ts";

test("photoSeedPlaceholder varies by place type", () => {
  assert.match(photoSeedPlaceholder("RESTAURANT"), /Pierogi|local/i);
  assert.match(photoSeedPlaceholder("VIEWPOINT"), /vistas|atardecer/i);
  assert.match(photoSeedPlaceholder(null), /terraza|río/i);
});

test("photoSeedStarters includes typed chips and with-whom", () => {
  const rest = photoSeedStarters("RESTAURANT");
  assert.ok(rest.some((s) => s.id === "rest-dish"));
  assert.ok(rest.some((s) => s.id === "def-with"));
  const def = photoSeedStarters(undefined);
  assert.ok(def.some((s) => s.id === "def-scene"));
});

test("appendSeedStarter avoids duplicates and joins beats", () => {
  assert.equal(appendSeedStarter("", "Por la mañana "), "Por la mañana ");
  assert.equal(
    appendSeedStarter("Por la mañana casco.", "Por la tarde "),
    "Por la mañana casco. Por la tarde "
  );
  assert.equal(
    appendSeedStarter("Por la mañana ", "Por la mañana "),
    "Por la mañana "
  );
});

test("DAY_SEED_STARTERS cover morning afternoon dinner", () => {
  assert.deepEqual(
    DAY_SEED_STARTERS.map((s) => s.id),
    ["day-morning", "day-afternoon", "day-dinner"]
  );
});

test("toggleJournalIntention adds and removes brief lines", () => {
  let brief = "";
  brief = toggleJournalIntention(brief, "tips");
  const tipsLine = JOURNAL_INTENTION_CHIPS.find((c) => c.id === "tips")?.briefLine;
  assert.ok(tipsLine);
  assert.ok(brief.includes(tipsLine));
  assert.deepEqual(activeJournalIntentions(brief), ["tips"]);
  brief = toggleJournalIntention(brief, "contexto");
  assert.deepEqual(activeJournalIntentions(brief).sort(), ["contexto", "tips"]);
  brief = toggleJournalIntention(brief, "tips");
  assert.deepEqual(activeJournalIntentions(brief), ["contexto"]);
});

test("briefFreeText strips intention lines", () => {
  const chip = JOURNAL_INTENTION_CHIPS[0];
  assert.ok(chip);
  const brief = `${chip.briefLine}\nCuenta la tormenta`;
  assert.equal(briefFreeText(brief), "Cuenta la tormenta");
});

test("journalIntentionPromptAddon emits guidance for active chips", () => {
  const brief = toggleJournalIntention("", "lirico");
  const addon = journalIntentionPromptAddon(brief);
  assert.match(addon, /INTENCIÓN EDITORIAL/);
  assert.match(addon, /evocador/);
  assert.equal(journalIntentionPromptAddon(""), "");
});
