/**
 * Verify Vercel photo upload path:
 * 1) Raw ~8MB JPEG → expect HTTP 413 FUNCTION_PAYLOAD_TOO_LARGE
 * 2) Same image after client-equivalent compress (max edge 2560, q≈0.82) → expect 200
 * 3) Optional second compressed photo (multi batch of 1-each) → expect 200
 *
 * Usage:
 *   BASE_URL=https://traveltoblog.vercel.app \
 *   TRAVEL_ID=… USER_ID=… \
 *   node scripts/verify-vercel-photo-upload.mjs
 */
import sharp from "sharp";
import { randomUUID } from "crypto";

const BASE_URL = (process.env.BASE_URL ?? "https://traveltoblog.vercel.app").replace(
  /\/$/,
  ""
);
const TRAVEL_ID = process.env.TRAVEL_ID;
const USER_ID = process.env.USER_ID;
const UPLOAD_MAX_EDGE = 2560;
const UPLOAD_JPEG_QUALITY = 82;

async function makeLargeJpeg(minBytes = 7.5e6) {
  let w = 5000;
  let h = 4000;
  for (;;) {
    const n = Buffer.alloc(w * h * 3);
    for (let i = 0; i < n.length; i++) n[i] = (Math.sin(i * 0.01) * 127 + 128) | 0;
    const buf = await sharp(n, { raw: { width: w, height: h, channels: 3 } })
      .jpeg({ quality: 92 })
      .toBuffer();
    if (buf.length >= minBytes) return buf;
    w += 500;
    h += 400;
  }
}

/** Mirrors src/lib/client-photo-compress.ts resize policy (sharp instead of canvas). */
async function compressLikeClient(buf) {
  return sharp(buf)
    .rotate()
    .resize({
      width: UPLOAD_MAX_EDGE,
      height: UPLOAD_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: UPLOAD_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

async function postPhoto(fileBuf, filename) {
  const localId = randomUUID();
  const form = new FormData();
  form.append("travelId", TRAVEL_ID);
  form.append("userId", USER_ID);
  form.append(
    "metadata",
    JSON.stringify([
      {
        localId,
        exifDateTime: null,
        latitude: null,
        longitude: null,
        mediaType: "IMAGE",
        selected: true,
        isTransportStart: false,
        isTransportEnd: false,
      },
    ])
  );
  form.append(
    `file_${localId}`,
    new Blob([fileBuf], { type: "image/jpeg" }),
    filename
  );
  const res = await fetch(`${BASE_URL}/api/photos`, { method: "POST", body: form });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 400), localId };
}

async function main() {
  if (!TRAVEL_ID || !USER_ID) {
    console.error("Set TRAVEL_ID and USER_ID (create via /api/travels or /api/join).");
    process.exit(2);
  }

  console.log("BASE_URL", BASE_URL);
  const raw = await makeLargeJpeg();
  console.log("raw_bytes", raw.length);

  const rawRes = await postPhoto(raw, "raw-8mb.jpg");
  console.log("RAW_STATUS", rawRes.status);
  console.log("RAW_BODY", rawRes.body);

  const compressed = await compressLikeClient(raw);
  console.log("compressed_bytes", compressed.length);
  if (compressed.length > 3.5e6) {
    console.error("Compressed payload still too large:", compressed.length);
    process.exit(1);
  }

  const ok1 = await postPhoto(compressed, "compressed-1.jpg");
  console.log("COMPRESSED_1_STATUS", ok1.status);
  console.log("COMPRESSED_1_BODY", ok1.body);

  const ok2 = await postPhoto(compressed, "compressed-2.jpg");
  console.log("COMPRESSED_2_STATUS", ok2.status);
  console.log("COMPRESSED_2_BODY", ok2.body);

  const rawOk = rawRes.status === 413;
  const uploadsOk = ok1.status === 200 && ok2.status === 200;
  if (!rawOk) {
    console.error("Expected raw ~8MB to still hit 413 (platform limit).");
    process.exit(1);
  }
  if (!uploadsOk) {
    console.error("Expected compressed uploads to succeed with HTTP 200.");
    process.exit(1);
  }
  console.log("VERIFY_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
