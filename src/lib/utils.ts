import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet, 8);
const localIdAlphabet = customAlphabet(alphabet, 21);

export function generateShareCode(): string {
  return nanoid();
}

/** UUID local para fotos/notas offline. Funciona en HTTP (sin contexto seguro). */
export function createLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // randomUUID requiere contexto seguro (HTTPS); en http://syno-nas:3000 falla
    }
  }
  return localIdAlphabet();
}

export function getJoinUrl(shareCode: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/join/${shareCode}`;
}

export const SESSION_KEY = "traveltoblog_session";

export function getSessionFromStorage(): {
  userId: string;
  alias: string;
  travelId: string;
} | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSession(session: {
  userId: string;
  alias: string;
  travelId: string;
}): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
