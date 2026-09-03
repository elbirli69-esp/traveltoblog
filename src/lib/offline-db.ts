import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PendingNote, PendingPhoto, PendingPlace, PendingSyncMeta } from "@/types";

export const PENDING_CHANGED_EVENT = "traveltoblog:pending-changed";

interface TravelToBlogDB extends DBSchema {
  pendingPhotos: {
    key: string;
    value: PendingPhoto;
    indexes: { "by-travel": string };
  };
  pendingNotes: {
    key: string;
    value: PendingNote;
    indexes: { "by-travel": string };
  };
  pendingPlaces: {
    key: string;
    value: PendingPlace;
    indexes: { "by-travel": string };
  };
}

const DB_NAME = "traveltoblog-offline";
/** v3: pending rows may include syncStatus / lastError / attempts. */
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<TravelToBlogDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TravelToBlogDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("pendingPhotos")) {
          const photos = db.createObjectStore("pendingPhotos", { keyPath: "localId" });
          photos.createIndex("by-travel", "travelId");
        }
        if (!db.objectStoreNames.contains("pendingNotes")) {
          const notes = db.createObjectStore("pendingNotes", { keyPath: "localId" });
          notes.createIndex("by-travel", "travelId");
        }
        if (!db.objectStoreNames.contains("pendingPlaces")) {
          const places = db.createObjectStore("pendingPlaces", { keyPath: "localId" });
          places.createIndex("by-travel", "travelId");
        }
      },
    });
  }
  return dbPromise;
}

export function notifyPendingChanged(travelId?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PENDING_CHANGED_EVENT, { detail: { travelId: travelId ?? null } })
  );
}

function withPendingDefaults<T extends PendingSyncMeta>(item: T): T {
  return {
    ...item,
    syncStatus: item.syncStatus ?? "pending",
    lastError: item.lastError ?? null,
    attempts: item.attempts ?? 0,
    lastAttemptAt: item.lastAttemptAt ?? null,
  };
}

export async function savePendingPhoto(photo: PendingPhoto): Promise<void> {
  const db = await getDb();
  await db.put(
    "pendingPhotos",
    withPendingDefaults({
      ...photo,
      syncStatus: photo.syncStatus ?? "pending",
      lastError: photo.lastError ?? null,
    })
  );
  notifyPendingChanged(photo.travelId);
}

export async function savePendingNote(note: PendingNote): Promise<void> {
  const db = await getDb();
  await db.put(
    "pendingNotes",
    withPendingDefaults({
      ...note,
      syncStatus: note.syncStatus ?? "pending",
      lastError: note.lastError ?? null,
    })
  );
  notifyPendingChanged(note.travelId);
}

export async function savePendingPlace(place: PendingPlace): Promise<void> {
  const db = await getDb();
  await db.put(
    "pendingPlaces",
    withPendingDefaults({
      ...place,
      syncStatus: place.syncStatus ?? "pending",
      lastError: place.lastError ?? null,
    })
  );
  notifyPendingChanged(place.travelId);
}

export async function getPendingPhotos(travelId: string): Promise<PendingPhoto[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("pendingPhotos", "by-travel", travelId);
  return rows.map((row) => withPendingDefaults(row));
}

export async function getPendingNotes(travelId: string): Promise<PendingNote[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("pendingNotes", "by-travel", travelId);
  return rows.map((row) => withPendingDefaults(row));
}

export async function getPendingPlaces(travelId: string): Promise<PendingPlace[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("pendingPlaces", "by-travel", travelId);
  return rows.map((row) => withPendingDefaults(row));
}

export async function removePendingPhoto(localId: string): Promise<void> {
  const db = await getDb();
  await db.delete("pendingPhotos", localId);
  notifyPendingChanged();
}

export async function removePendingNote(localId: string): Promise<void> {
  const db = await getDb();
  await db.delete("pendingNotes", localId);
  notifyPendingChanged();
}

export async function removePendingPlace(localId: string): Promise<void> {
  const db = await getDb();
  await db.delete("pendingPlaces", localId);
  notifyPendingChanged();
}

export async function markPendingPhotoError(
  photo: PendingPhoto,
  error: string
): Promise<void> {
  await savePendingPhoto({
    ...photo,
    syncStatus: "error",
    lastError: error,
    attempts: (photo.attempts ?? 0) + 1,
    lastAttemptAt: new Date().toISOString(),
  });
}

