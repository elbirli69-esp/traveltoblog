import type OpenAI from "openai";
import type { Note, Photo, Place, Travel, User } from "@prisma/client";
import { createAiClient, getAiConfig } from "@/lib/ai";
import { resolveFlightLegs } from "@/lib/flights";
import { placeEmoji, placeLabel } from "@/lib/places";
import { formatDateKey, isoToDateKey, resolveTravelDayRange } from "@/lib/travel-dates";

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
- Escribe como un amigo que cuenta el viaje en voz alta: natural, claro, humano.
- Preferir concreto a abstracto (qué pasó, quién lo dijo, dónde).
- Conserva el humor y los giros de las notas; cuando cites, usa el alias y, si encaja, comillas con la frase casi literal.
- PROHIBIDO (y variantes): inolvidable, mágico/a, experiencia única, tejido de recuerdos, odisea, sinfonía de sensaciones, "cada rincón", "momentos que quedarán grabados".
- Evita párrafos que solo ambientan sin aportar un hecho o una cita de los viajeros.
- Español peninsular natural; no suenes a folleto turístico ni a IA.`;

interface JournalPromptConfig {
  intro: { system: string; temperature: number };
  days: { system: string; temperature: number };
  captions: { system: string; temperature: number };
  conclusion: { system: string; temperature: number };
}

function briefBlock(brief: string | null | undefined): string {
  const text = brief?.trim();
  if (!text) return "";
  return `

INDICACIONES DEL USUARIO (prioridad alta):
${text}
Incorpóralas con naturalidad. No inventes nada fuera de estas indicaciones y de los datos del viaje.`;
}

function getJournalPromptConfig(style: JournalStyle): JournalPromptConfig {
  if (style === "factual") {
    return {
      intro: {
        system: `Eres un editor de diarios de viaje. Escribe SOLO la introducción (1-3 párrafos en Markdown).
${VOICE_RULES}
REGLAS ESTRICTAS:
- Usa ÚNICAMENTE notas_viaje, participantes, fechas, vuelos e indicaciones_usuario.
- Puedes mejorar redacción y claridad; NO inventes lugares, anécdotas ni emociones no dichas.
- Si hay poca información, intro breve y sobria.
- No uses encabezados (#).`,
        temperature: 0.35,
      },
      days: {
        system: `Eres un editor de diarios de viaje. Recibirás días con notas, lugares y comentarios de fotos.
Responde SOLO un JSON array: [{"date":"YYYY-MM-DD","summary":"texto markdown"}].
${VOICE_RULES}
REGLAS ESTRICTAS:
- Un elemento por cada día del input.
- Basa cada párrafo SOLO en notas_dia, lugares_del_dia, comentarios de fotos e indicaciones_usuario.
- Cita autores cuando corresponda. No añadas clima, reflexiones ni eventos no documentados.
- Integra los lugares del día en la narración (no como lista suelta) si aparecen en los datos.
- Si un día tiene poca información, 1-2 frases sin rellenar.
- No incluyas imágenes ni URLs.`,
        temperature: 0.3,
      },
      captions: {
        system: `Reescribe leyendas de fotos para un diario de viaje.
Responde SOLO JSON: [{"url":"...","caption":"leyenda max 120 chars"}].
${VOICE_RULES}
REGLAS ESTRICTAS:
- Basa cada caption en comentarios del usuario; reescribe sin cambiar el significado.
- Si no hay comentarios, leyenda neutra breve ("Foto de {autor}" o el nombre del lugar si viene en los datos) sin inventar la escena.`,
        temperature: 0.25,
      },
      conclusion: {
        system: `Eres un editor de diarios de viaje. Escribe SOLO la conclusión (1-2 párrafos Markdown).
${VOICE_RULES}
REGLAS ESTRICTAS:
- Cierra usando SOLO intro_resumen, dias_resumen e indicaciones_usuario.
- No inventes moralejas ni experiencias no mencionadas. Sin encabezados.`,
        temperature: 0.35,
      },
    };
  }

  return {
    intro: {
      system: `Eres un cronista de blogs de viaje. Escribe SOLO la introducción (2-4 párrafos en Markdown) de un artículo colaborativo.
${VOICE_RULES}
Puedes dar ritmo y calidez, pero solo con hechos de los datos e indicaciones_usuario.
Empieza cerca de algo concreto (un detalle, una cita, el motivo del viaje), no con una tesis grandilocuente.
No uses encabezados (#).`,
      temperature: 0.65,
    },
    days: {
      system: `Eres un cronista de blogs de viaje. Recibirás días con notas, lugares visitados y fotos.
Responde SOLO un JSON array: [{"date":"YYYY-MM-DD","summary":"texto markdown 1-3 párrafos"}].
${VOICE_RULES}
Un elemento por cada día. Integra anécdotas citando aliases; conecta momentos con transiciones naturales (no "Ese día… Ese día…").
Menciona lugares del día dentro de la escena cuando existan en los datos.
Puedes ambientar con lo implícito mínimo (mañana/tarde por el orden de fotos), pero no contradigas las notas ni inventes tormentas, discusiones o descubrimientos no escritos.
Respeta indicaciones_usuario. No incluyas imágenes ni URLs.`,
      temperature: 0.6,
    },
    captions: {
      system: `Escribes pies de foto para un blog de viaje, tono cercano.
Responde SOLO JSON: [{"url":"...","caption":"leyenda max 120 chars"}].
${VOICE_RULES}
Basa cada caption en comentarios; si no hay, una línea sobria con autor o lugar conocido, sin inventar la escena.`,
      temperature: 0.55,
    },
    conclusion: {
      system: `Eres un cronista de blogs de viaje. Escribe SOLO la conclusión (1-3 párrafos Markdown).
${VOICE_RULES}
Cierra con eco de lo vivido (hechos o citas ya aparecidos), sin sermón ni resumen telegráfico de toda la intro.
Sin encabezados. Respeta indicaciones_usuario.`,
      temperature: 0.6,
    },
  };
}

