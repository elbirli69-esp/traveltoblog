/**
 * Typed typography packs for HTML (and later PDF) exports.
 * System / Liberation stacks only — no remote webfonts, no free font picker.
 */

import type { ExportTemplateId } from "@/lib/export/template-catalog";

export type TypePackId = "serif-editorial" | "sans-clean" | "hybrid";

export interface TypePackEntry {
  id: TypePackId;
  label: string;
  tagline: string;
  displayFont: string;
  bodyFont: string;
  uiFont: string;
}

export const TYPE_PACK_CATALOG: TypePackEntry[] = [
  {
    id: "serif-editorial",
    label: "Serif editorial",
    tagline: "Revista / crónica tipográfica",
    displayFont: 'Georgia, "Times New Roman", "Liberation Serif", serif',
    bodyFont: 'Georgia, "Times New Roman", "Liberation Serif", serif',
    uiFont: 'system-ui, "Segoe UI", "Liberation Sans", sans-serif',
  },
  {
    id: "sans-clean",
    label: "Sans limpia",
    tagline: "Moderna, UI-first",
    displayFont: '"Segoe UI", system-ui, "Liberation Sans", sans-serif',
    bodyFont: '"Segoe UI", system-ui, "Liberation Sans", sans-serif',
    uiFont: '"Segoe UI", system-ui, "Liberation Sans", sans-serif',
  },
  {
    id: "hybrid",
    label: "Híbrida",
    tagline: "Títulos serif + cuerpo sans",
    displayFont: 'Georgia, "Times New Roman", "Liberation Serif", serif',
    bodyFont: '"Segoe UI", system-ui, "Liberation Sans", sans-serif',
    uiFont: '"Segoe UI", system-ui, "Liberation Sans", sans-serif',
  },
];

const BY_ID = new Map(TYPE_PACK_CATALOG.map((e) => [e.id, e]));

export function getTypePackEntry(
  id: TypePackId | string | null | undefined
): TypePackEntry | undefined {
  if (!id) return undefined;
  return BY_ID.get(id as TypePackId);
}

export function defaultTypePackForTemplate(
  template: ExportTemplateId
): TypePackId {
  if (template === "magazine" || template === "editorial-clean") {
    return "serif-editorial";
  }
  if (template === "visual-journey" || template === "dark-photo-journey") {
    return "sans-clean";
  }
  return "hybrid";
}

export function typePackCss(pack: TypePackId): string {
  const entry = getTypePackEntry(pack)!;
  return `
/* type-pack: ${pack} */
:root, body.export-type--${pack} {
  --font-display: ${entry.displayFont};
  --font-body: ${entry.bodyFont};
  --font-ui: ${entry.uiFont};
}
body.export-type--${pack} {
  font-family: var(--font-body);
}
body.export-type--${pack} h1,
body.export-type--${pack} h2,
body.export-type--${pack} h3,
body.export-type--${pack} .mag-hero h1,
body.export-type--${pack} .hero h1,
body.export-type--${pack} .section-title {
  font-family: var(--font-display);
}
body.export-type--${pack} .mag-eyebrow,
body.export-type--${pack} .mag-toc,
body.export-type--${pack} .map-sidebar,
body.export-type--${pack} .map-day-item,
body.export-type--${pack} button,
body.export-type--${pack} .meta,
body.export-type--${pack} nav {
  font-family: var(--font-ui);
}
`;
}

/** Heuristic brief → type pack. */
export function suggestTypePackFromBrief(brief: string): TypePackId | null {
  const text = brief
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (!text.trim()) return null;
  if (
    /\b(tipografia\s+editorial|serif|revista|magazine\s+tipograf|letra\s+serif|cronica\s+tipograf)\b/.test(
      text
    )
  ) {
    return "serif-editorial";
  }
  if (
    /\b(sans|sin\s+serif|tipografia\s+limpia|moderna|ui\s+limpia|letra\s+moderna)\b/.test(
      text
    )
  ) {
    return "sans-clean";
  }
  if (
    /\b(hibrid\w*|titulos\s+serif|serif\s+\+\s+sans|mezcla\s+tipograf)\b/.test(
      text
    )
  ) {
    return "hybrid";
  }
  return null;
}
