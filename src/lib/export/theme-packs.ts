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

const THEME_PACK_TOKENS: Record<
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

export function themePackTokens(pack: ThemePackId) {
  return THEME_PACK_TOKENS[pack];
}

/** Hex (#rgb / #rrggbb) → rgba() for overlays that must track the pack. */
export function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(0,0,0,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Cover-photo hero scrim — must use pack bg, not hard-coded cream. */
export function themePackHeroOverlayGradient(pack: ThemePackId): string {
  const bg = THEME_PACK_TOKENS[pack].bg;
  return `linear-gradient(to top, ${hexToRgba(bg, 0.92)}, ${hexToRgba(bg, 0.4)})`;
}

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const raw = hex.replace("#", "").trim();
    const full =
      raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
    const n = Number.parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  const to = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to(m(ar, br))}${to(m(ag, bg))}${to(m(ab, bb))}`;
}

/** CSS variable overrides + chrome (hero / sticky nav) on the current layout. */
export function themePackCss(pack: ThemePackId): string {
  const t = THEME_PACK_TOKENS[pack];
  const heroFrom = mixHex(t.bg, t.accent, 0.22);
  const heroTo = mixHex(t.bg, t.accent2, 0.18);
  const overlay = themePackHeroOverlayGradient(pack);
  const navBg = hexToRgba(t.bg, 0.92);
  const navBgScrolled = hexToRgba(t.bg, 0.96);
  const hoverPill = hexToRgba(t.accent, 0.12);

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
  --hero-scrim: ${overlay};
  --nav-bg: ${navBg};
}
body.export-theme--${pack} {
  background: var(--bg);
  color: var(--text);
  color-scheme: ${pack === "dark-cinema" ? "dark" : "light"};
}

/* Chrome that previously hard-coded light cream — follow the pack. */
body.export-theme--${pack} .mag-hero {
  background: linear-gradient(135deg, ${heroFrom} 0%, ${t.bg} 60%, ${heroTo} 100%);
  background-size: cover;
  background-position: center;
}
body.export-theme--${pack} .mag-hero::before {
  background: linear-gradient(to top, ${hexToRgba(t.bg, 0.97)} 0%, ${hexToRgba(t.bg, 0.55)} 50%, ${hexToRgba(t.bg, 0.2)} 100%);
}
body.export-theme--${pack} .mag-deck {
  color: var(--muted);
}
body.export-theme--${pack} .mag-section-nav {
  background: ${navBg};
  border-bottom-color: var(--border);
}
body.export-theme--${pack} .mag-section-nav a:hover {
  color: var(--text);
  background: ${hoverPill};
}
body.export-theme--${pack} .section-nav {
  background: ${hexToRgba(t.bg, 0.78)};
  border-bottom-color: transparent;
}
body.export-theme--${pack} .section-nav.scrolled {
  background: ${navBgScrolled};
  border-bottom-color: var(--border);
}
body.export-theme--${pack} .section-nav a:hover {
  color: var(--text);
  background: ${hoverPill};
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
