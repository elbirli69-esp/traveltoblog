import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PendingNote, PendingPhoto } from "@/types";

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
}

const DB_NAME = "traveltoblog-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<TravelToBlogDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TravelToBlogDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const photos = db.createObjectStore("pendingPhotos", { keyPath: "localId" });
        photos.createIndex("by-travel", "travelId");

        const notes = db.createObjectStore("pendingNotes", { keyPath: "localId" });
        notes.createIndex("by-travel", "travelId");
      },
    });
  }
  return dbPromise;
}

export async function savePendingPhoto(photo: PendingPhoto): Promise<void> {
  const db = await getDb();
  await db.put("pendingPhotos", photo);
}

export async function savePendingNote(note: PendingNote): Promise<void> {
  const db = await getDb();
  await db.put("pendingNotes", note);
}

export async function getPendingPhotos(travelId: string): Promise<PendingPhoto[]> {
  const db = await getDb();
  return db.getAllFromIndex("pendingPhotos", "by-travel", travelId);
}

export async function getPendingNotes(travelId: string): Promise<PendingNote[]> {
  const db = await getDb();
  return db.getAllFromIndex("pendingNotes", "by-travel", travelId);
}

export async function removePendingPhoto(localId: string): Promise<void> {
  const db = await getDb();
  await db.delete("pendingPhotos", localId);
}

export async function removePendingNote(localId: string): Promise<void> {
  const db = await getDb();
  await db.delete("pendingNotes", localId);
}

export async function countPendingItems(travelId: string): Promise<number> {
  const [photos, notes] = await Promise.all([
    getPendingPhotos(travelId),
    getPendingNotes(travelId),
  ]);
  return photos.length + notes.length;
}