export async function markPendingNoteError(
  note: PendingNote,
  error: string
): Promise<void> {
  await savePendingNote({
    ...note,
    syncStatus: "error",
    lastError: error,
    attempts: (note.attempts ?? 0) + 1,
    lastAttemptAt: new Date().toISOString(),
  });
}

export async function markPendingPlaceError(
  place: PendingPlace,
  error: string
): Promise<void> {
  await savePendingPlace({
    ...place,
    syncStatus: "error",
    lastError: error,
    attempts: (place.attempts ?? 0) + 1,
    lastAttemptAt: new Date().toISOString(),
  });
}

export async function resetPendingPhotoForRetry(photo: PendingPhoto): Promise<void> {
  await savePendingPhoto({
    ...photo,
    syncStatus: "pending",
    lastError: null,
  });
}

export async function resetPendingNoteForRetry(note: PendingNote): Promise<void> {
  await savePendingNote({
    ...note,
    syncStatus: "pending",
    lastError: null,
  });
}

export async function resetPendingPlaceForRetry(place: PendingPlace): Promise<void> {
  await savePendingPlace({
    ...place,
    syncStatus: "pending",
    lastError: null,
  });
}

export async function countPendingItems(travelId: string): Promise<number> {
  const [photos, notes, places] = await Promise.all([
    getPendingPhotos(travelId),
    getPendingNotes(travelId),
    getPendingPlaces(travelId),
  ]);
  return photos.length + notes.length + places.length;
}

export interface PendingCounts {
  photos: number;
  notes: number;
  places: number;
  total: number;
  errors: number;
  ready: number;
}

export interface PendingQueueItem {
  kind: "photo" | "note" | "place";
  localId: string;
  label: string;
  syncStatus: "pending" | "error";
  lastError: string | null;
  attempts: number;
}

export interface PendingQueueSnapshot {
  counts: PendingCounts;
  items: PendingQueueItem[];
}

export async function getPendingCounts(travelId: string): Promise<PendingCounts> {
  const snapshot = await getPendingQueueSnapshot(travelId);
  return snapshot.counts;
}

export async function getPendingQueueSnapshot(
  travelId: string
): Promise<PendingQueueSnapshot> {
  const [photos, notes, places] = await Promise.all([
    getPendingPhotos(travelId),
    getPendingNotes(travelId),
    getPendingPlaces(travelId),
  ]);

  const items: PendingQueueItem[] = [
    ...photos.map((p) => ({
      kind: "photo" as const,
      localId: p.localId,
      label: p.filename || "Foto",
      syncStatus: (p.syncStatus ?? "pending") as "pending" | "error",
      lastError: p.lastError ?? null,
      attempts: p.attempts ?? 0,
    })),
    ...notes.map((n) => ({
      kind: "note" as const,
      localId: n.localId,
      label: n.text.trim().slice(0, 48) || `Nota ${n.type.toLowerCase()}`,
      syncStatus: (n.syncStatus ?? "pending") as "pending" | "error",
      lastError: n.lastError ?? null,
      attempts: n.attempts ?? 0,
    })),
    ...places.map((p) => ({
      kind: "place" as const,
      localId: p.localId,
      label: p.name || "Lugar",
      syncStatus: (p.syncStatus ?? "pending") as "pending" | "error",
      lastError: p.lastError ?? null,
      attempts: p.attempts ?? 0,
    })),
  ];

  const errors = items.filter((i) => i.syncStatus === "error").length;
  const ready = items.length - errors;

  return {
    counts: {
      photos: photos.length,
      notes: notes.length,
      places: places.length,
      total: items.length,
      errors,
      ready,
    },
    items,
  };
}

export async function clearPendingForTravel(travelId: string): Promise<void> {
  const [photos, notes, places] = await Promise.all([
    getPendingPhotos(travelId),
    getPendingNotes(travelId),
    getPendingPlaces(travelId),
  ]);
  await Promise.all([
    ...photos.map((item) => removePendingPhoto(item.localId)),
    ...notes.map((item) => removePendingNote(item.localId)),
    ...places.map((item) => removePendingPlace(item.localId)),
  ]);
  notifyPendingChanged(travelId);
}
