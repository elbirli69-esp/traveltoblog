/** YYYY-MM-DD in local timezone (matches Nutriplaner selectedDate pattern). */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysToKey(key: string, delta: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + delta);
  return toDateKey(date);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

/** Normalize API ISO datetime or YYYY-MM-DD to a calendar day key. */
export function isoToDateKey(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return toDateKey(new Date(iso));
}

export function formatDateKey(key: string, style: "long" | "short" = "long"): string {
  const date = parseDateKey(key);
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: style === "long" ? "full" : "medium",
  }).format(date);
}

export function enumerateDateKeys(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  let current = startKey;
  while (current <= endKey) {
    keys.push(current);
    current = addDaysToKey(current, 1);
  }
  return keys;
}

interface TravelRangeInput {
  startDate: string | null;
  endDate: string | null;
  photoExifDates: (string | null)[];
}

/**
 * Trip calendar bounds: explicit travel dates, else EXIF span, else today only.
 */
export function resolveTravelDayRange(input: TravelRangeInput): {
  startKey: string;
  endKey: string;
  dayKeys: string[];
} {
  let startKey: string | null = input.startDate ? isoToDateKey(input.startDate) : null;
  let endKey: string | null = input.endDate ? isoToDateKey(input.endDate) : null;

  const exifKeys = input.photoExifDates
    .filter((d): d is string => Boolean(d))
    .map(isoToDateKey)
    .sort();

  if (!startKey && exifKeys.length) startKey = exifKeys[0];
  if (!endKey && exifKeys.length) endKey = exifKeys[exifKeys.length - 1];

  if (startKey && endKey && startKey > endKey) {
    [startKey, endKey] = [endKey, startKey];
  }

  if (!startKey || !endKey) {
    const today = todayKey();
    startKey = today;
    endKey = today;
  }

  return {
    startKey,
    endKey,
    dayKeys: enumerateDateKeys(startKey, endKey),
  };
}

export function clampDateKey(key: string, startKey: string, endKey: string): string {
  if (key < startKey) return startKey;
  if (key > endKey) return endKey;
  return key;
}
