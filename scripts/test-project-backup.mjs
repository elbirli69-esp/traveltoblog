import test from "node:test";
import assert from "node:assert/strict";
import {
  parseProjectManifest,
  PROJECT_BACKUP_FORMAT,
  PROJECT_BACKUP_VERSION,
} from "../src/lib/project-backup-format.ts";

test("parseProjectManifest accepts v1 backups", () => {
  const manifest = parseProjectManifest({
    format: PROJECT_BACKUP_FORMAT,
    version: PROJECT_BACKUP_VERSION,
    exportedAt: "2026-09-07T00:00:00.000Z",
    travel: {
      title: "Krakow 2026",
      startDate: null,
      endDate: null,
      journalMarkdown: "# Hola",
      journalGeneratedAt: null,
      journalMarkdownPrevious: null,
      journalBrief: null,
      exportBrief: null,
      exportBriefCache: null,
      htmlTemplateId: null,
      htmlThemePackId: null,
      htmlTypePackId: null,
      reelPresetId: null,
      pdfPresetId: null,
      travelType: null,
      creatorAlias: "Irene",
      startPhotoId: null,
      endPhotoId: null,
    },
    users: [{ id: "u1", alias: "Irene", createdAt: "2026-09-07T00:00:00.000Z" }],
    places: [],
    photos: [],
    notes: [],
    gpsTracks: [],
    media: { included: 0, missing: [] },
  });
  assert.equal(manifest.travel.title, "Krakow 2026");
  assert.equal(manifest.users[0].alias, "Irene");
});

test("parseProjectManifest rejects foreign zips", () => {
  assert.throws(
    () => parseProjectManifest({ format: "other", version: 1, travel: { title: "x" }, users: [], photos: [] }),
    /TravelToBlog/
  );
});

test("parseProjectManifest rejects incomplete manifests", () => {
  assert.throws(
    () =>
      parseProjectManifest({
        format: PROJECT_BACKUP_FORMAT,
        version: PROJECT_BACKUP_VERSION,
        travel: {},
        users: [],
        photos: [],
      }),
    /incompleto/
  );
});
