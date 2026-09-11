import type OpenAI from "openai";
import type { Note, Photo, Place, Travel, User } from "@prisma/client";
import { createAiClient, getAiConfig } from "@/lib/ai";
import { buildTravelBlogVoiceBlock } from "@/lib/ai-blog-voice";
import { journalIntentionPromptAddon } from "@/lib/blog-seed-prompts";
import {
  destinationFicheFromTravel,
  destinationFichePromptAddon,
  type DestinationFiche,
} from "@/lib/destination-fiche";
import { resolveFlightLegs } from "@/lib/flights";
import type { JournalKind } from "@/lib/journal-kind";
import { placeEmoji, placeLabel } from "@/lib/places";
import { formatDateKey, isoToDateKey, resolveTravelDayRange } from "@/lib/travel-dates";
import {
  extractDayChapterMarkdown,
  filterJournalContextToDay,
  upsertDayChapterMarkdown,
} from "@/lib/journal-day-chapter";

type PhotoWithUser = Photo & {
  user: User;
  place?: { name: string } | null;
};
type NoteWithUser = Note & { user: User; photo: Photo | null };
type PlaceWithUser = Place & {
  user: User;
  notes?: (Note & { user: User })[];
};

export type JournalPipelineStep =
  | "context"
  | "intro"
  | "days"
  | "captions"
  | "conclusion"
  | "assemble"
  | "refine"
  | "complete";

export interface JournalPipelineEvent {
  step: JournalPipelineStep | "error";
  status: "running" | "done" | "error";
  message?: string;
  markdown?: string;
}

export interface EnhancedDayPhoto {
  url: string;
  author: string;
  comments: string[];
  exifDateTime: string | null;
  isTransportStart: boolean;
  isTransportEnd: boolean;
  placeName?: string | null;
}

export interface EnhancedDayBlock {
  date: string;
  dayNotes: { text: string; author: string }[];
  photos: EnhancedDayPhoto[];
  places: { name: string; type: string; comment: string | null; alias: string }[];
}

export interface EnhancedJournalContext {
  title: string;
  participants: string[];
  dateRange: { start: string | null; end: string | null };
  flights: {
    outbound: { label: string; author: string; date: string | null } | null;
    inbound: { label: string; author: string; date: string | null } | null;
  };
  places: { name: string; type: string; comment: string | null; alias: string }[];
  days: EnhancedDayBlock[];
  tripNotes: { text: string; author: string }[];
  /** User free-text: anecdotes, emphasis, tone */
  brief: string | null;
  /** Optional destination fiche (B5) */
  destination: DestinationFiche | null;
}

export type JournalStyle = "narrative" | "factual";

export const JOURNAL_STYLE_LABELS: Record<
  JournalStyle,
  { title: string; description: string }
> = {
  narrative: {
    title: "Vivo",
    description:
      "Crónica cercana, con ritmo natural. Ambienta solo con lo documentado; prioriza detalle concreto sobre adjetivos.",
  },
  factual: {
    title: "Fiel a las notas",
    description:
      "Se ciñe a lo que escribisteis. Solo reescribe con claridad, sin inventar hechos ni escenas.",
  },
};

const VOICE_RULES = `VOZ Y LENGUAJE:
- Escribe como un amigo que cuenta el viaje en voz alta: natural, claro, humano — y con ganas de que otra persona lea el blog.
- Preferir concreto a abstracto (qué pasó, quién estaba, dónde).
- Las notas y comentarios de foto son MATERIA PRIMA: parafraséalos en hechos y ambiente. NO los copies.
- PROHIBIDO en la prosa: blockquotes Markdown (> …), comillas largas con la frase casi literal, y fórmulas tipo «como dijo X: "…"» o «X escribió: …».
- Sí puedes nombrar aliases al contar hechos (“Irene se reía en la plaza”), sin pegar su texto.
- PROHIBIDO (y variantes): inolvidable, mágico/a, experiencia única, tejido de recuerdos, odisea, sinfonía de sensaciones, "cada rincón", "momentos que quedarán grabados".
- Evita párrafos que solo ambientan sin aportar un hecho de los datos.
- Español peninsular natural; no suenes a folleto turístico ni a IA.

CONTEXTO PARA BLOG (historia y curiosidades):
${buildTravelBlogVoiceBlock({ compact: false })}
- Intro y conclusión: enmarca el destino del título del viaje (p. ej. Krakow) con 1–2 pinceladas de historia, tradiciones o costumbres locales útiles para el lector.
- Días: al nombrar lugares_del_dia, añade una curiosidad breve anclada a ese sitio (por qué importa, tradición, gente del lugar), sin inventar que lo visitasteis si no está en los datos.
- Captions: como máximo media frase de color cultural si hay lugar; la semilla/comentario manda sobre lo que se ve.`;

/** Day-summary role: synthesis for «El viaje»; literal quotes live on timeline cards. */
const DAY_SYNTHESIS_RULES = `SÍNTESIS (importante — el export HTML ya muestra las notas literales junto a fotos/lugares):
- Resume lugares visitados y qué se hizo ese día en 1-3 párrafos fluidos, pensados para un capítulo de blog.
- Usa notas_dia y comentarios de fotos solo para extraer hechos; reescríbelos con tus palabras.
- NO repitas citas textuales ni listas "Autor: texto".
- Integra lugares_del_dia en la narración (no como viñetas sueltas) y, si encaja, una curiosidad histórica/cultural por lugar relevante.
- Si hay poca información, 1-2 frases sobrias sin rellenar con inventos personales.`;

/** Exported for unit tests — prompt voice must stay blog-oriented. */
export function journalPipelineVoiceRules(): string {
  return VOICE_RULES;
}

function journalKindPromptAddon(kind: JournalKind): string {
  if (kind !== "blog") return "";
  return `

FORMATO ARTÍCULO BLOG PROFESIONAL (prioridad alta):
- El lector objetivo es alguien que piensa hacer un viaje similar.
- Estructura TEMÁTICA (no cronológica): agrupa por tipo de experiencia.
  Ejemplo Cracovia: free tours; ciudad; comida (si hay RESTAURANT/CAFE); Auschwitz+Birkenau; minas de sal.
- Usa el campo type de cada lugar (RESTAURANT, CAFE, MUSEUM, PARK, BEACH, VIEWPOINT…)
  para repartir secciones cuando encaje; las excursiones fuera van aparte aunque el type sea MUSEUM/OTHER.
- PROHIBIDO estructurar por días del calendario (ni ### fechas ni «Día 1 / Día 2» ni un párrafo por jornada en orden).
- Cada sección ## debe tener un título temático claro y prosa que mezcle lo vivido
  con contexto útil para el lector.
- Intro: gancho del destino. Cierre «Si vas»: tips prácticos anclados a lo documentado.`;
}

interface JournalPromptConfig {
  intro: { system: string; temperature: number };
  days: { system: string; temperature: number };
  captions: { system: string; temperature: number };
  conclusion: { system: string; temperature: number };
}

function briefBlock(brief: string | null | undefined): string {
  const text = brief?.trim();
  if (!text) return "";
  const intentionAddon = journalIntentionPromptAddon(text);
  return `

INDICACIONES DEL USUARIO (prioridad alta):
${text}
Incorpóralas con naturalidad. No inventes nada fuera de estas indicaciones y de los datos del viaje.${intentionAddon}`;
}

