/**
 * Ground free-text export briefs into typed ExportDirectives.
 * The user may write anything; we land their expressed needs onto real knobs.
 */

import { createAiClient, getAiConfig } from "@/lib/ai";
import {
  defaultExportDirectives,
  parseExportDirectives,
  type ExportDirectives,
  type ReelDurationPreset,
} from "@/lib/export-directives";

export interface ExportBriefContext {
  /** Which export surface the user is preparing. */
  target: "reel" | "html" | "pdf" | "all";
  /** UI duration selector — always wins over brief duration. */
  durationSeconds?: ReelDurationPreset;
  photoCount?: number;
  hasJournal?: boolean;
  travelTitle?: string;
}

export interface InterpretExportBriefResult {
  directives: ExportDirectives;
  /** true when DeepSeek/OpenAI answered; false = heuristic grounding. */
  fromAi: boolean;
  warning?: string;
}

const SYSTEM_PROMPT = `Eres un editor creativo de exports de viaje (HTML, Reel Instagram, PDF).

El usuario escribe un BRIEF EN TEXTO LIBRE: puede decir CUALQUIER cosa (deseos, tono, ritmo, fotos, textos, galería, mapa, "hazlo influencer", "sin letra", "pocas fotos tranquilas", etc.).

Tu trabajo es ATERRIZAR esas necesidades a un JSON tipado de directrices. NO generas HTML, CSS ni vídeo.

Reglas:
1. Lee el brief completo. Extrae TODAS las preferencias de presentación que se puedan inferir con buena fe.
2. Mapea solo a knobs del schema. Si pide algo que no existe (p.ej. música, filtros Instagram), menciónalo en "interpretation" como no aplicable y aplica el knobs más cercano.
3. No inventes preferencias que el usuario no haya expresado. Campos no mencionados → deja defaults sensatos (medium / balanced / short / mixed).
4. "interpretation": 1 frase corta en el idioma del brief, eco de lo que entendiste (qué vas a enfatizar).
5. Responde SOLO con JSON válido (sin markdown fences), schema:

{
  "version": 1,
  "interpretation": string,
  "html": {
    "imageEmphasis": "low"|"medium"|"high",
    "galleryEmphasis": "low"|"medium"|"high",
    "proseDensity": "low"|"medium"|"high",
    "placeCallouts": "low"|"medium"|"high",
    "mapEmphasis": "low"|"medium"|"high",
    "theme"?: "light"|"dark",
    "preferSectionOrder"?: ["timeline"|"gallery"|"map"|"guide"|"closing"]
  },
  "reel": {
    "durationSeconds"?: 15|30|60,
    "targetPhotoCount"?: number,
    "pacing": "calm"|"balanced"|"punchy",
    "captionMode": "none"|"placeOnly"|"short"|"story",
    "captionPlacement": "bottom"|"center"|"side",
    "transitionStyle": "softFade"|"mixed"|"fastCut",
    "transitionSeconds"?: number,
    "heroBias": "low"|"medium"|"high"
  },
  "pdf": {
    "imageEmphasis": "low"|"medium"|"high",
    "proseDensity": "low"|"medium"|"high",
    "preferFullBleed": "low"|"medium"|"high",
    "mosaicBias": "low"|"medium"|"high"
  }
}

Guía reel:
- pocas fotos / minimalista → targetPhotoCount bajo + pacing calm
- muchas fotos / denso → targetPhotoCount alto + pacing punchy
- sin texto / solo imágenes → captionMode none
- solo nombres de sitios → placeOnly
- textos cortos / legibles → short
- narrativa / citas → story
- suave / lento → softFade + transitionSeconds ~0.45–0.55 + calm
- cortes / dinámico → fastCut + ~0.2 + punchy
- mejores fotos / highlights → heroBias high

Guía html (si el brief habla de página/galería/crónica):
- fotos grandes / protagonismo fotográfico / formas destacadas → imageEmphasis (+galleryEmphasis) high, proseDensity low.
  IMPORTANTE: imageEmphasis high = fotos MÁS GRANDES, NUNCA más repeticiones. Cada foto aparece como máximo 1 vez en «El viaje» y 1 vez en la galería.
- más texto / crónica → proseDensity high, imageEmphasis medium/low
- modo oscuro / dark mode / tema oscuro / dark theme → theme: "dark"
- modo claro / light / fondo claro → theme: "light"
- No inventes theme si el usuario no lo pidió.
- En "interpretation": sé honesto. Si dices modo oscuro, DEBE ir theme:"dark". Si dices fotos protagonistas, habla de tamaño/peso visual, no de «muchas apariciones».
`;

function extractJsonObject(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  const match = candidate.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as unknown;
  } catch {
    return null;
  }
}

function isAiNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|Connection error|fetch failed|getaddrinfo|DEEPSEEK_API_KEY/i.test(
    msg
  );
}

