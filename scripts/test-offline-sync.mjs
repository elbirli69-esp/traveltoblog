import assert from "node:assert/strict";

/** Mirrors src/lib/client-photo-compress.ts packByUploadBudget + describeUploadHttpError. */

function packByUploadBudget(items, sizeOf, maxBytes = 3.5 * 1024 * 1024, maxItems = 1) {
  if (!items.length) return [];
  const chunks = [];
  let current = [];
  let bytes = 0;

  for (const item of items) {
    const size = Math.max(0, sizeOf(item));
    const wouldOverflow =
      current.length > 0 &&
      (current.length >= maxItems || bytes + size > maxBytes);
    if (wouldOverflow) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
    if (current.length >= maxItems) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function describeUploadHttpError(status, fallback, serverError) {
  if (serverError?.trim()) {
    if (status === 413) {
      return `${serverError.trim()} (HTTP 413: el archivo supera el límite del servidor cloud)`;
    }
    return serverError.trim();
  }
  if (status === 413) {
    return (
      "La foto es demasiado grande para el servidor (HTTP 413). " +
      "Prueba una imagen más pequeña o comprueba la conexión; no se ha puesto en cola como «sin conexión»."
    );
  }
  return `${fallback} (HTTP ${status})`;
}

// Default chunk size 1: three large photos → three requests
assert.deepEqual(
  packByUploadBudget(
    [{ size: 8e6 }, { size: 8e6 }, { size: 8e6 }],
    (p) => p.size
  ).map((c) => c.length),
  [1, 1, 1]
);

// Empty
assert.deepEqual(packByUploadBudget([], (p) => p.size), []);

// Allow packing two small files when maxItems=3
assert.deepEqual(
  packByUploadBudget(
    [{ size: 500_000 }, { size: 500_000 }, { size: 500_000 }],
    (p) => p.size,
    3.5e6,
    3
  ).map((c) => c.length),
  [3]
);

// Oversized single item still alone
assert.equal(
  packByUploadBudget([{ size: 9e6 }], (p) => p.size, 3.5e6, 3).length,
  1
);

assert.match(describeUploadHttpError(413, "fail"), /HTTP 413/);
assert.equal(
  describeUploadHttpError(500, "No se pudieron subir las fotos"),
  "No se pudieron subir las fotos (HTTP 500)"
);
assert.match(
  describeUploadHttpError(413, "fail", "payload too large"),
  /HTTP 413/
);

console.log("offline-sync / upload-budget helpers ok");
