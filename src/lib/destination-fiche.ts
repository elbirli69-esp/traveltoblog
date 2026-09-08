/**
 * Optional light destination fiche (plan-blog-editorial B5).
 * Feeds AI blog voice + completeness without inventing visits.
 */

export const DESTINATION_THEME_MAX = 3;
export const DESTINATION_NAME_MAX = 120;
export const DESTINATION_THEME_ITEM_MAX = 80;

export type DestinationFiche = {
  name: string | null;
  themes: string[];
};

export function emptyDestinationFiche(): DestinationFiche {
  return { name: null, themes: [] };
}

export function hasDestinationFiche(
  fiche: DestinationFiche | null | undefined
): boolean {
  if (!fiche) return false;
  return Boolean(fiche.name?.trim()) || fiche.themes.length > 0;
}

/** Normalize themes: trim, dedupe, cap length/count. */
export function normalizeDestinationThemes(
  themes: unknown
): string[] {
  const raw = Array.isArray(themes)
    ? themes
    : typeof themes === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(themes) as unknown;
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return themes
              .split(/[,;\n]+/)
              .map((t) => t.trim())
              .filter(Boolean);
          }
        })()
      : [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim().slice(0, DESTINATION_THEME_ITEM_MAX);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= DESTINATION_THEME_MAX) break;
  }
  return out;
}

export function parseDestinationThemesJson(
  raw: string | null | undefined
): string[] {
  if (!raw?.trim()) return [];
  return normalizeDestinationThemes(raw);
}

export function serializeDestinationThemes(themes: string[]): string | null {
  const normalized = normalizeDestinationThemes(themes);
  if (normalized.length === 0) return null;
  return JSON.stringify(normalized);
}

export function destinationFicheFromTravel(travel: {
  destinationName?: string | null;
  destinationThemes?: string | null;
}): DestinationFiche {
  return {
    name: travel.destinationName?.trim().slice(0, DESTINATION_NAME_MAX) || null,
    themes: parseDestinationThemesJson(travel.destinationThemes),
  };
}

/**
 * Extra prompt lines when a fiche exists.
 * Safe to append after voice rules / brief.
 */
export function destinationFichePromptAddon(
  fiche: DestinationFiche | null | undefined
): string {
  if (!hasDestinationFiche(fiche)) return "";
  const bits: string[] = [
    "FICHA DESTINO (prioridad alta para curiosidades — no inventes visitas):",
  ];
  if (fiche!.name) {
    bits.push(`- Destino canónico: ${fiche!.name}.`);
  }
  if (fiche!.themes.length > 0) {
    bits.push(
      `- Temas a priorizar cuando encajen con lugares visitados: ${fiche!.themes.join("; ")}.`
    );
  }
  bits.push(
    "- Ancla cada curiosidad a un lugar/hecho del JSON o a este destino; no añadas monumentos no visitados."
  );
  return `\n${bits.join("\n")}`;
}

/** Suggested theme chips for the UI (user can edit free text). */
export const DESTINATION_THEME_SUGGESTIONS = [
  "Historia",
  "Comida local",
  "Barrios",
  "Arquitectura",
  "Naturaleza",
  "Tradiciones",
] as const;
