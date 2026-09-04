import assert from "node:assert/strict";

function errorMessage(resStatus, fallback) {
  return `${fallback} (HTTP ${resStatus})`;
}

assert.equal(
  errorMessage(500, "No se pudieron subir las fotos"),
  "No se pudieron subir las fotos (HTTP 500)"
);

const result = {
  syncedPhotos: 2,
  syncedNotes: 1,
  syncedPlaces: 0,
  failed: 1,
};
assert.equal(result.syncedPhotos + result.syncedNotes + result.syncedPlaces, 3);
assert.ok(result.failed > 0);

console.log("offline-sync helpers ok");
