import type OpenAI from "openai";
import type { Note, Photo, Place, Travel, User } from "@prisma/client";
import { createAiClient, getAiConfig } from "@/lib/ai";
import { resolveFlightLegs } from "@/lib/flights";
import { placeEmoji, placeLabel } from "@/lib/places";
import { formatDateKey, isoToDateKey, resolveTravelDayRange } from "@/lib/travel-dates";

type PhotoWithUser = Photo & { user: User };
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
}

export interface EnhancedDayBlock {
  date: string;
  dayNotes: { text: string; author: string }[];
  photos: EnhancedDayPhoto[];
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
}

export type JournalStyle = "narrative" | "factual";

export const JOURNAL_STYLE_LABELS: Record<
  JournalStyle,
  { title: string; description: string }
> = {
  narrative: {
    title: "Narrativo",
    description:
      "Relato más épico y literario. Puede ampliar el ambiente y el tono, inspirándose en las notas.",
  },
  factual: {
    title: "Fiel a las notas",
    description:
      "Se ciñe a lo que escribisteis. Solo reescribe mejor, sin inventar hechos ni añadir escenas.",
  },
};

interface JournalPromptConfig {
  intro: { system: string; temperature: number };
  days: { system: string; temperature: number };
  captions: { system: string; temperature: number };
  conclusion: { system: string; temperature: number };
}

