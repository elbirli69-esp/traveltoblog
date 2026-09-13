import assert from "node:assert/strict";

function chunkPendingPhotos(items, size) {
  if (size <= 0) return [items];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

assert.deepEqual(chunkPendingPhotos([1, 2, 3, 4, 5, 6, 7], 3), [
  [1, 2, 3],
  [4, 5, 6],
  [7],
]);
assert.deepEqual(chunkPendingPhotos([], 3), []);
assert.equal(chunkPendingPhotos(Array.from({ length: 18 }, (_, i) => i), 3).length, 6);

function errorMessage(resStatus, fallback) {
  return `${fallback} (HTTP ${resStatus})`;
}

assert.equal(
  errorMessage(500, "No se pudieron subir las fotos"),
  "No se pudieron subir las fotos (HTTP 500)"
);

console.log("offline-sync helpers ok");
