export const PHOTOS_PAGE_SIZE = 24;
export const PLACES_PAGE_SIZE = 20;
export const DAY_PHOTOS_PREVIEW = 8;

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function pageSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
