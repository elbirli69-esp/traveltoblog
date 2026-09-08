/**
 * Guided seed prompts for blog editorial phase B2:
 * photo notes by place type, day structure chips, journal intention chips.
 */

import type { PlaceType } from "@prisma/client";

export type SeedStarter = {
  id: string;
  label: string;
  /** Text inserted into the seed field when the chip is pressed. */
  text: string;
};

const PHOTO_STARTERS: Record<PlaceType | "DEFAULT", SeedStarter[]> = {
  VIEWPOINT: [
    {
      id: "vp-view",
      label: "Qué se veía",
      text: "Desde el mirador se veía ",
    },
    {
      id: "vp-light",
      label: "Luz / hora",
      text: "A esa hora la luz era ",
    },
  ],
  RESTAURANT: [
    {
      id: "rest-dish",
      label: "Qué pedimos",
      text: "Pedimos ",
    },
    {
      id: "rest-vibe",
      label: "Ambiente",
      text: "El local tenía un ambiente ",
    },
  ],
  CAFE: [
    {
      id: "cafe-order",
      label: "Café / pedido",
      text: "Tomamos ",
    },
    {
      id: "cafe-pause",
      label: "Pausa",
      text: "Paramos un momento en la terraza: ",
    },
  ],
  MUSEUM: [
    {
      id: "mus-piece",
      label: "Una obra/sala",
      text: "Nos marcó especialmente ",
    },
    {
      id: "mus-feel",
      label: "Cómo se sintió",
      text: "En el museo sentimos ",
    },
  ],
  PARK: [
    {
      id: "park-walk",
      label: "Paseo",
      text: "Paseamos por el parque y ",
    },
  ],
  BEACH: [
    {
      id: "beach-moment",
      label: "Momento en la playa",
      text: "En la playa ",
    },
  ],
  HOTEL: [
    {
      id: "hotel-stay",
      label: "El alojamiento",
      text: "El alojamiento era ",
    },
  ],
  TRANSPORT: [
    {
      id: "tr-leg",
      label: "El trayecto",
      text: "En el trayecto ",
    },
  ],
  SHOP: [
    {
      id: "shop-find",
      label: "Lo que encontramos",
      text: "Encontramos ",
    },
  ],
  OTHER: [
    {
      id: "other-scene",
      label: "La escena",
      text: "En esta foto se ve ",
    },
  ],
  DEFAULT: [
    {
      id: "def-scene",
      label: "La escena",
      text: "En esta foto se ve ",
    },
    {
      id: "def-with",
      label: "Con quién",
      text: "Estábamos con ",
    },
  ],
};

export function photoSeedPlaceholder(placeType?: string | null): string {
  switch (placeType) {
    case "VIEWPOINT":
      return "Ej. Vistas al casco al atardecer, viento fresco";
    case "RESTAURANT":
      return "Ej. Pierogi compartidos, local pequeño y ruidoso";
    case "CAFE":
      return "Ej. Café con leche en terraza, gente local leyendo";
    case "MUSEUM":
      return "Ej. Una sala concreta que nos dejó pensativos";
    case "BEACH":
      return "Ej. Primera bañada, agua fría y sol";
    case "PARK":
      return "Ej. Sombra bajo los árboles, picnic improvisado";
    case "HOTEL":
      return "Ej. Habitación con vistas, check-in tarde";
    case "TRANSPORT":
      return "Ej. Tren de madrugada, ventanilla empañada";
    default:
      return "Ej. Café en terraza con vistas al río, lluvia ligera";
  }
}

export function photoSeedStarters(placeType?: string | null): SeedStarter[] {
  const key =
    placeType && placeType in PHOTO_STARTERS
      ? (placeType as PlaceType)
      : "DEFAULT";
  const typed = PHOTO_STARTERS[key] ?? PHOTO_STARTERS.DEFAULT;
  // Always offer a generic “with whom” if not already there
  const hasWith = typed.some((s) => s.id.includes("with") || s.id === "def-with");
  if (hasWith || key === "DEFAULT") return typed;
  return [...typed, PHOTO_STARTERS.DEFAULT[1]!];
}

export const DAY_SEED_STARTERS: SeedStarter[] = [
  {
    id: "day-morning",
    label: "Mañana",
    text: "Por la mañana ",
  },
  {
    id: "day-afternoon",
    label: "Tarde",
    text: "Por la tarde ",
  },
  {
    id: "day-dinner",
    label: "Cena",
    text: "Por la noche cenamos ",
  },
];

export function daySeedPlaceholder(): string {
  return "Ej. Mañana en el casco antiguo, tarde de museo y cena tranquila";
}