/** Exported for regression tests — must not recurse. */
export function journalPromptContextAddon(
  ctx: EnhancedJournalContext,
  kind: JournalKind = "day"
): string {
  return (
    briefBlock(ctx.brief) +
    destinationFichePromptAddon(ctx.destination) +
    journalKindPromptAddon(kind)
  );
}

function getJournalPromptConfig(style: JournalStyle): JournalPromptConfig {
  if (style === "factual") {
    return {
      intro: {
        system: `Eres un editor de crónicas de viaje para un blog. Escribe SOLO la introducción (1-3 párrafos en Markdown).
${VOICE_RULES}
REGLAS ESTRICTAS:
- Usa notas_viaje, participantes, fechas, vuelos, lugares del contexto e indicaciones_usuario.
- Puedes mejorar redacción y añadir curiosidades históricas/culturales ancladas al destino o lugares nombrados.
- NO inventes anécdotas personales, emociones no dichas ni visitas no documentadas.
- Si hay poca información, intro breve y sobria.
- No uses encabezados (#).`,
        temperature: 0.35,
      },
      days: {
        system: `Eres un editor de crónicas de viaje para un blog. Recibirás días con notas, lugares y comentarios de fotos.
Responde SOLO un JSON array: [{"date":"YYYY-MM-DD","summary":"texto markdown"}].
${VOICE_RULES}
${DAY_SYNTHESIS_RULES}
REGLAS ESTRICTAS:
- Un elemento por cada día del input.
- Basa cada párrafo en notas_dia, lugares_del_dia, comentarios de fotos e indicaciones_usuario; puedes enriquecer con curiosidades ancladas a esos lugares.
- No añadas clima inventado, reflexiones personales falsas ni eventos no documentados.
- No incluyas imágenes ni URLs.`,
        temperature: 0.3,
      },
      captions: {
        system: `Reescribe leyendas de fotos para un blog de viaje.
Responde SOLO JSON: [{"url":"...","caption":"leyenda max 120 chars"}].
${VOICE_RULES}
REGLAS ESTRICTAS:
- NO ves las imágenes; solo metadatos y comentarios.
- Basa cada caption en comentarios del usuario; reescribe sin cambiar el significado.
- Si no hay comentarios, leyenda neutra breve ("Foto de {autor}" o el nombre del lugar + micro-curiosidad si hay lugar en los datos).
- PROHIBIDO inventar la escena de la foto (puentes, clima, gestos, objetos no mencionados).`,
        temperature: 0.2,
      },
      conclusion: {
        system: `Eres un editor de crónicas de viaje para un blog. Escribe SOLO la conclusión (1-2 párrafos Markdown).
${VOICE_RULES}
REGLAS ESTRICTAS:
- Cierra usando intro_resumen, dias_resumen e indicaciones_usuario; una pincelada del destino está bien si ya salió en el viaje.
- No inventes moralejas ni experiencias no mencionadas. Sin encabezados.`,
        temperature: 0.35,
      },
    };
  }

  return {
    intro: {
      system: `Eres un cronista de blogs de viaje. Escribe SOLO la introducción (2-4 párrafos en Markdown) de un artículo colaborativo.
${VOICE_RULES}
Puedes dar ritmo y calidez con hechos de los datos e indicaciones_usuario, más 1–2 curiosidades del destino (historia, tradiciones, costumbres) ancladas al título o a lugares del viaje.
Empieza cerca de algo concreto (un detalle del viaje, el motivo, el primer lugar), no con una tesis grandilocuente ni con una cita entre comillas.
No uses encabezados (#).`,
      temperature: 0.65,
    },
    days: {
      system: `Eres un cronista de blogs de viaje. Recibirás días con notas, lugares visitados y fotos.
Responde SOLO un JSON array: [{"date":"YYYY-MM-DD","summary":"texto markdown 1-3 párrafos"}].
${VOICE_RULES}
${DAY_SYNTHESIS_RULES}
Un elemento por cada día. Conecta momentos con transiciones naturales (no "Ese día… Ese día…").
Puedes ambientar con lo implícito mínimo (mañana/tarde por el orden de fotos) y enriquecer con curiosidades ancladas a lugares_del_dia / destino del viaje.
No contradigas las notas ni inventes tormentas, discusiones o visitas no escritas.
Respeta indicaciones_usuario. No incluyas imágenes ni URLs.`,
      temperature: 0.6,
    },
    captions: {
      system: `Escribes pies de foto para un blog de viaje, tono cercano y con gancho para el lector.
Responde SOLO JSON: [{"url":"...","caption":"leyenda max 120 chars"}].
${VOICE_RULES}
NO ves las imágenes. Basa cada caption en comentarios; si no hay, una línea sobria con autor o lugar + micro-curiosidad anclada.
PROHIBIDO inventar la escena de la foto (puentes, clima, gestos, objetos no mencionados en los datos).`,
      temperature: 0.35,
    },
    conclusion: {
      system: `Eres un cronista de blogs de viaje. Escribe SOLO la conclusión (1-3 párrafos Markdown).
${VOICE_RULES}
Cierra con eco de lo vivido (hechos ya contados) y, si encaja, una nota sobre el destino o su gente — sin sermón, sin citas literales nuevas y sin resumen telegráfico de toda la intro.
Si indicaciones_usuario piden tips o enfoque práctico, termina con un consejo útil anclado a un lugar o día ya documentado (sin inventar horarios ni sitios no visitados).
Sin encabezados. Respeta indicaciones_usuario.`,
      temperature: 0.6,
    },
  };
}

interface DaySummaryRow {
  date: string;
  summary: string;
}

export interface BlogSectionRow {
  title: string;
  summary: string;
  /** Place names that belong in this section (for photo attachment). */
  placeHints?: string[];
  /** Optional day keys that feed this theme. */
  dayKeys?: string[];
}

interface PhotoCaptionRow {
  url: string;
  caption: string;
}