/**
 * Offline / no-AI grounding: land free text onto knobs via lexical cues (ES/EN).
 * Intentionally conservative — only flips knobs when the text clearly asks.
 */
export function groundExportBriefHeuristically(
  brief: string,
  context: ExportBriefContext = { target: "all" }
): ExportDirectives {
  const text = brief.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const base = defaultExportDirectives();
  const duration = context.durationSeconds ?? 30;

  const reel = { ...base.reel! };
  const html = { ...base.html! };
  const pdf = { ...base.pdf! };
  const notes: string[] = [];

  const wantsFewPhotos =
    /\b(pocas?\s+fotos?|few\s+photos?|menos\s+fotos?|minimalista|seleccion\s+corta|solo\s+lo\s+mejor)\b/.test(
      text
    );
  const wantsManyPhotos =
    /\b(muchas?\s+fotos?|mas\s+fotos?|lleno\s+de\s+fotos?|denso|todas?\s+las\s+fotos?|many\s+photos?)\b/.test(
      text
    );

  if (wantsFewPhotos) {
    reel.targetPhotoCount =
      duration <= 15 ? 4 : duration <= 30 ? 6 : 10;
    reel.pacing = "calm";
    reel.heroBias = "high";
    notes.push("pocas fotos");
  } else if (wantsManyPhotos) {
    reel.targetPhotoCount =
      duration <= 15 ? 7 : duration <= 30 ? 12 : 18;
    reel.pacing = "punchy";
    notes.push("más fotos");
  }

  if (
    /\b(sin\s+texto|sin\s+letra|sin\s+caption|no\s+text|textless|solo\s+imagenes?|only\s+photos?|mute\s+text)\b/.test(
      text
    )
  ) {
    reel.captionMode = "none";
    notes.push("sin textos en pantalla");
  } else if (
    /\b(solo\s+lugares?|solo\s+nombres?|place\s+only|nombres?\s+de\s+sitios?)\b/.test(
      text
    )
  ) {
    reel.captionMode = "placeOnly";
    notes.push("solo nombres de lugar");
  } else if (
    /\b(narrativ\w*|historia|citas?|story\s+captions?|textos?\s+largos?|mucho\s+texto\s+en\s+el\s+video)\b/.test(
      text
    )
  ) {
    reel.captionMode = "story";
    notes.push("textos narrativos");
  } else if (
    /\b(textos?\s+cortos?|legibles?|short\s+captions?|poco\s+texto)\b/.test(text)
  ) {
    reel.captionMode = "short";
    notes.push("textos cortos");
  }

  if (
    /\b(tranquil\w*|calmad\w*|lent\w*|suaves?|pausad\w*|relax|chill|slow)\b/.test(
      text
    )
  ) {
    reel.pacing = "calm";
    reel.transitionStyle = "softFade";
    reel.transitionSeconds = 0.5;
    notes.push("ritmo calmado");
  } else if (
    /\b(rapidos?|dinamicos?|punchy|energetic|cortes?\s+rapidos?|upbeat|acelerad\w*)\b/.test(
      text
    )
  ) {
    reel.pacing = "punchy";
    reel.transitionStyle = "fastCut";
    reel.transitionSeconds = 0.22;
    notes.push("ritmo rápido");
  }

  if (/\b(fundidos?|fade|crossfade|transiciones?\s+suaves?)\b/.test(text)) {
    reel.transitionStyle = "softFade";
    if ((reel.transitionSeconds ?? 0.4) <= 0.4) {
      reel.transitionSeconds = 0.5;
    }
    notes.push("fundidos suaves");
  } else if (/\b(cortes?|cuts?|hard\s+cut|whip)\b/.test(text)) {
    reel.transitionStyle = "fastCut";
    if ((reel.transitionSeconds ?? 0.4) >= 0.35) {
      reel.transitionSeconds = 0.2;
    }
    notes.push("cortes rápidos");
  }

  if (
    /\b(mejores?\s+fotos?|highlights?|hero|lo\s+mejor|prioriza|top\s+shots?)\b/.test(
      text
    )
  ) {
    reel.heroBias = "high";
    notes.push("prioriza highlights");
  }

  if (/\b(15\s*s|quince\s+seg|muy\s+corto)\b/.test(text)) {
    reel.durationSeconds = 15;
  } else if (/\b(60\s*s|un\s+minuto|mas\s+largo)\b/.test(text)) {
    reel.durationSeconds = 60;
  } else if (/\b(30\s*s|treinta\s+seg)\b/.test(text)) {
    reel.durationSeconds = 30;
  }

  if (/\b(centro|center|en\s+medio)\b/.test(text)) {
    reel.captionPlacement = "center";
  } else if (/\b(lado|side|lateral)\b/.test(text)) {
    reel.captionPlacement = "side";
  } else if (/\b(abajo|bottom|inferior)\b/.test(text)) {
    reel.captionPlacement = "bottom";
  }

  // HTML cues
  if (
    /\b(fotos?\s+grandes?|protagonismo\s+foto|galeria\s+(muy\s+)?visible|maximo\s+visual|image[- ]first|formas?\s+destacadas?)\b/.test(
      text
    )
  ) {
    html.imageEmphasis = "high";
    html.galleryEmphasis = "high";
    html.proseDensity = "low";
    pdf.imageEmphasis = "high";
    pdf.preferFullBleed = "high";
    notes.push("fotos más grandes (sin repetirlas)");
  }
  if (
    /\b(poca\s+cronica|menos\s+texto|poco\s+texto\s+(en\s+)?(html|pagina|pdf))\b/.test(
      text
    )
  ) {
    html.proseDensity = "low";
    pdf.proseDensity = "low";
    notes.push("poca prosa");
  }
  if (
    /\b(mas\s+cronica|mucho\s+texto|prosa\s+larga|leer\s+bien)\b/.test(text)
  ) {
    html.proseDensity = "high";
    pdf.proseDensity = "high";
    notes.push("más prosa");
  }
  if (/\b(mapa\s+(grande|protagonista|visible)|map\s+first)\b/.test(text)) {
    html.mapEmphasis = "high";
    notes.push("mapa destacado");
  }
  if (
    /\b(modo\s+oscuro|tema\s+oscuro|dark\s+mode|dark\s+theme|fondo\s+oscuro|estilo\s+oscuro)\b/.test(
      text
    )
  ) {
    html.theme = "dark";
    notes.push("modo oscuro");
  } else if (
    /\b(modo\s+claro|tema\s+claro|light\s+mode|fondo\s+claro|estilo\s+claro)\b/.test(
      text
    )
  ) {
    html.theme = "light";
    notes.push("modo claro");
  }

  const interpretation =
    notes.length > 0
      ? `Entendido: ${notes.join(", ")}.`
      : "Brief recibido; se mantiene el estilo equilibrado por defecto.";

  return parseExportDirectives(
    {
      version: 1,
      interpretation,
      html,
      reel,
      pdf,
    },
    { durationHint: duration }
  );
}

