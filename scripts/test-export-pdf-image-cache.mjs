import assert from "node:assert/strict";
import { mkdir, writeFile, rm, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import {
  getOrCreatePdfImageSet,
  getOrCreateExportImageSet,
} from "../src/lib/export-image-cache.ts";
import { PDF_CACHE_VERSION } from "../src/lib/export-images.ts";

const root = path.join(tmpdir(), `ttb-pdf-cache-${Date.now()}`);
const travelId = "travel-cache-test";
const photoId = "photo-1";
const publicDir = path.join(process.cwd(), "public", "uploads", travelId);
const photoRel = `/uploads/${travelId}/source.jpg`;
const photoAbs = path.join(process.cwd(), "public", photoRel.slice(1));

await mkdir(path.dirname(photoAbs), { recursive: true });
const original = await sharp({
  create: { width: 2400, height: 1600, channels: 3, background: { r: 40, g: 120, b: 200 } },
})
  .jpeg({ quality: 90 })
  .toBuffer();
await writeFile(photoAbs, original);

const cacheDir = path.join(process.cwd(), "data", "export-cache", travelId, photoId);

try {
  await rm(cacheDir, { recursive: true, force: true });

  const t0 = Date.now();
  const first = await getOrCreatePdfImageSet(travelId, photoId, photoRel, "source.jpg");
  const firstMs = Date.now() - t0;
  assert.ok(first, "first pdf cache generate");
  assert.ok(first.print.length > 1000, "print jpg size");
  assert.ok(first.bleed.length > first.print.length * 0.5, "bleed jpg present");

  const meta = JSON.parse(await readFile(path.join(cacheDir, "meta.json"), "utf-8"));
  assert.equal(meta.pdfVersion, PDF_CACHE_VERSION);
  await stat(path.join(cacheDir, "print.jpg"));
  await stat(path.join(cacheDir, "bleed.jpg"));

  const t1 = Date.now();
  const second = await getOrCreatePdfImageSet(travelId, photoId, photoRel, "source.jpg");
  const secondMs = Date.now() - t1;
  assert.ok(second, "second pdf cache hit");
  assert.equal(second.print.length, first.print.length, "cached print identical size");
  assert.equal(second.bleed.length, first.bleed.length, "cached bleed identical size");
  assert.ok(
    secondMs < firstMs || secondMs < 50,
    `cache hit should be faster (first=${firstMs}ms second=${secondMs}ms)`
  );

  // HTML webp cache still works independently / shares meta
  const webp = await getOrCreateExportImageSet(travelId, photoId, photoRel);
  assert.ok(webp?.display?.length > 500, "webp display cached");
  assert.ok(webp?.thumb?.length > 100, "webp thumb cached");

  console.log("export-pdf-image-cache ok", { firstMs, secondMs, print: first.print.length, bleed: first.bleed.length });
} finally {
  await rm(cacheDir, { recursive: true, force: true }).catch(() => {});
  await rm(photoAbs, { force: true }).catch(() => {});
}