export function buildEnhancedJournalContext(
  travel: Travel,
  users: User[],
  photos: PhotoWithUser[],
  notes: NoteWithUser[],
  places: PlaceWithUser[],
  brief?: string | null
): EnhancedJournalContext {
  const selectedPhotos = photos.filter((p) => p.selected);
  const photoNotesByPhotoId = new Map<string, string[]>();

  for (const note of notes) {
    if (note.type === "PHOTO" && note.photoId) {
      const list = photoNotesByPhotoId.get(note.photoId) ?? [];
      list.push(note.text);
      photoNotesByPhotoId.set(note.photoId, list);
    }
  }

  const range = resolveTravelDayRange({
    startDate: travel.startDate?.toISOString() ?? null,
    endDate: travel.endDate?.toISOString() ?? null,
    photoExifDates: selectedPhotos.map((p) => p.exifDateTime?.toISOString() ?? null),
  });

  const placesForContext = places.map((p) => {
    const fromNotes =
      p.notes
        ?.filter((n) => n.type === "PLACE")
        .map((n) => n.text)
        .filter(Boolean) ?? [];
    const comment =
      fromNotes.length > 0 ? fromNotes.join(" · ") : p.comment?.trim() || null;
    return {
      name: p.name,
      type: p.type,
      comment,
      alias: p.user.alias,
      visitedAt: p.visitedAt?.toISOString() ?? null,
    };
  });

  const daysMap = new Map<string, EnhancedDayBlock>();
  for (const key of range.dayKeys) {
    daysMap.set(key, { date: key, dayNotes: [], photos: [], places: [] });
  }

  for (const note of notes) {
    if (note.type !== "DAY" || !note.dayDate) continue;
    const key = isoToDateKey(note.dayDate.toISOString());
    const block = daysMap.get(key) ?? {
      date: key,
      dayNotes: [],
      photos: [],
      places: [],
    };
    block.dayNotes.push({ text: note.text, author: note.user.alias });
    daysMap.set(key, block);
  }

  for (const place of placesForContext) {
    if (!place.visitedAt) continue;
    const key = isoToDateKey(place.visitedAt);
    const block = daysMap.get(key) ?? {
      date: key,
      dayNotes: [],
      photos: [],
      places: [],
    };
    block.places.push({
      name: place.name,
      type: place.type,
      comment: place.comment,
      alias: place.alias,
    });
    daysMap.set(key, block);
  }

  for (const photo of selectedPhotos) {
    const key = photo.exifDateTime
      ? isoToDateKey(photo.exifDateTime.toISOString())
      : range.startKey;
    const block = daysMap.get(key) ?? {
      date: key,
      dayNotes: [],
      photos: [],
      places: [],
    };
    block.photos.push({
      url: photo.url,
      author: photo.user.alias,
      comments: photoNotesByPhotoId.get(photo.id) ?? [],
      exifDateTime: photo.exifDateTime?.toISOString() ?? null,
      isTransportStart: photo.isTransportStart,
      isTransportEnd: photo.isTransportEnd,
      placeName: photo.place?.name ?? null,
    });
    daysMap.set(key, block);
  }

  const flightLegs = resolveFlightLegs(
    selectedPhotos.map((p) => ({
      id: p.id,
      url: p.url,
      latitude: p.latitude,
      longitude: p.longitude,
      isTransportStart: p.isTransportStart,
      isTransportEnd: p.isTransportEnd,
      exifDateTime: p.exifDateTime?.toISOString() ?? null,
      user: { alias: p.user.alias },
    }))
  );

  return {
    title: travel.title,
    participants: users.map((u) => u.alias),
    dateRange: {
      start: travel.startDate?.toISOString() ?? null,
      end: travel.endDate?.toISOString() ?? null,
    },
    flights: {
      outbound: flightLegs.outbound
        ? {
            label: flightLegs.outbound.label,
            author: flightLegs.outbound.photo.user.alias,
            date: flightLegs.outbound.photo.exifDateTime,
          }
        : null,
      inbound: flightLegs.inbound
        ? {
            label: flightLegs.inbound.label,
            author: flightLegs.inbound.photo.user.alias,
            date: flightLegs.inbound.photo.exifDateTime,
          }
        : null,
    },
    places: placesForContext.map(({ name, type, comment, alias }) => ({
      name,
      type,
      comment,
      alias,
    })),
    days: [...daysMap.values()]
      .filter((d) => d.dayNotes.length > 0 || d.photos.length > 0 || d.places.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date)),
    tripNotes: notes
      .filter((n) => n.type === "TRIP")
      .map((n) => ({ text: n.text, author: n.user.alias })),
    brief: brief?.trim() || travel.journalBrief?.trim() || null,
    destination: destinationFicheFromTravel(travel),
  };
}

async function callAi(
  ai: OpenAI,
  model: string,
  system: string,
  user: string,
  temperature = 0.75
): Promise<string> {
  const completion = await ai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

function extractJsonArray<T>(text: string): T[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]) as T[];
  } catch {
    return [];
  }
}

export interface JournalPipelineOptions {
  /** When set, refine this markdown instead of generating from scratch. */
  existingMarkdown?: string | null;
  /** day = diario por fechas; blog = artículo continuo. */
  kind?: JournalKind;
  /**
   * When set with kind=day, generate or refine only this calendar day (YYYY-MM-DD)
   * and merge the ### chapter into the full chronicle.
   */
  dayKey?: string | null;
  /** Full day-chronicle document to merge a single-day chapter into. */
  mergeIntoMarkdown?: string | null;
  /** Explicit refine vs fresh for single-day runs. */
  mode?: "refine" | "fresh";
}

const MAX_EXISTING_MARKDOWN_CHARS = 60_000;

