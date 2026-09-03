export interface ExifMetadata {
  dateTime: Date | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ParsedPhoto {
  id: string;
  file: File;
  previewUrl: string;
  exif: ExifMetadata;
  /** Android photo picker redacts GPS tags to empty/NaN while gallery still shows location. */
  gpsStripped?: boolean;
  /** Linked place (server id) for categories / guía export. */
  placeId?: string | null;
  mediaType: "IMAGE" | "VIDEO";
  durationMs?: number | null;
  /** Client-only JPEG still for video upload */
  posterBlob?: Blob | null;
  posterPreviewUrl?: string | null;
  selected: boolean;
  outOfRange: boolean;
  isTransportStart: boolean;
  isTransportEnd: boolean;
}

export interface TravelDateRange {
  start: Date | null;
  end: Date | null;
}

export interface PendingSyncMeta {
  /** Default pending when missing (older IndexedDB rows). */
  syncStatus?: "pending" | "error";
  lastError?: string | null;
  attempts?: number;
  lastAttemptAt?: string | null;
}

export interface PendingPhoto extends PendingSyncMeta {
  localId: string;
  travelId: string;
  userId: string;
  fileBlob: Blob;
  filename: string;
  exifDateTime: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Server place id when already synced */
  placeId: string | null;
  /** Client place localId when the place is still pending */
  placeLocalId: string | null;
  mediaType: "IMAGE" | "VIDEO";
  durationMs: number | null;
  posterBlob?: Blob | null;
  selected: boolean;
  isTransportStart: boolean;
  isTransportEnd: boolean;
  createdAt: string;
}

export interface PendingNote extends PendingSyncMeta {
  localId: string;
  travelId: string;
  userId: string;
  photoLocalId: string | null;
  /** Server place id when the place is already synced */
  placeId: string | null;
  /** Client place localId when the place is still pending */
  placeLocalId: string | null;
  type: "PHOTO" | "DAY" | "TRIP" | "PLACE";
  dayDate: string | null;
  text: string;
  createdAt: string;
}

export interface PendingPlace extends PendingSyncMeta {
  localId: string;
  travelId: string;
  userId: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  /** Legacy offline field; sync creates Note(PLACE) instead of Place.comment */
  comment: string | null;
  /** When the visit happened (ISO). Used for chronology of past trips. */
  visitedAt?: string | null;
  createdAt: string;
}

export interface JournalChronologyEntry {
  fecha_hora: string;
  autor: string;
  ubicacion_gps: { lat: number; lon: number } | null;
  tipo_nota: "foto" | "dia" | "viaje" | "lugar";
  texto_nota: string;
  url_foto?: string;
}

export interface JournalInput {
  titulo_viaje: string;
  participantes: string[];
  cronologia: JournalChronologyEntry[];
}

export interface SessionUser {
  id: string;
  alias: string;
  travelId: string;
}
