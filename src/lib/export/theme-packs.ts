/**
 * Typed HTML theme packs — color tokens only.
 * Applied as :root / body CSS variable overrides on the current layoutBase.
 * Does not change HTML structure.
 */

import type { ExportTemplateId } from "@/lib/export/template-catalog";
import { getTemplateCatalogEntry } from "@/lib/export/template-catalog";

export type ThemePackId =
  | "light-paper"
  | "light-clean"
  | "dark-cinema"
  | "warm-sunset"
  | "cool-coast";

export interface ThemePackEntry {
  id: ThemePackId;
  label: string;
  tagline: string;
  /** Rough family for matching briefs */
  mood: "light" | "dark" | "warm" | "cool";
}

export const THEME_PACK_CATALOG: ThemePackEntry[] = [
  {
    id: "light-paper",
    label: "Papel claro",
    tagline: "Crema editorial, acento teal",
    mood: "light",
  },
  {
    id: "light-clean",
    label: "Claro limpio",
    tagline: "Blanco frío, acento cian",
    mood: "light",
  },
  {
    id: "dark-cinema",
    label: "Cine oscuro",
    tagline: "Fondo ink, acento ámbar",
    mood: "dark",
  },
  {
    id: "warm-sunset",
    label: "Atardecer",
    tagline: "Cálido arena / terracota",
    mood: "warm",
  },
  {
    id: "cool-coast",
    label: "Costa fría",
    tagline: "Azules suaves, bruma",
    mood: "cool",
  },
];

const BY_ID = new Map(THEME_PACK_CATALOG.map((e) => [e.id, e]));

export function getThemePackEntry(
  id: ThemePackId | string | null | undefined
): ThemePackEntry | undefined {
  if (!id) return undefined;
  return BY_ID.get(id as ThemePackId);
}

export function defaultThemePackForTemplate(
  template: ExportTemplateId
): ThemePackId {
  const fromCatalog = getTemplateCatalogEntry(template)?.themePack;
  if (fromCatalog === "light-paper") return "light-paper";
  if (fromCatalog === "light-clean") return "light-clean";
  if (fromCatalog === "dark-cinema") return "dark-cinema";
  if (template === "dark-photo-journey") return "dark-cinema";
  if (template === "editorial-clean" || template === "visual-journey") {
    return "light-clean";
  }
  return "light-paper";
}

/** CSS variable overrides. Safe to append after templateStyles(). */
export function themePackCss(pack: ThemePackId): string {
  const tokens: Record<
    ThemePackId,
    {
      bg: string;
      surface: string;
      text: string;
      muted: string;
      accent: string;
      accent2: string;
      border: string;
    }
  > = {
    "light-paper": {
      bg: "#faf9f7",
      surface: "#ffffff",
      text: "#1c1917",
      muted: "#78716c",
      accent: "#0d9488",
      accent2: "#b45309",
      border: "#e7e5e4",
    },
    "light-clean": {
      bg: "#fafafa",
      surface: "#ffffff",
      text: "#18181b",
      muted: "#71717a",
      accent: "#0891b2",
      accent2: "#0e7490",
      border: "#e4e4e7",
    },
    "dark-cinema": {
      bg: "#0b1120",
      surface: "#111827",
      text: "#e5e7eb",
      muted: "#9ca3af",
      accent: "#fbbf24",
      accent2: "#f59e0b",
      border: "#1f2937",
    },
    "warm-sunset": {
      bg: "#faf6f1",
      surface: "#fffbf7",
      text: "#292524",
      muted: "#a8a29e",
      accent: "#c2410c",
      accent2: "#b45309",
      border: "#e7e0d5",
    },
    "cool-coast": {
      bg: "#f4f8fb",
      surface: "#ffffff",
      text: "#0f172a",
      muted: "#64748b",
      accent: "#0284c7",
      accent2: "#0369a1",
      border: "#dbe4ee",
    },
  };

  const t = tokens[pack];
  return `
/* theme-pack: ${pack} */
:root, body.export-theme--${pack} {
  --bg: ${t.bg};
  --surface: ${t.surface};
  --text: ${t.text};
  --muted: ${t.muted};
  --accent: ${t.accent};
  --accent-2: ${t.accent2};
  --border: ${t.border};
}
body.export-theme--${pack} {
  background: var(--bg);
  color: var(--text);
}
`;
}

/** Heuristic brief → theme pack (null = keep UI / template default). */
export function suggestThemePackFromBrief(
  brief: string
): ThemePackId | null {
  const text = brief
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (!text.trim()) return null;
  if (
    /\b(atardecer|sunset|calid\w*|warm|terracota|arena|dorado)\b/.test(text)
  ) {
    return "warm-sunset";
  }
  if (/\b(costa|ocean\w*|marino|azul\s+frio|cool\s+coast|bruma)\b/.test(text)) {
    return "cool-coast";
  }
  if (
    /\b(cine\s+oscuro|dark\s+cinema|noir|ink\s+dark)\b/.test(text)
  ) {
    return "dark-cinema";
  }
  if (/\b(papel|paper|crema|magazine\s+claro)\b/.test(text)) {
    return "light-paper";
  }
  if (/\b(limpio|clean|minimal\s+claro|blanco\s+frio)\b/.test(text)) {
    return "light-clean";
  }
  // Generic dark → cinema pack (structure still from UI template).
  if (
    /\b(modo\s+oscuro|tema\s+oscuro|dark\s+mode|fondo\s+oscuro)\b/.test(text)
  ) {
    return "dark-cinema";
  }
  return null;
}
