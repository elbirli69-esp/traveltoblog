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
export const TRAVEL_HISTORY_KEY = "traveltoblog_travel_history";

export type TravelSession = {
  userId: string;
  alias: string;
  travelId: string;
};

export type TravelHistoryEntry = TravelSession & {
  title: string;
  shareCode: string;
  lastVisited: string;
};

export function getSessionFromStorage(): TravelSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSession(session: TravelSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getTravelHistory(): TravelHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(TRAVEL_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TravelHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberTravel(entry: Omit<TravelHistoryEntry, "lastVisited">): void {
  if (typeof window === "undefined") return;
  const now = new Date().toISOString();
  const history = getTravelHistory().filter((item) => item.travelId !== entry.travelId);
  history.unshift({ ...entry, lastVisited: now });
  localStorage.setItem(TRAVEL_HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
}

export function touchTravelHistory(travelId: string): void {
  if (typeof window === "undefined") return;
  const history = getTravelHistory();
  const index = history.findIndex((item) => item.travelId === travelId);
  if (index === -1) return;
  const [entry] = history.splice(index, 1);
  entry.lastVisited = new Date().toISOString();
  history.unshift(entry);
  localStorage.setItem(TRAVEL_HISTORY_KEY, JSON.stringify(history));
}