interface DaySummaryRow {
  date: string;
  summary: string;
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
}

const MAX_EXISTING_MARKDOWN_CHARS = 60_000;

function getRefineSystemPrompt(style: JournalStyle): { system: string; temperature: number } {
  const base = `Eres un editor de crónicas de viaje colaborativas.
Te dan la crónica Markdown YA ESCRITA (puede incluir ediciones humanas) y el contexto actualizado del viaje (notas, fotos, lugares, vuelos) más indicaciones_usuario si existen.

Tu tarea: devolver UNA única crónica Markdown completa REFINADA.

${VOICE_RULES}

REGLAS DE REFINAMIENTO:
- Parte de la crónica existente: conserva el tono, la estructura y las formulaciones que ya funcionan.
- Incorpora notas, fotos o lugares NUEVOS que falten en el texto.
- Corrige solo lo contradictorio, vacío o claramente peor que el contexto nuevo.
- NO tires el texto para reescribirlo de cero si no hace falta.
- PRESERVA todas las imágenes Markdown existentes (![alt](url)) y sus URLs; puedes mejorar el alt/caption.
- Añade imágenes de fotos nuevas del contexto si aún no están en la crónica, con caption breve.
- Mantén el título (# …), secciones por día y conclusión.
- Respeta indicaciones_usuario con prioridad alta.
- Responde SOLO con el Markdown final, sin explicaciones ni fences \`\`\`.`;

  if (style === "factual") {
    return {
      system: `${base}
ESTILO FIEL A LAS NOTAS:
- No inventes hechos, emociones ni escenas no documentadas.
- Prefiere pulir y completar con material real del contexto.`,
      temperature: 0.35,
    };
  }

  return {
    system: `${base}
ESTILO VIVO:
- Puedes enriquecer atmósfera y ritmo, sin contradecir notas ni ediciones humanas claras.`,
    temperature: 0.65,
  };
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/i);
  return (fenced?.[1] ?? trimmed).trim();
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
  style: JournalStyle = "narrative"
): Promise<string> {
  const { system, temperature } = getRefineSystemPrompt(style);
  const raw = await callAi(
    ai,
    model,
    system + briefBlock(ctx.brief),
    buildRefineUserPayload(ctx, existingMarkdown),
    temperature
  );
  const refined = stripMarkdownFences(raw);
  if (!refined || refined.length < 40) {
    throw new Error("La IA devolvió una crónica vacía al refinar");
  }
  return refined;
}

export async function generateIntroduction(
  ai: OpenAI,
  model: string,
  ctx: EnhancedJournalContext,
  style: JournalStyle = "narrative"
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
    prompts.intro.system + briefBlock(ctx.brief),
    user,
    prompts.intro.temperature
  );
}