function getJournalPromptConfig(style: JournalStyle): JournalPromptConfig {
  if (style === "factual") {
    return {
      intro: {
        system: `Eres un editor de diarios de viaje. Escribe SOLO la introducción (1-3 párrafos en Markdown).
REGLAS ESTRICTAS:
- Usa ÚNICAMENTE la información explícita en notas_viaje, participantes, fechas y vuelos.
- Puedes mejorar redacción, orden y claridad, pero NO inventes lugares, anécdotas, emociones ni detalles no mencionados.
- Si hay poca información, escribe una intro breve y sobria.
- No uses encabezados (#).`,
        temperature: 0.35,
      },
      days: {
        system: `Eres un editor de diarios de viaje. Recibirás días con notas y comentarios de fotos.
Responde SOLO un JSON array: [{"date":"YYYY-MM-DD","summary":"texto markdown"}].
REGLAS ESTRICTAS:
- Un elemento por cada día del input.
- Cada párrafo debe basarse SOLO en notas_dia y comentarios de fotos de ese día.
- Cita autores cuando corresponda. No añadas clima, reflexiones ni eventos no documentados.
- Si un día tiene poca información, resume en 1-2 frases sin rellenar.
- No incluyas imágenes.`,
        temperature: 0.3,
      },
      captions: {
        system: `Reescribe leyendas de fotos para un diario de viaje.
Responde SOLO JSON: [{"url":"...","caption":"leyenda max 120 chars"}].
REGLAS ESTRICTAS:
- Basa cada caption en comentarios del usuario. Si hay comentarios, reescríbelos con mejor estilo sin cambiar el significado.
- Si no hay comentarios, usa una leyenda neutra y breve ("Foto de {autor}") sin inventar el lugar o la escena.`,
        temperature: 0.25,
      },
      conclusion: {
        system: `Eres un editor de diarios de viaje. Escribe SOLO la conclusión (1-2 párrafos Markdown).
REGLAS ESTRICTAS:
- Cierra el relato usando SOLO lo documentado en intro_resumen y dias_resumen.
- No inventes moralejas ni experiencias no mencionadas. Sin encabezados.`,
        temperature: 0.35,
      },
    };
  }

  return {
    intro: {
      system: `Eres un cronista de viajes con estilo literario. Escribe SOLO la introducción (2-4 párrafos en Markdown) de un artículo de blog colaborativo.
Puedes dar épica, atmósfera y ritmo narrativo, pero respeta los hechos de las notas y participantes.
No uses encabezados (#).`,
      temperature: 0.8,
    },
    days: {
      system: `Eres un cronista de viajes. Recibirás días del viaje con notas y fotos.
Responde SOLO un JSON array: [{"date":"YYYY-MM-DD","summary":"texto markdown 1-3 párrafos"}].
Un elemento por cada día del input. Integra anécdotas citando autores con tono evocador.
Puedes ambientar y conectar momentos, pero no contradigas las notas. No incluyas imágenes.`,
      temperature: 0.75,
    },
    captions: {
      system: `Mejora leyendas de fotos de viaje para un blog con tono evocador.
Responde SOLO JSON: [{"url":"...","caption":"leyenda max 120 chars"}].
Basa cada caption en comentarios del usuario; si no hay, describe el momento con sensibilidad sin inventar lugares específicos.`,
      temperature: 0.8,
    },
    conclusion: {
      system: `Eres un cronista de viajes. Escribe SOLO la conclusión (1-3 párrafos Markdown) cerrando el relato con tono reflexivo.
No repitas la intro literalmente. Sin encabezados.`,
      temperature: 0.75,
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
  places: PlaceWithUser[]
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

  const daysMap = new Map<string, EnhancedDayBlock>();
  for (const key of range.dayKeys) {
    daysMap.set(key, { date: key, dayNotes: [], photos: [] });
  }

  for (const note of notes) {
    if (note.type !== "DAY" || !note.dayDate) continue;
    const key = isoToDateKey(note.dayDate.toISOString());
    const block = daysMap.get(key) ?? { date: key, dayNotes: [], photos: [] };
    block.dayNotes.push({ text: note.text, author: note.user.alias });
    daysMap.set(key, block);
  }

  for (const photo of selectedPhotos) {
    const key = photo.exifDateTime
      ? isoToDateKey(photo.exifDateTime.toISOString())
      : range.startKey;
    const block = daysMap.get(key) ?? { date: key, dayNotes: [], photos: [] };
    block.photos.push({
      url: photo.url,
      author: photo.user.alias,
      comments: photoNotesByPhotoId.get(photo.id) ?? [],
      exifDateTime: photo.exifDateTime?.toISOString() ?? null,
      isTransportStart: photo.isTransportStart,
      isTransportEnd: photo.isTransportEnd,
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
    places: places.map((p) => {
      const fromNotes =
        p.notes
          ?.filter((n) => n.type === "PLACE")
          .map((n) => n.text)
          .filter(Boolean) ?? [];
      const comment =
        fromNotes.length > 0
          ? fromNotes.join(" · ")
          : p.comment?.trim() || null;
      return {
        name: p.name,
        type: p.type,
        comment,
        alias: p.user.alias,
      };
    }),
    days: [...daysMap.values()]
      .filter((d) => d.dayNotes.length > 0 || d.photos.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date)),
    tripNotes: notes
      .filter((n) => n.type === "TRIP")
      .map((n) => ({ text: n.text, author: n.user.alias })),
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
    },
    null,
    2
  );
  return callAi(ai, model, prompts.intro.system, user, prompts.intro.temperature);
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
    ctx.days.map((d) => ({
      date: d.date,
      notas_dia: d.dayNotes,
      fotos: d.photos.map((p) => ({
        autor: p.author,
        comentarios: p.comments,
        ida: p.isTransportStart,
        vuelta: p.isTransportEnd,
      })),
    })),
    null,
    2
  );

  const raw = await callAi(ai, model, prompts.days.system, user, prompts.days.temperature);
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
    }))
  );

  if (allPhotos.length === 0) return [];

  const prompts = getJournalPromptConfig(style);
  const user = JSON.stringify(allPhotos, null, 2);
  const raw = await callAi(ai, model, prompts.captions.system, user, prompts.captions.temperature);
  const parsed = extractJsonArray<PhotoCaptionRow>(raw);

  if (parsed.length > 0) return parsed;

  return allPhotos.map((p) => ({
    url: p.url,
    caption:
      p.comentarios.join(" · ") ||
      `Momento capturado por ${p.autor}`,
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
      dias_resumen: daySummaries.map((d) => ({ date: d.date, preview: d.summary.slice(0, 200) })),
      lugares: ctx.places.length,
    },
    null,
    2
  );
  return callAi(ai, model, prompts.conclusion.system, user, prompts.conclusion.temperature);
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

  const lines: string[] = [`# ${ctx.title}`, "", intro.trim(), "", "---", "", "## Calendario del viaje", ""];

  const daysToRender =
    ctx.days.length > 0
      ? ctx.days
      : daySummaries.map((d) => ({
          date: d.date,
          dayNotes: [],
          photos: [] as EnhancedDayPhoto[],
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
  style: JournalStyle = "narrative"
): Promise<string> {
  const emit = (event: JournalPipelineEvent) => onProgress?.(event);

  try {
    const ai = createAiClient();
    const { model } = getAiConfig();

    emit({ step: "context", status: "done", message: "Datos del viaje preparados" });

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