/** Append starter text to an existing seed without duplicating if already present. */
export function appendSeedStarter(current: string, starterText: string): string {
  const cur = current.trim();
  // Keep trailing space from starters so the user can keep typing.
  const starter = starterText.replace(/^\s+/, "");
  const starterCore = starter.trim();
  if (!starterCore) return current;
  if (!cur) return starter;
  if (cur.includes(starterCore)) {
    // Already present — leave seed as-is (preserve trailing space if any).
    return current;
  }
  // If current already ends mid-sentence, just append with space
  if (/[,:]\s*$/.test(cur) || /\s$/.test(current)) {
    const joined = `${cur} ${starter}`.replace(/[^\S\n]+/g, " ");
    return joined.endsWith(" ") || !starter.endsWith(" ")
      ? joined
      : `${joined} `;
  }
  // New beat
  const needsBreak = /[.!?…]$/.test(cur);
  const joined = needsBreak ? `${cur} ${starter}` : `${cur}. ${starter}`;
  return joined;
}

export type JournalIntentionId =
  | "contexto"
  | "anecdotas"
  | "tips"
  | "lirico";

export type JournalIntentionChip = {
  id: JournalIntentionId;
  label: string;
  /** Line stored in journalBrief when the chip is active. */
  briefLine: string;
};

export const JOURNAL_INTENTION_CHIPS: JournalIntentionChip[] = [
  {
    id: "contexto",
    label: "Más contexto del destino",
    briefLine:
      "Enfoque: más contexto histórico y cultural del destino, anclado a los lugares visitados.",
  },
  {
    id: "anecdotas",
    label: "Más anécdotas del grupo",
    briefLine:
      "Enfoque: priorizar anécdotas y momentos personales del grupo (solo hechos presentes en notas).",
  },
  {
    id: "tips",
    label: "Más tips prácticos",
    briefLine:
      "Enfoque: incluir consejos útiles para el lector (colas, horarios, qué merece la pena) anclados a lo vivido.",
  },
  {
    id: "lirico",
    label: "Más lírico",
    briefLine:
      "Enfoque: tono más evocador y literario, sin frases vacías de guía turística.",
  },
];

const BRIEF_LINE_SET = new Set(
  JOURNAL_INTENTION_CHIPS.map((c) => c.briefLine)
);

export function activeJournalIntentions(brief: string): JournalIntentionId[] {
  const text = brief ?? "";
  return JOURNAL_INTENTION_CHIPS.filter((c) => text.includes(c.briefLine)).map(
    (c) => c.id
  );
}

export function toggleJournalIntention(
  brief: string,
  intentionId: JournalIntentionId
): string {
  const chip = JOURNAL_INTENTION_CHIPS.find((c) => c.id === intentionId);
  if (!chip) return brief;
  const lines = brief
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const has = lines.includes(chip.briefLine);
  const next = has
    ? lines.filter((l) => l !== chip.briefLine)
    : [...lines, chip.briefLine];
  return next.join("\n");
}

/** Strip known intention lines for display of “free text” part (optional UI). */
export function briefFreeText(brief: string): string {
  return brief
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !BRIEF_LINE_SET.has(l))
    .join("\n");
}

/**
 * Extra system guidance when journal brief contains intention chips.
 * Appended inside briefBlock so generate/refine both see it.
 */
export function journalIntentionPromptAddon(brief: string | null | undefined): string {
  const ids = activeJournalIntentions(brief ?? "");
  if (ids.length === 0) return "";
  const bits: string[] = [
    "INTENCIÓN EDITORIAL (chips del usuario — respétalos con prioridad):",
  ];
  if (ids.includes("contexto")) {
    bits.push(
      "- Añade 1–2 pinceladas de historia/costumbres del destino por capítulo, siempre ancladas a lugares del JSON."
    );
  }
  if (ids.includes("anecdotas")) {
    bits.push(
      "- Dale más peso a lo vivido por el grupo (notas); menos catálogo de monumentos."
    );
  }
  if (ids.includes("tips")) {
    bits.push(
      "- Incluye al menos un consejo práctico anclado a un lugar o día documentado (sin inventar datos)."
    );
    bits.push(
      "- En la CONCLUSIÓN: un cierre útil para quien repita la ruta (horario, cola, qué merece la pena), anclado a hechos del viaje."
    );
  }
  if (ids.includes("lirico")) {
    bits.push(
      "- Tono más evocador; sigue prohibido el relleno turístico vacío."
    );
  }
  bits.push(
    "ARCO NARRATIVO:",
    "- Intro: gancho concreto (detalle, motivo o primer lugar), sin tesis vacía ni cita inventada.",
    "- Cuerpo: conecta días con lo vivido; no listes monumentos como guía turística.",
    "- Cierre: eco de lo contado + utilidad breve si hay material; sin sermón."
  );
  return `\n${bits.join("\n")}`;
}
