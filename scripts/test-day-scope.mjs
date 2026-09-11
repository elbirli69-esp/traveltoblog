import assert from "node:assert/strict";
import {
  extractDayChapterMarkdown,
  filterDayJournalMarkdownToKeys,
  upsertDayChapterMarkdown,
} from "../src/lib/journal-day-chapter.ts";
import {
  expandDayRange,
  parseDayRangeBounds,
} from "../src/lib/export-day-scope.ts";
import { formatDateKey } from "../src/lib/travel-dates.ts";

const day1 = "2026-06-10";
const day2 = "2026-06-11";
const h1 = formatDateKey(day1, "long");
const h2 = formatDateKey(day2, "long");

let md = upsertDayChapterMarkdown(
  null,
  day1,
  `### ${h1}\n\nFree tour por el casco.\n\n![Plaza](/a.jpg)\n`,
  "Cracovia"
);
assert.match(md, new RegExp(h1));
assert.match(md, /Free tour/);

md = upsertDayChapterMarkdown(
  md,
  day2,
  `Minas de sal y mucha profundidad.`,
  "Cracovia"
);
assert.match(md, new RegExp(h2));
assert.match(md, /Minas de sal/);

const chapter1 = extractDayChapterMarkdown(md, day1);
assert.ok(chapter1 && chapter1.includes("Free tour"));
assert.ok(!chapter1.includes("Minas de sal"));

const onlyDay2 = filterDayJournalMarkdownToKeys(md, [day2], "Cracovia");
assert.ok(onlyDay2.includes("Minas"));
assert.ok(!onlyDay2.includes("Free tour"));

assert.deepEqual(expandDayRange("2026-06-10", "2026-06-12"), [
  "2026-06-10",
  "2026-06-11",
  "2026-06-12",
]);
assert.deepEqual(parseDayRangeBounds("2026-06-12", "2026-06-10"), {
  dayFrom: "2026-06-10",
  dayTo: "2026-06-12",
});
assert.equal(parseDayRangeBounds("nope", null), null);

console.log("day-scope journal/export helpers ok");
