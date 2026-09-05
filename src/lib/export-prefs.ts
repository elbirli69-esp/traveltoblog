/**
 * Client helper to persist export brief / look choices on a travel.
 */

export type TravelExportPrefs = {
  exportBrief?: string | null;
  exportBriefCache?: string | null;
  htmlTemplateId?: string | null;
  htmlThemePackId?: string | null;
  htmlTypePackId?: string | null;
  reelPresetId?: string | null;
  pdfPresetId?: string | null;
};

export async function fetchTravelExportPrefs(
  travelId: string
): Promise<TravelExportPrefs | null> {
  try {
    const res = await fetch(`/api/travels/${travelId}/export-prefs`);
    if (!res.ok) return null;
    const data = (await res.json()) as { prefs?: TravelExportPrefs };
    return data.prefs ?? null;
  } catch {
    return null;
  }
}

export async function saveTravelExportPrefs(
  travelId: string,
  patch: TravelExportPrefs
): Promise<TravelExportPrefs | null> {
  try {
    const res = await fetch(`/api/travels/${travelId}/export-prefs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { prefs?: TravelExportPrefs };
    return data.prefs ?? null;
  } catch {
    return null;
  }
}