function getRefineSystemPrompt(
  style: JournalStyle,
  kind: JournalKind = "day"
): { system: string; temperature: number } {
  const structureDay = `- Mantén el título (# …), la sección «El viaje día a día» con capítulos ### por fecha, anexos (Lugares / Transporte / Notas) y conclusión.`;
  const structureBlog = `- Mantén estructura de ARTÍCULO TEMÁTICO (no diario): título (# …), secciones ## con títulos de tema
  (tours, ciudad, gastronomía, excursiones…), anexos (Lugares / Transporte / Notas) y cierre «## Si vas».
- Si la crónica actual está troceada por días (### fechas o párrafos «Día N»), reorganízala en secciones temáticas.
- PROHIBIDO dejar capítulos por fecha.
- El tono debe servir a alguien que planea un viaje similar (tips anclados a lo vivido).`;

  const base = `Eres un editor de crónicas de viaje colaborativas pensadas para un BLOG.
Te dan la crónica Markdown YA ESCRITA (puede incluir ediciones humanas) y el contexto actualizado del viaje (notas, fotos, lugares, vuelos) más indicaciones_usuario si existen.

Tu tarea: devolver UNA única crónica Markdown completa REFINADA.

${VOICE_RULES}
${journalKindPromptAddon(kind)}

REGLAS DE REFINAMIENTO:
- Parte de la crónica existente: conserva el tono, la estructura pedida y las formulaciones que ya funcionan.
- Incorpora notas, fotos o lugares NUEVOS que falten en el texto — como SÍNTESIS, no como citas pegadas.
- En los párrafos del cuerpo: resume lugares y hechos; añade curiosidades históricas/culturales ancladas a lugares o al destino del título cuando falten y aporten al lector.
- PROHIBIDO blockquotes (>) y comillas con el texto casi literal de notas/comentarios (esas citas viven en el recorrido del export).
- Si la crónica actual tiene citas literales de notas, reescríbelas como prosa resumida.
- Corrige solo lo contradictorio, vacío o claramente peor que el contexto nuevo.
- NO tires el texto para reescribirlo de cero si no hace falta.
- PRESERVA todas las imágenes Markdown existentes (![alt](url)) y sus URLs; puedes mejorar el alt/caption con micro-contexto del lugar.
- Añade imágenes de fotos nuevas del contexto si aún no están en la crónica, con caption breve.
${kind === "blog" ? structureBlog : structureDay}
- Respeta indicaciones_usuario con prioridad alta.
- Si las indicaciones piden tips: asegura al menos un consejo práctico anclado a un lugar/día del contexto (en cuerpo o cierre).
- Responde SOLO con el Markdown final, sin explicaciones ni fences \`\`\`.`;

  if (style === "factual") {
    return {
      system: `${base}
ESTILO FIEL A LAS NOTAS:
- No inventes anécdotas personales, emociones ni escenas de foto no documentadas.
- Sí puedes completar con hechos culturales/históricos sobrios anclados a lugares nombrados o al destino.
- Prefiere pulir y completar con material real del contexto.`,
      temperature: 0.35,
    };
  }

  return {
    system: `${base}
ESTILO VIVO:
- Puedes enriquecer atmósfera, ritmo y color local (historia, tradiciones, costumbres) anclado a lugares/destino, sin contradecir notas ni ediciones humanas claras.`,
    temperature: 0.65,
  };
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

/**
 * Remove literal note dumps from day prose so HTML «El viaje» doesn't echo
 * the same quotes already shown on photo/place cards.
 */
export function sanitizeDaySummaryProse(text: string): string {
  const cleaned = text
    .replace(/^>\s?.*$/gm, "")
    .replace(/^[«"“].+[»"”]\s*$/gm, "")
    .replace(
      /^#{0,3}\s*[A-Za-zÁÉÍÓÚÜáéíóúüñÑ][\wÁÉÍÓÚÜáéíóúüñÑ.-]{0,32}:\s*[«"“].+$/gm,
      ""
    )
    .replace(
      /\*\*[^*]{1,40}\*\*:\s*[«"“][^»"”]{0,280}[»"”]/g,
      ""
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned;
}

/** Strip blockquotes from day ### sections only; keep image captions intact. */
export function sanitizeJournalDayProse(markdown: string): string {
  if (!markdown.trim()) return markdown;
  const parts = markdown.split(/\n(?=###\s+)/);
  return parts
    .map((part) => {
      if (!/^\s*###\s+/.test(part)) return part;
      const match = part.match(/^(\s*###\s+.+?(?:\n|$))([\s\S]*)$/);
      if (!match) return part;
      const heading = match[1] ?? "";
      const body = match[2] ?? "";
      // Split body into prose vs trailing media (images / *author* lines).
      const mediaStart = body.search(/\n!\[/);
      if (mediaStart < 0) {
        return `${heading}${sanitizeDaySummaryProse(body)}`;
      }
      const prose = body.slice(0, mediaStart);
      const media = body.slice(mediaStart);
      return `${heading}${sanitizeDaySummaryProse(prose)}${media}`;
    })
    .join("\n");
}

function buildRefineUserPayload(
  ctx: EnhancedJournalContext,
  existingMarkdown: string
): string {
  const clipped =
    existingMarkdown.length > MAX_EXISTING_MARKDOWN_CHARS
      ? `${existingMarkdown.slice(0, MAX_EXISTING_MARKDOWN_CHARS)}\n\n…[crónica truncada por longitud]`
      : existingMarkdown;

  return JSON.stringify(
    {
      cronica_actual: clipped,
      indicaciones_usuario: ctx.brief,
      contexto_viaje: {
        titulo: ctx.title,
        participantes: ctx.participants,
        fechas: ctx.dateRange,
        vuelos: ctx.flights,
        notas_viaje: ctx.tripNotes,
        lugares: ctx.places,
        dias: ctx.days.map((d) => ({
          date: d.date,
          notas_dia: d.dayNotes,
          lugares_del_dia: d.places,
          fotos: d.photos.map((p) => ({
            url: p.url,
            autor: p.author,
            comentarios: p.comments,
            lugar: p.placeName ?? null,
            ida: p.isTransportStart,
            vuelta: p.isTransportEnd,
            fecha: p.exifDateTime,
          })),
        })),
      },
    },
    null,
    2
  );
}

export async function refineJournalMarkdown(
  ai: OpenAI,
  model: string,
  ctx: EnhancedJournalContext,
  existingMarkdown: string,
  style: JournalStyle = "narrative",
  kind: JournalKind = "day"
): Promise<string> {
  const { system, temperature } = getRefineSystemPrompt(style, kind);
  const raw = await callAi(
    ai,
    model,
    system + journalPromptContextAddon(ctx, kind),
    buildRefineUserPayload(ctx, existingMarkdown),
    temperature
  );
  const refined = stripMarkdownFences(raw);
  if (!refined || refined.length < 40) {
    throw new Error("La IA devolvió una crónica vacía al refinar");
  }
  return kind === "blog" ? refined : sanitizeJournalDayProse(refined);
}

export async function generateIntroduction(
  ai: OpenAI,
  model: string,
  ctx: EnhancedJournalContext,
  style: JournalStyle = "narrative",
  kind: JournalKind = "day"
): Promise<string> {
  const prompts = getJournalPromptConfig(style);
  const user = JSON.stringify(
    {
      titulo: ctx.title,
      participantes: ctx.participants,
      fechas: ctx.dateRange,
      vuelos: ctx.flights,
      notas_viaje: ctx.tripNotes,
      num_lugares: ctx.places.length,
      indicaciones_usuario: ctx.brief,
    },
    null,
    2
  );
  return callAi(
    ai,
    model,
    prompts.intro.system + journalPromptContextAddon(ctx, kind),
    user,
    prompts.intro.temperature
  );
}

export async function generateDaySummaries(
  ai: OpenAI,
  model: string,
  ctx: EnhancedJournalContext,
  style: JournalStyle = "narrative",
  kind: JournalKind = "day"
): Promise<DaySummaryRow[]> {
  if (ctx.days.length === 0) return [];

  const prompts = getJournalPromptConfig(style);
  const user = JSON.stringify(
    {
      indicaciones_usuario: ctx.brief,
      dias: ctx.days.map((d) => ({
        date: d.date,
        notas_dia: d.dayNotes,
        lugares_del_dia: d.places,
        fotos: d.photos.map((p) => ({
          autor: p.author,
          comentarios: p.comments,
          lugar: p.placeName ?? null,
          ida: p.isTransportStart,
          vuelta: p.isTransportEnd,
        })),
      })),
    },
    null,
    2
  );

  const raw = await callAi(
    ai,
    model,
    prompts.days.system + journalPromptContextAddon(ctx, kind),
    user,
    prompts.days.temperature
  );
  const parsed = extractJsonArray<DaySummaryRow>(raw);

  if (parsed.length > 0) {
    return parsed.map((row) => ({
      ...row,
      summary: sanitizeDaySummaryProse(row.summary ?? ""),
    }));
  }

  return ctx.days.map((d) => ({
    date: d.date,
    summary: sanitizeDaySummaryProse(
      d.dayNotes.map((n) => n.text).join(" ") ||
        (d.places.length > 0
          ? `Pasamos por ${d.places.map((p) => p.name).join(", ")}.`
          : "Día de exploración y momentos compartidos.")
    ),
  }));
}

/**
 * Thematic sections for a professional travel-blog article (not day chapters).
 */
export async function generateBlogSections(
  ai: OpenAI,
  model: string,
  ctx: EnhancedJournalContext,
  style: JournalStyle = "narrative"
): Promise<BlogSectionRow[]> {
  const prompts = getJournalPromptConfig(style);
  const system = `Eres editor de un blog de viajes profesional.
Debes proponer la estructura TEMÁTICA del artículo (no un diario por días).
Responde SOLO un JSON array:
[{"title":"Título de sección","summary":"1-3 párrafos markdown","placeHints":["Lugar A"],"dayKeys":["YYYY-MM-DD"]}].

${VOICE_RULES}
${journalKindPromptAddon("blog")}

REGLAS:
- 3 a 6 secciones. Títulos concretos (p. ej. «Free tours por el casco», «Pasear Cracovia», «Comer en Cracovia», «Auschwitz y Birkenau», «Minas de sal de Bochnia»), nunca «Día 1» ni fechas.
- Usa el campo type de cada lugar para repartir temas: RESTAURANT/CAFE → comida; MUSEUM → cultura/museos; PARK/BEACH/VIEWPOINT → naturaleza; HOTEL/TRANSPORT solo si aportan al relato.
- Excursiones fuera de la ciudad: aunque el type sea MUSEUM u OTHER, si el nombre/notas indican salida (Auschwitz, Bochnia, Wieliczka…), sección propia de excursión.
- Ejemplo Cracovia: (1) free tours, (2) ciudad/casco, (3) comida si hay restaurantes/cafés, (4) cada excursión fuera en su sección.
- Agrupa por TIPO de experiencia, no por orden del calendario. Si dos días tuvieron free tour, van en la MISMA sección de tours.
- Cada summary sintetiza notas_dia, comentarios de foto y lugares de ese tema; sin citas literales ni «el lunes… / el martes…» como estructura.
- placeHints: nombres de lugares del contexto que caen en esa sección (pueden ser []).
- dayKeys: días cuyas notas alimentan el tema (pueden ser []; no uses dayKeys para forzar un capítulo por día).
- No inventes visitas no documentadas. Sí puedes añadir 1 curiosidad anclada a un lugar nombrado.
- Respeta indicaciones_usuario.`;

  const user = JSON.stringify(
    {
      titulo: ctx.title,
      destino: ctx.destination,
      indicaciones_usuario: ctx.brief,
      lugares: ctx.places,
      dias: ctx.days.map((d) => ({
        date: d.date,
        notas_dia: d.dayNotes,
        lugares_del_dia: d.places,
        fotos: d.photos.map((p) => ({
          autor: p.author,
          comentarios: p.comments,
          lugar: p.placeName ?? null,
        })),
      })),
    },
    null,
    2
  );

  const raw = await callAi(
    ai,
    model,
    system + briefBlock(ctx.brief) + destinationFichePromptAddon(ctx.destination),
    user,
    prompts.days.temperature
  );
  const parsed = extractJsonArray<BlogSectionRow>(raw)
    .map((row) => ({
      title: (row.title ?? "").trim(),
      summary: sanitizeDaySummaryProse(row.summary ?? ""),
      placeHints: Array.isArray(row.placeHints)
        ? row.placeHints.map((h) => String(h).trim()).filter(Boolean)
        : [],
      dayKeys: Array.isArray(row.dayKeys)
        ? row.dayKeys.map((h) => String(h).trim()).filter(Boolean)
        : [],
    }))
    .filter((row) => row.title && row.summary);

  if (parsed.length > 0) return parsed;
  return buildLocalBlogSections(ctx);
}

/** Offline / fallback thematic outline from places + day notes + PlaceType. */
export function buildLocalBlogSections(
  ctx: EnhancedJournalContext
): BlogSectionRow[] {
  type PlaceRow = EnhancedJournalContext["places"][number];

  const excursionRe =
    /auschwitz|birkenau|bochnia|sal|mina|excursion|excursión|wieliczka|zakopane|visita guiada fuera/i;
  const tourRe = /tour|free\s*tour|visita guiada|gu[ií]a/i;

  const FOOD_TYPES = new Set(["RESTAURANT", "CAFE"]);
  const CULTURE_TYPES = new Set(["MUSEUM"]);
  const NATURE_TYPES = new Set(["PARK", "BEACH", "VIEWPOINT"]);
  const SKIP_THEME_TYPES = new Set(["HOTEL", "TRANSPORT"]);

  const dayBlob = (d: EnhancedDayBlock) =>
    [...d.dayNotes.map((n) => n.text), ...d.places.map((p) => p.name)].join(" ");

  const dayKeysMatching = (re: RegExp) =>
    ctx.days.filter((d) => re.test(dayBlob(d))).map((d) => d.date);

  const notesMatching = (re: RegExp) =>
    ctx.days
      .filter((d) => re.test(dayBlob(d)))
      .flatMap((d) => d.dayNotes.map((n) => n.text));

  const excursionPlaces = ctx.places.filter((p) =>
    excursionRe.test(`${p.name} ${p.comment ?? ""}`)
  );
  const afterExcursion = ctx.places.filter((p) => !excursionPlaces.includes(p));
  const tourPlaces = afterExcursion.filter((p) =>
    tourRe.test(`${p.name} ${p.comment ?? ""}`)
  );
  const leftover = afterExcursion.filter((p) => !tourPlaces.includes(p));

  const foodPlaces = leftover.filter((p) => FOOD_TYPES.has(p.type));
  const culturePlaces = leftover.filter((p) => CULTURE_TYPES.has(p.type));
  const naturePlaces = leftover.filter((p) => NATURE_TYPES.has(p.type));
  const cityPlaces = leftover.filter(
    (p) =>
      !FOOD_TYPES.has(p.type) &&
      !CULTURE_TYPES.has(p.type) &&
      !NATURE_TYPES.has(p.type) &&
      !SKIP_THEME_TYPES.has(p.type)
  );

  const sections: BlogSectionRow[] = [];

  const pushNamed = (
    title: string,
    places: PlaceRow[],
    summaryFallback: string,
    re?: RegExp
  ) => {
    const notes = re ? notesMatching(re) : [];
    sections.push({
      title,
      summary: notes.join(" ") || summaryFallback,
      placeHints: places.map((p) => p.name),
      dayKeys: re ? dayKeysMatching(re) : [],
    });
  };

  if (
    tourPlaces.length > 0 ||
    ctx.days.some((d) => tourRe.test(d.dayNotes.map((n) => n.text).join(" ")))
  ) {
    pushNamed(
      "Tours y rutas por la ciudad",
      tourPlaces,
      `Recorridos guiados y free tours entre ${tourPlaces.map((p) => p.name).join(", ") || "los puntos clave del destino"}.`,
      tourRe
    );
  }

  if (cityPlaces.length > 0 || ctx.days.length > 0) {
    const cityNotes = ctx.days
      .filter((d) => !excursionRe.test(dayBlob(d)))
      .flatMap((d) => d.dayNotes.map((n) => n.text));
    sections.push({
      title: `Descubrir ${ctx.destination?.name ?? ctx.title}`,
      summary:
        cityNotes.slice(0, 6).join(" ") ||
        `Paseos por la ciudad${cityPlaces.length ? `: ${cityPlaces.map((p) => p.name).join(", ")}` : ""}.`,
      placeHints: cityPlaces.map((p) => p.name),
      dayKeys: ctx.days
        .filter((d) => !excursionRe.test(dayBlob(d)))
        .map((d) => d.date),
    });
  }

  if (foodPlaces.length > 0) {
    const nameRe = new RegExp(
      foodPlaces
        .map((p) => p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|"),
      "i"
    );
    pushNamed(
      `Comer en ${ctx.destination?.name ?? ctx.title}`,
      foodPlaces,
      `Mesas y cafés: ${foodPlaces.map((p) => p.name).join(", ")}.`,
      nameRe
    );
  }

  if (culturePlaces.length > 0) {
    const nameRe = new RegExp(
      culturePlaces
        .map((p) => p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|"),
      "i"
    );
    pushNamed(
      "Museos y cultura",
      culturePlaces,
      `Paradas culturales: ${culturePlaces.map((p) => p.name).join(", ")}.`,
      nameRe
    );
  }

  if (naturePlaces.length > 0) {
    const nameRe = new RegExp(
      naturePlaces
        .map((p) => p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|"),
      "i"
    );
    pushNamed(
      "Naturaleza y miradores",
      naturePlaces,
      `Aire libre: ${naturePlaces.map((p) => p.name).join(", ")}.`,
      nameRe
    );
  }

  if (excursionPlaces.length > 0) {
    // Prefer one section per major site when names differ (Auschwitz vs Bochnia).
    const byCluster = new Map<string, PlaceRow[]>();
    for (const p of excursionPlaces) {
      const key = /auschwitz|birkenau/i.test(p.name)
        ? "auschwitz"
        : /bochnia|wieliczka|sal|mina/i.test(`${p.name} ${p.comment ?? ""}`)
          ? "salt"
          : p.name.toLowerCase();
      const list = byCluster.get(key) ?? [];
      list.push(p);
      byCluster.set(key, list);
    }
    for (const group of byCluster.values()) {
      const names = group.map((p) => p.name);
      const nameRe = new RegExp(
        names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
        "i"
      );
      const dayKeys = dayKeysMatching(nameRe);
      sections.push({
        title:
          group.length === 1
            ? `Excursión: ${group[0]!.name}`
            : `Excursión: ${names.join(" · ")}`,
        summary:
          ctx.days
            .filter((d) => dayKeys.includes(d.date))
            .flatMap((d) => d.dayNotes.map((n) => n.text))
            .join(" ") ||
          `Salida fuera de la ciudad a ${names.join(" y ")}.`,
        placeHints: names,
        dayKeys,
      });
    }
  }

  if (sections.length === 0) {
    sections.push({
      title: `El viaje a ${ctx.title}`,
      summary: ctx.days
        .map((d) => d.dayNotes.map((n) => n.text).join(" "))
        .filter(Boolean)
        .join("\n\n") || "Relato del viaje a partir de notas y fotos.",
      placeHints: ctx.places.map((p) => p.name),
      dayKeys: ctx.days.map((d) => d.date),
    });
  }

  return sections.map((s) => ({
    ...s,
    summary: sanitizeDaySummaryProse(s.summary),
  }));
}

export async function generatePhotoCaptions(
  ai: OpenAI,
  model: string,
  ctx: EnhancedJournalContext,
  style: JournalStyle = "narrative",
  kind: JournalKind = "day"
): Promise<PhotoCaptionRow[]> {
  const allPhotos = ctx.days.flatMap((d) =>
    d.photos.map((p) => ({
      url: p.url,
      autor: p.author,
      comentarios: p.comments,
      fecha: p.exifDateTime,
      lugar: p.placeName ?? null,
    }))
  );

  if (allPhotos.length === 0) return [];

  const prompts = getJournalPromptConfig(style);
  const user = JSON.stringify(
    { indicaciones_usuario: ctx.brief, fotos: allPhotos },
    null,
    2
  );
  const raw = await callAi(
    ai,
    model,
    prompts.captions.system + journalPromptContextAddon(ctx, kind),
    user,
    prompts.captions.temperature
  );
  const parsed = extractJsonArray<PhotoCaptionRow>(raw);

  if (parsed.length > 0) return parsed;

  return allPhotos.map((p) => ({
    url: p.url,
    caption:
      p.comentarios.join(" · ") ||
      (p.lugar ? `${p.lugar} — ${p.autor}` : `Momento capturado por ${p.autor}`),
  }));
}

export async function generateConclusion(
  ai: OpenAI,
  model: string,
  ctx: EnhancedJournalContext,
  intro: string,
  daySummaries: DaySummaryRow[],
  style: JournalStyle = "narrative",
  kind: JournalKind = "day",
  blogSections: BlogSectionRow[] = []
): Promise<string> {
  const prompts = getJournalPromptConfig(style);
  const user = JSON.stringify(
    {
      titulo: ctx.title,
      participantes: ctx.participants,
      intro_resumen: intro.slice(0, 500),
      dias_resumen: daySummaries.map((d) => ({
        date: d.date,
        preview: d.summary.slice(0, 200),
      })),
      secciones_blog: blogSections.map((s) => ({
        title: s.title,
        preview: s.summary.slice(0, 200),
      })),
      lugares: ctx.places.length,
      indicaciones_usuario: ctx.brief,
    },
    null,
    2
  );
  return callAi(
    ai,
    model,
    prompts.conclusion.system + journalPromptContextAddon(ctx, kind),
    user,
    prompts.conclusion.temperature
  );
}

export function assembleJournalMarkdown(
  ctx: EnhancedJournalContext,
  intro: string,
  daySummaries: DaySummaryRow[],
  captions: PhotoCaptionRow[],
  conclusion: string
): string {
  const captionByUrl = new Map(captions.map((c) => [c.url, c.caption]));
  const summaryByDate = new Map(daySummaries.map((d) => [d.date, d.summary]));

  const lines: string[] = [
    `# ${ctx.title}`,
    "",
    intro.trim(),
    "",
    "---",
    "",
    "## El viaje día a día",
    "",
  ];

  const daysToRender =
    ctx.days.length > 0
      ? ctx.days
      : daySummaries.map((d) => ({
          date: d.date,
          dayNotes: [],
          photos: [] as EnhancedDayPhoto[],
          places: [] as EnhancedDayBlock["places"],
        }));

  for (const day of daysToRender) {
    lines.push(`### ${formatDateKey(day.date)}`, "");
    const summary =
      summaryByDate.get(day.date) ??
      (day.dayNotes.map((n) => n.text).join(" ") ||
        "_Sin notas para este día._");
    lines.push(sanitizeDaySummaryProse(summary.trim()) || "_Sin notas para este día._", "");

    const sortedPhotos = [...day.photos].sort((a, b) => {
      const ta = a.exifDateTime ? new Date(a.exifDateTime).getTime() : 0;
      const tb = b.exifDateTime ? new Date(b.exifDateTime).getTime() : 0;
      return ta - tb;
    });

    for (const photo of sortedPhotos) {
      const defaultCap =
        photo.comments.join(" · ") ||
        (photo.isTransportStart
          ? "Salida — inicio del viaje"
          : photo.isTransportEnd
            ? "Regreso — fin del viaje"
            : "Momento del viaje");
      const caption = captionByUrl.get(photo.url) ?? defaultCap;
      lines.push(`![${caption.replace(/[\[\]]/g, "")}](${photo.url})`, "", `*${photo.author}*`, "");
    }
  }

  appendJournalMetaSections(lines, ctx);
  lines.push("---", "", conclusion.trim());
  return lines.join("\n");
}

function appendJournalMetaSections(
  lines: string[],
  ctx: EnhancedJournalContext
): void {
  if (ctx.places.length > 0) {
    lines.push("---", "", "## Lugares del recorrido", "");
    for (const place of ctx.places) {
      const emoji = placeEmoji(place.type as Parameters<typeof placeEmoji>[0]);
      const typeLabel = placeLabel(place.type as Parameters<typeof placeLabel>[0]);
      lines.push(
        `- ${emoji} **${place.name}** (${typeLabel})${place.comment ? ` — ${place.comment}` : ""} · *${place.alias}*`
      );
    }
    lines.push("");
  }

  if (ctx.flights.outbound || ctx.flights.inbound) {
    lines.push("## Transporte", "");
    if (ctx.flights.outbound) {
      lines.push(
        `- ✈️ **Ida** — ${ctx.flights.outbound.author}${ctx.flights.outbound.date ? ` (${new Date(ctx.flights.outbound.date).toLocaleDateString("es-ES")})` : ""}`
      );
    }
    if (ctx.flights.inbound) {
      lines.push(
        `- 🛬 **Vuelta** — ${ctx.flights.inbound.author}${ctx.flights.inbound.date ? ` (${new Date(ctx.flights.inbound.date).toLocaleDateString("es-ES")})` : ""}`
      );
    }
    lines.push("");
  }

  if (ctx.tripNotes.length > 0) {
    lines.push("## Notas del viaje", "");
    for (const note of ctx.tripNotes) {
      lines.push(`**${note.author}:** ${note.text}`, "");
    }
  }
}

/**
 * Continuous blog article with thematic ## sections (not day ### chapters).
 */
export function assembleBlogJournalMarkdown(
  ctx: EnhancedJournalContext,
  intro: string,
  sections: BlogSectionRow[],
  captions: PhotoCaptionRow[],
  conclusion: string
): string {
  const captionByUrl = new Map(captions.map((c) => [c.url, c.caption]));
  const usedPhotoUrls = new Set<string>();

  const allPhotos = ctx.days.flatMap((d) =>
    d.photos.map((p) => ({ ...p, dayKey: d.date }))
  );

  const pickPhotosForSection = (section: BlogSectionRow) => {
    const hints = (section.placeHints ?? []).map((h) => h.toLowerCase());
    const days = new Set(section.dayKeys ?? []);
    const matched = allPhotos.filter((p) => {
      if (usedPhotoUrls.has(p.url)) return false;
      const place = (p.placeName ?? "").toLowerCase();
      const placeHit =
        hints.length > 0 &&
        hints.some((h) => place.includes(h) || h.includes(place));
      const dayHit = days.size > 0 && days.has(p.dayKey);
      return placeHit || (dayHit && hints.length === 0);
    });
    // If hints matched nothing, fall back to dayKeys only.
    const pool =
      matched.length > 0
        ? matched
        : allPhotos.filter(
            (p) =>
              !usedPhotoUrls.has(p.url) &&
              days.size > 0 &&
              days.has(p.dayKey)
          );
    for (const p of pool) usedPhotoUrls.add(p.url);
    return pool;
  };

  const lines: string[] = [
    `# ${ctx.title}`,
    "",
    intro.trim(),
    "",
    "---",
    "",
  ];

  const sectionsToRender =
    sections.length > 0
      ? sections
      : buildLocalBlogSections(ctx);

  for (const section of sectionsToRender) {
    lines.push(`## ${section.title.trim()}`, "");
    const prose = sanitizeDaySummaryProse(section.summary.trim());
    if (prose) lines.push(prose, "");

    const photos = pickPhotosForSection(section);
    for (const photo of photos) {
      const defaultCap =
        photo.comments.join(" · ") ||
        (photo.isTransportStart
          ? "Salida — inicio del viaje"
          : photo.isTransportEnd
            ? "Regreso — fin del viaje"
            : "Momento del viaje");
      const caption = captionByUrl.get(photo.url) ?? defaultCap;
      lines.push(
        `![${caption.replace(/[\[\]]/g, "")}](${photo.url})`,
        "",
        `*${photo.author}*`,
        ""
      );
    }
  }

  // Leftover photos (not matched to a theme) under Momentos.
  const leftovers = allPhotos.filter((p) => !usedPhotoUrls.has(p.url));
  if (leftovers.length > 0) {
    lines.push("## Momentos", "");
    for (const photo of leftovers) {
      const defaultCap =
        photo.comments.join(" · ") ||
        (photo.isTransportStart
          ? "Salida — inicio del viaje"
          : photo.isTransportEnd
            ? "Regreso — fin del viaje"
            : "Momento del viaje");
      const caption = captionByUrl.get(photo.url) ?? defaultCap;
      lines.push(
        `![${caption.replace(/[\[\]]/g, "")}](${photo.url})`,
        "",
        `*${photo.author}*`,
        ""
      );
    }
  }

  appendJournalMetaSections(lines, ctx);
  lines.push("---", "", "## Si vas", "", conclusion.trim());
  return lines.join("\n");
}

export function assembleJournalByKind(
  kind: JournalKind,
  ctx: EnhancedJournalContext,
  intro: string,
  daySummaries: DaySummaryRow[],
  captions: PhotoCaptionRow[],
  conclusion: string,
  blogSections?: BlogSectionRow[]
): string {
  if (kind === "blog") {
    return assembleBlogJournalMarkdown(
      ctx,
      intro,
      blogSections ?? buildLocalBlogSections(ctx),
      captions,
      conclusion
    );
  }
  return assembleJournalMarkdown(ctx, intro, daySummaries, captions, conclusion);
}

export type PipelineProgressCallback = (event: JournalPipelineEvent) => void;

export function isAiUnreachableError(error: unknown): boolean {
  const parts: string[] = [];
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i++) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  const msg = parts.join(" ");
  return /EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|Connection error|fetch failed|getaddrinfo/i.test(
    msg
  );
}

/** Template journal when DeepSeek API is unreachable (e.g. NAS DNS issues). */
export function buildLocalJournalMarkdown(
  ctx: EnhancedJournalContext,
  kind: JournalKind = "day"
): string {
  const intro =
    kind === "blog"
      ? `Guía vivida de **${ctx.title}**, contada por ${ctx.participants.join(", ")} — útil si estás pensando en un viaje parecido.`
      : `Diario colaborativo del viaje **${ctx.title}**, con la participación de ${ctx.participants.join(", ")}.`;

  const daySummaries: DaySummaryRow[] = ctx.days.map((d) => ({
    date: d.date,
    summary:
      d.dayNotes.map((n) => `**${n.author}:** ${n.text}`).join("\n\n") ||
      "Recorrido y momentos compartidos durante este día.",
  }));

  const captions: PhotoCaptionRow[] = ctx.days.flatMap((d) =>
    d.photos.map((p) => ({
      url: p.url,
      caption:
        p.comments.join(" · ") ||
        (p.isTransportStart
          ? "Salida — inicio del viaje"
          : p.isTransportEnd
            ? "Regreso — fin del viaje"
            : `Foto de ${p.author}`),
    }))
  );

  const conclusion =
    kind === "blog"
      ? `Si vas a **${ctx.title}**, reserva tiempo para pasear sin prisa y anota los sitios que más os gustaron. Gracias a ${ctx.participants.join(", ")} por compartir el viaje.`
      : `Fin del relato de **${ctx.title}**. Gracias a todos los participantes por compartir este viaje.`;

  const blogSections = kind === "blog" ? buildLocalBlogSections(ctx) : undefined;
  const body = assembleJournalByKind(
    kind,
    ctx,
    intro,
    daySummaries,
    captions,
    conclusion,
    blogSections
  );
  return `> ⚠️ *Crónica generada sin IA: el servidor no pudo contactar el servicio de IA (revisa DNS/red del NAS). Puedes volver a generar cuando haya conexión.*\n\n${body}`;
}

export async function runJournalPipeline(
  ctx: EnhancedJournalContext,
  onProgress?: PipelineProgressCallback,
  style: JournalStyle = "narrative",
  options: JournalPipelineOptions = {}
): Promise<string> {
  const emit = (event: JournalPipelineEvent) => onProgress?.(event);
  const kind: JournalKind = options.kind === "blog" ? "blog" : "day";
  const dayKey = options.dayKey?.trim() || null;

  if (dayKey) {
    if (kind !== "day") {
      throw new Error("La generación por día solo está disponible en la crónica «por días».");
    }
    return runSingleDayJournalPipeline(ctx, dayKey, emit, style, options);
  }

  const existingMarkdown = options.existingMarkdown?.trim() || null;

  try {
    const ai = createAiClient();
    const { model } = getAiConfig();

    emit({ step: "context", status: "done", message: "Datos del viaje preparados" });

    if (existingMarkdown) {
      emit({
        step: "refine",
        status: "running",
        message:
          kind === "blog"
            ? "Refinando el artículo blog…"
            : "Refinando la crónica existente…",
      });
      const markdown = await refineJournalMarkdown(
        ai,
        model,
        ctx,
        existingMarkdown,
        style,
        kind
      );
      emit({ step: "refine", status: "done" });
      emit({
        step: "complete",
        status: "done",
        markdown,
        message:
          kind === "blog"
            ? "Artículo blog refinado"
            : "Crónica refinada a partir del texto anterior",
      });
      return markdown;
    }

    emit({ step: "intro", status: "running", message: "Escribiendo introducción…" });
    const intro = await generateIntroduction(ai, model, ctx, style, kind);
    emit({ step: "intro", status: "done" });

    let daySummaries: DaySummaryRow[] = [];
    let blogSections: BlogSectionRow[] = [];

    if (kind === "blog") {
      emit({
        step: "days",
        status: "running",
        message: "Organizando secciones temáticas del artículo…",
      });
      blogSections = await generateBlogSections(ai, model, ctx, style);
      emit({ step: "days", status: "done" });
    } else {
      emit({ step: "days", status: "running", message: "Resumiendo cada día…" });
      daySummaries = await generateDaySummaries(ai, model, ctx, style, kind);
      emit({ step: "days", status: "done" });
    }

    emit({ step: "captions", status: "running", message: "Mejorando leyendas de fotos…" });
    const captions = await generatePhotoCaptions(ai, model, ctx, style, kind);
    emit({ step: "captions", status: "done" });

    emit({
      step: "conclusion",
      status: "running",
      message: kind === "blog" ? "Escribiendo el cierre «Si vas»…" : "Cerrando el relato…",
    });
    const conclusion = await generateConclusion(
      ai,
      model,
      ctx,
      intro,
      daySummaries,
      style,
      kind,
      blogSections
    );
    emit({ step: "conclusion", status: "done" });

    emit({ step: "assemble", status: "running", message: "Ensamblando artículo…" });
    const markdown = assembleJournalByKind(
      kind,
      ctx,
      intro,
      daySummaries,
      captions,
      conclusion,
      blogSections
    );
    emit({ step: "assemble", status: "done" });

    emit({ step: "complete", status: "done", markdown });
    return markdown;
  } catch (error) {
    if (!isAiUnreachableError(error)) throw error;

    // Refining without AI must not wipe the user's chronicle with a local template.
    if (existingMarkdown) {
      throw new Error(
        "Sin conexión a la IA; se mantiene tu crónica actual. Reintenta cuando haya red."
      );
    }

    console.warn("IA no disponible, usando crónica local:", error);
    emit({
      step: "intro",
      status: "running",
      message: "IA no disponible — generando crónica local…",
    });
    emit({ step: "intro", status: "done" });
    emit({ step: "days", status: "done" });
    emit({ step: "captions", status: "done" });
    emit({ step: "conclusion", status: "done" });
    emit({ step: "assemble", status: "running", message: "Ensamblando artículo…" });

    const markdown = buildLocalJournalMarkdown(ctx, kind);
    emit({ step: "assemble", status: "done" });
    emit({
      step: "complete",
      status: "done",
      markdown,
      message: "Crónica local generada (sin IA — sin conexión a DeepSeek)",
    });
    return markdown;
  }
}

async function runSingleDayJournalPipeline(
  ctx: EnhancedJournalContext,
  dayKey: string,
  emit: (event: JournalPipelineEvent) => void,
  style: JournalStyle,
  options: JournalPipelineOptions
): Promise<string> {
  const mergeInto = options.mergeIntoMarkdown?.trim() || null;
  const dayCtx = filterJournalContextToDay(ctx, dayKey);
  const chapterFromDoc = extractDayChapterMarkdown(mergeInto, dayKey);
  const wantRefine = options.mode === "refine";
  const existingChapter =
    chapterFromDoc ||
    (options.existingMarkdown?.trim().startsWith("###")
      ? options.existingMarkdown.trim()
      : null);
  const refineChapter = wantRefine && Boolean(existingChapter);

  try {
    const ai = createAiClient();
    const { model } = getAiConfig();
    emit({
      step: "context",
      status: "done",
      message: `Datos del día ${formatDateKey(dayKey, "short")} preparados`,
    });

    let chapterMarkdown: string;

    if (refineChapter && existingChapter) {
      emit({
        step: "refine",
        status: "running",
        message: `Refinando el capítulo del ${formatDateKey(dayKey, "short")}…`,
      });
      const refined = await refineJournalMarkdown(
        ai,
        model,
        dayCtx,
        existingChapter,
        style,
        "day"
      );
      chapterMarkdown =
        extractDayChapterMarkdown(refined, dayKey) ??
        (refined.trim().startsWith("###")
          ? refined.trim()
          : `### ${formatDateKey(dayKey)}\n\n${sanitizeDaySummaryProse(refined)}`);
      emit({ step: "refine", status: "done" });
    } else {
      emit({
        step: "days",
        status: "running",
        message: `Escribiendo el ${formatDateKey(dayKey, "short")}…`,
      });
      const daySummaries = await generateDaySummaries(ai, model, dayCtx, style, "day");
      emit({ step: "days", status: "done" });

      emit({
        step: "captions",
        status: "running",
        message: "Mejorando leyendas de fotos del día…",
      });
      const captions = await generatePhotoCaptions(ai, model, dayCtx, style, "day");
      emit({ step: "captions", status: "done" });

      emit({ step: "assemble", status: "running", message: "Ensamblando el día…" });
      const assembled = assembleJournalMarkdown(
        dayCtx,
        "",
        daySummaries,
        captions,
        ""
      );
      chapterMarkdown =
        extractDayChapterMarkdown(assembled, dayKey) ??
        `### ${formatDateKey(dayKey)}\n\n${
          daySummaries[0]?.summary ?? "_Sin notas para este día._"
        }`;
      emit({ step: "assemble", status: "done" });
    }

    const markdown = upsertDayChapterMarkdown(
      mergeInto,
      dayKey,
      chapterMarkdown,
      ctx.title
    );
    emit({
      step: "complete",
      status: "done",
      markdown,
      message: refineChapter
        ? `Día ${formatDateKey(dayKey, "short")} refinado`
        : `Día ${formatDateKey(dayKey, "short")} generado`,
    });
    return markdown;
  } catch (error) {
    if (!isAiUnreachableError(error)) throw error;
    if (mergeInto) {
      throw new Error(
        "Sin conexión a la IA; se mantiene tu crónica actual. Reintenta cuando haya red."
      );
    }
    const local = buildLocalJournalMarkdown(dayCtx, "day");
    const chapter =
      extractDayChapterMarkdown(local, dayKey) ??
      `### ${formatDateKey(dayKey)}\n\n_Crónica local sin IA._`;
    const markdown = upsertDayChapterMarkdown(null, dayKey, chapter, ctx.title);
    emit({
      step: "complete",
      status: "done",
      markdown,
      message: "Día generado en local (sin IA)",
    });
    return markdown;
  }
}