async function callInterpretAi(
  brief: string,
  context: ExportBriefContext
): Promise<string> {
  const ai = createAiClient();
  const { model } = getAiConfig();
  const user = JSON.stringify(
    {
      brief,
      contexto: {
        objetivo: context.target,
        duracion_ui_segundos: context.durationSeconds ?? null,
        fotos_seleccionadas: context.photoCount ?? null,
        tiene_cronica: context.hasJournal ?? null,
        titulo_viaje: context.travelTitle ?? null,
        nota:
          "La duración elegida en la UI manda si hay conflicto con durationSeconds del brief.",
      },
    },
    null,
    2
  );

  const completion = await ai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    temperature: 0.25,
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * Interpret free-text brief → clamped ExportDirectives.
 * Empty brief → defaults (no AI). AI failure → heuristic grounding.
 */
export async function interpretExportBrief(
  brief: string | null | undefined,
  context: ExportBriefContext = { target: "all" }
): Promise<InterpretExportBriefResult> {
  const trimmed = brief?.trim() ?? "";
  if (!trimmed) {
    return { directives: defaultExportDirectives(), fromAi: false };
  }

  try {
    const rawText = await callInterpretAi(trimmed, context);
    const parsed = extractJsonObject(rawText);
    if (!parsed) {
      const heuristics = groundExportBriefHeuristically(trimmed, context);
      return {
        directives: heuristics,
        fromAi: false,
        warning: "La IA no devolvió JSON usable; se usó aterrizaje local.",
      };
    }
    const directives = parseExportDirectives(parsed, {
      durationHint: context.durationSeconds,
    });
    const heuristics = groundExportBriefHeuristically(trimmed, context);
    if (!directives.interpretation) {
      directives.interpretation = heuristics.interpretation;
    }
    // If the model echoed "modo oscuro" but forgot theme, land it from heuristics.
    if (!directives.html?.theme && heuristics.html?.theme) {
      directives.html = { ...directives.html!, theme: heuristics.html.theme };
    }
    // Keep interpretation honest: don't claim dark mode without theme.
    if (
      directives.interpretation &&
      /\bmodo oscuro|tema oscuro|dark mode\b/i.test(directives.interpretation) &&
      !directives.html?.theme
    ) {
      directives.html = { ...directives.html!, theme: "dark" };
    }
    return { directives, fromAi: true };
  } catch (error) {
    const heuristics = groundExportBriefHeuristically(trimmed, context);
    return {
      directives: heuristics,
      fromAi: false,
      warning: isAiNetworkError(error)
        ? "Sin conexión a la IA; se aterrizó el brief en local."
        : "Error al interpretar con IA; se usó aterrizaje local.",
    };
  }
}
