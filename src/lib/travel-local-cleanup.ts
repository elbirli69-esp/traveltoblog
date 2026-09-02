import { clearPendingForTravel } from "@/lib/offline-db";
import {
  clearSessionIfTravel,
  getSessionFromStorage,
  getTravelHistory,
  removeTravelFromHistory,
  TRAVEL_HISTORY_KEY,
  type TravelHistoryEntry,
} from "@/lib/utils";

export const TRAVEL_DELETED_EVENT = "traveltoblog:travel-deleted";

export function isTravelNotFoundResponse(res: Response): boolean {
  return res.status === 404;
}

/** Remove all local traces of a deleted travel on this device. */
export async function clearLocalTravelData(travelId: string): Promise<void> {
  removeTravelFromHistory(travelId);
  clearSessionIfTravel(travelId);
  await clearPendingForTravel(travelId);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(TRAVEL_DELETED_EVENT, { detail: { travelId } })
    );
  }
}

/** Drop history entries whose travel no longer exists on the server. */
export async function pruneDeletedTravelHistory(): Promise<TravelHistoryEntry[]> {
  const history = getTravelHistory();
  if (history.length === 0) return history;
  if (typeof window === "undefined" || !navigator.onLine) return history;

  const checks = await Promise.all(
    history.map(async (entry) => {
      try {
        const res = await fetch(`/api/travels/${entry.travelId}?meta=1`, {
          cache: "no-store",
        });
        return res.ok ? entry : null;
      } catch {
        return entry;
      }
    })
  );

  const valid = checks.filter((entry): entry is TravelHistoryEntry => entry !== null);
  if (valid.length !== history.length) {
    localStorage.setItem(TRAVEL_HISTORY_KEY, JSON.stringify(valid));
    const session = getSessionFromStorage();
    if (session && !valid.some((item) => item.travelId === session.travelId)) {
      clearSessionIfTravel(session.travelId);
    }
    for (const entry of history) {
      if (!valid.some((item) => item.travelId === entry.travelId)) {
        await clearPendingForTravel(entry.travelId);
      }
    }
  }

  return valid;
}
