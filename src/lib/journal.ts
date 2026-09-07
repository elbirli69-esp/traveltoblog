import type { JournalChronologyEntry, JournalInput } from "@/types";
import type { Note, Photo, Travel, User } from "@prisma/client";

type PhotoWithUser = Photo & { user: User };
type NoteWithUser = Note & { user: User; photo: Photo | null };

export function buildJournalInput(
  travel: Travel,
  users: User[],
  photos: PhotoWithUser[],
  notes: NoteWithUser[]
): JournalInput {
  const entries: JournalChronologyEntry[] = [];

  const photoNotesByPhotoId = new Map<string, NoteWithUser[]>();
  const nonPhotoNotes: NoteWithUser[] = [];

  for (const note of notes) {
    if (note.type === "PHOTO" && note.photoId) {
      const list = photoNotesByPhotoId.get(note.photoId) ?? [];
      list.push(note);
      photoNotesByPhotoId.set(note.photoId, list);
    } else {
      nonPhotoNotes.push(note);
    }
  }

  for (const photo of photos.filter((p) => p.selected)) {
    const linkedNotes = photoNotesByPhotoId.get(photo.id) ?? [];
    const defaultText = photo.isTransportStart
      ? "Foto de transporte de ida — inicio del viaje"
      : photo.isTransportEnd
        ? "Foto de transporte de vuelta — fin del viaje"
        : "Foto del viaje";

    if (linkedNotes.length === 0) {
      entries.push({
        fecha_hora: (photo.exifDateTime ?? photo.createdAt).toISOString(),
        autor: photo.user.alias,
        ubicacion_gps:
          photo.latitude != null && photo.longitude != null
            ? { lat: photo.latitude, lon: photo.longitude }
            : null,
        tipo_nota: "foto",
        texto_nota: defaultText,
        url_foto: photo.url,
      });
      continue;
    }

    for (const note of linkedNotes) {
      entries.push({
        fecha_hora: (photo.exifDateTime ?? note.createdAt).toISOString(),
        autor: note.user.alias,
        ubicacion_gps:
          photo.latitude != null && photo.longitude != null
            ? { lat: photo.latitude, lon: photo.longitude }
            : null,
        tipo_nota: "foto",
        texto_nota: note.text,
        url_foto: photo.url,
      });
    }
  }

  for (const note of nonPhotoNotes) {
    const tipoMap = {
      PHOTO: "foto",
      DAY: "dia",
      TRIP: "viaje",
      PLACE: "lugar",
    } as const;
    entries.push({
      fecha_hora: (note.dayDate ?? note.createdAt).toISOString(),
      autor: note.user.alias,
      ubicacion_gps:
        note.photo?.latitude != null && note.photo?.longitude != null
          ? { lat: note.photo.latitude, lon: note.photo.longitude! }
          : null,
      tipo_nota: tipoMap[note.type],
      texto_nota: note.text,
      url_foto: note.photo?.url,
    });
  }

  entries.sort(
    (a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime()
  );

  return {
    titulo_viaje: travel.title,
    participantes: users.map((u) => u.alias),
    cronologia: entries,
  };
}

export const SYSTEM_PROMPT = `Eres un cronista de blogs de viaje. Recibirás un JSON con la cronología de un viaje colaborativo (fotos, notas y lugares de varios participantes).

Tu tarea:
1. Redactar un artículo de blog narrativo, coherente y entretenido en Markdown, útil para otras personas que lean el viaje.
2. Integrar las anécdotas citando a cada participante por su alias cuando corresponda.
3. Mantener orden cronológico con transiciones naturales entre momentos.
4. Cuando el título o los lugares indiquen el destino (p. ej. Krakow), enriquecer con curiosidades breves: historia local, tradiciones, costumbres o por qué ese sitio interesa — ancladas a nombres presentes en los datos.
5. Insertar marcadores de imagen usando el formato exacto: ![Descripción evocadora](URL_FOTO) cuando haya url_foto en la cronología.
6. Usar encabezados (##, ###) para organizar por días o etapas del viaje.
7. Tono: cercano, vibrante, con humor ligero cuando encaje.
8. NO inventes hechos personales, visitas ni escenas de foto no presentes en los datos; sí puedes añadir color cultural/histórico sobrio del destino o lugares nombrados.
9. Responder SOLO con el Markdown del artículo, sin explicaciones adicionales.`;

export function buildUserPrompt(input: JournalInput): string {
  return JSON.stringify(input, null, 2);
}