export async function generateDaySummaries(
  ai: OpenAI,
  model: string,
  ctx: EnhancedJournalContext,
  style: JournalStyle = "narrative"
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
    prompts.days.system + briefBlock(ctx.brief),
    user,
    prompts.days.temperature
  );
  const parsed = extractJsonArray<DaySummaryRow>(raw);

  if (parsed.length > 0) return parsed;

  return ctx.days.map((d) => ({
    date: d.date,
    summary:
      d.dayNotes.map((n) => `${n.author}: ${n.text}`).join("\n\n") ||
      "Día de exploración y momentos compartidos.",
  }));
}

export async function generatePhotoCaptions(
  ai: OpenAI,
  model: string,
  ctx: EnhancedJournalContext,
  style: JournalStyle = "narrative"
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
    prompts.captions.system + briefBlock(ctx.brief),
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
  style: JournalStyle = "narrative"
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
      lugares: ctx.places.length,
      indicaciones_usuario: ctx.brief,
    },
    null,
    2
  );
  return callAi(
    ai,
    model,
    prompts.conclusion.system + briefBlock(ctx.brief),
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
      (day.dayNotes.map((n) => `${n.author}: ${n.text}`).join("\n\n") ||
        "_Sin notas para este día._");
    lines.push(summary.trim(), "");

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
      lines.push(`> **${note.author}:** ${note.text}`, "");
    }
  }

  lines.push("---", "", conclusion.trim());
  return lines.join("\n");
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
export function buildLocalJournalMarkdown(ctx: EnhancedJournalContext): string {
  const intro = `Diario colaborativo del viaje **${ctx.title}**, con la participación de ${ctx.participants.join(", ")}.`;

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

  const conclusion = `Fin del relato de **${ctx.title}**. Gracias a todos los participantes por compartir este viaje.`;

  const body = assembleJournalMarkdown(ctx, intro, daySummaries, captions, conclusion);
  return `> ⚠️ *Crónica generada sin IA: el servidor no pudo contactar el servicio de IA (revisa DNS/red del NAS). Puedes volver a generar cuando haya conexión.*\n\n${body}`;
}

export async function runJournalPipeline(
  ctx: EnhancedJournalContext,
  onProgress?: PipelineProgressCallback,
  style: JournalStyle = "narrative",
  options: JournalPipelineOptions = {}
): Promise<string> {
  const emit = (event: JournalPipelineEvent) => onProgress?.(event);
  const existingMarkdown = options.existingMarkdown?.trim() || null;

  try {
    const ai = createAiClient();
    const { model } = getAiConfig();

    emit({ step: "context", status: "done", message: "Datos del viaje preparados" });

    if (existingMarkdown) {
      emit({
        step: "refine",
        status: "running",
        message: "Refinando la crónica existente…",
      });
      const markdown = await refineJournalMarkdown(
        ai,
        model,
        ctx,
        existingMarkdown,
        style
      );
      emit({ step: "refine", status: "done" });
      emit({
        step: "complete",
        status: "done",
        markdown,
        message: "Crónica refinada a partir del texto anterior",
      });
      return markdown;
    }

    emit({ step: "intro", status: "running", message: "Escribiendo introducción…" });
    const intro = await generateIntroduction(ai, model, ctx, style);
    emit({ step: "intro", status: "done" });

    emit({ step: "days", status: "running", message: "Resumiendo cada día…" });
    const daySummaries = await generateDaySummaries(ai, model, ctx, style);
    emit({ step: "days", status: "done" });

    emit({ step: "captions", status: "running", message: "Mejorando leyendas de fotos…" });
    const captions = await generatePhotoCaptions(ai, model, ctx, style);
    emit({ step: "captions", status: "done" });

    emit({ step: "conclusion", status: "running", message: "Cerrando el relato…" });
    const conclusion = await generateConclusion(ai, model, ctx, intro, daySummaries, style);
    emit({ step: "conclusion", status: "done" });

    emit({ step: "assemble", status: "running", message: "Ensamblando artículo…" });
    const markdown = assembleJournalMarkdown(ctx, intro, daySummaries, captions, conclusion);
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

    const markdown = buildLocalJournalMarkdown(ctx);
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
