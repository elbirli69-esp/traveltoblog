# Plan: unificar la captura de contenido del viaje

Plan de implementación derivado de la auditoría de flujos **Foto / Lugar / Trayecto / Día**. Objetivo: reducir fricción y silos sin reescribir el modelo de datos de golpe.

> **Estrategia posterior:** escala a público general, freemium y tipologías más allá del viaje → [`plan-producto-escala.md`](./plan-producto-escala.md).

## Estado del plan

**Completado** — mergeado en `main` el 2026-08-31 (PRs #26–#32).

| Fase | Estado | PR |
|------|--------|-----|
| 0 — Alineación | ✅ Completada | #26, #27–#29 (README) |
| 1 — Tab Viaje + rename | ✅ Completada | #27, #29 |
| 2a — UI notas de lugar | ✅ Completada | #28, #29 |
| 2b — `NoteType.PLACE` | ✅ Completada | #30 |
| 3 — CTA «+ Añadir recuerdo» | ✅ Completada | #29 |
| 4 — Sinergias foto↔lugar↔día | ✅ Completada* | #31 |
| 5 — Empty states + checklist | ✅ Completada* | #32 |

\* Fase 4: implementado el núcleo (4a–4d). Opcionales no hechos: chip «también en nota del día» (4a), banners activos de asociación foto↔lugar (4c).  
\* Fase 5: opcional de revisar duplicación `POST /api/photos` vs `/api/sync` pendiente (deuda técnica, no UX).

**Post-merge en entornos con datos viejos:** `npm run db:migrate-place-notes`

## Objetivo de producto

El usuario **añade un recuerdo** (foto, sitio, texto del día o del viaje). No elige un “tipo de entidad” técnica.

La crónica IA y el export siguen consumiendo los mismos datos; cambia la UX de captura y, en fases posteriores, los vínculos entre entidades.

## Estado actual (baseline histórico)

> Documento de referencia de la auditoría inicial. El producto actual ya refleja las fases 0–5.

| Superficie UI | Entidad | Problema (resuelto) |
|---|---|---|
| Tab Fotos | `Photo` + `Note(PHOTO)` | ~~Ida/Vuelta solo pre-upload; poco enlace con lugares/días~~ → galería editable + proximidad GPS |
| Tab Lugares | `Place` + `comment` | ~~Comentario paralelo a `Note`~~ → `Note(PLACE)`; vuelos derivados con copy explícito |
| Bloque fuera de tabs | `Note(TRIP)` | ~~Nombre “trayecto” confunde~~ → pestaña **Viaje** |
| Tab Días | `Note(DAY)` | ~~No enlaza fotos sin cambiar de tab~~ → notas de foto in-situ |
| Mapa | Ruta GPS / trayecto aéreo derivados | Hub de lectura con fotos GPS clicables |

No crear modelo `Route`/`Trayecto` editable en este plan. La geometría sigue siendo derivada.

---

## Principios de diseño

1. **Un entry point, varias vistas.** CTA `+ Añadir recuerdo`; tabs Fotos / Mapa / Cronología como lectura y edición contextual.
2. **Una sola forma de escribir texto.** Misma UI de notas para foto, día, viaje y lugar.
3. **Sinergias por contexto** (EXIF fecha, GPS cerca de un pin), no formularios extras.
4. **Cambios incrementales.** Cada fase es mergeable y usable sola.
5. **Compatibilidad.** Viajes existentes siguen funcionando; migraciones son aditivas.

---

## Fase 0 — Alineación y deuda menor (prerequisito) ✅

**Estado:** Completada (2026-08-31).

**Alcance**

- Actualizar README: documentar `Place`, las 4 vías de contenido y que “ruta/trayecto aéreo” es derivado.
- Eliminar o dejar de exponer el fallback “Próximamente” de tabs si ya no se usa en producción.
- Inventario de strings “trayecto” en UI vs mapa vs IA (`notas_trayecto`) para el rename de Fase 1.

**Criterio de hecho**

- README refleja el producto real.
- Lista acordada de renombres ES (UI) sin romper prompts internos todavía.

**Riesgo:** bajo.

---

## Fase 1 — Clarificar “trayecto” y meterlo en el workspace ✅

**Estado:** Completada (2026-08-31). Opción A (pestaña **Viaje**) implementada.

**Objetivo UX:** dejar de llamar “trayecto” a una nota global; hacerla visible junto al resto del workspace.

**Cambios**

1. Renombrar en UI (y `NoteForm` label):
   - “Nota del trayecto” → **“Nota del viaje”** (o “Resumen del viaje”).
   - En mapa, mantener “Trayecto aéreo” / “Ruta” solo para geometría derivada.
2. Mover el bloque de notas `TRIP` **dentro** de `TravelWorkspaceTabs`:
   - Opción A (recomendada): cuarta pestaña **Viaje** (notas globales + acceso rápido a crónica).
   - Opción B: sección fija al final del tab **Días** (“Sobre el viaje completo”).
3. Actualizar copy de crónica/export solo donde el usuario vea “trayecto” con sentido de nota.
4. Prompts IA: se puede seguir usando clave interna `notas_trayecto` o renombrar a `notas_viaje` en el mismo PR (cosmético para el modelo).

**Archivos previstos**

- `src/app/travel/[id]/page.tsx`
- `src/components/TravelWorkspaceTabs.tsx`
- `src/components/NoteForm.tsx`
- `src/lib/journal-pipeline.ts` (labels/copy si aplica)
- `README.md`

**Criterio de hecho**

- No queda “Nota del trayecto” en UI de captura.
- Las notas `TRIP` se crean/editan/eliminan igual (offline incluido).
- Generar crónica sigue incluyendo esas notas en intro/conclusión.

**Tests**

- Manual: crear nota del viaje, regenerar crónica, comprobar que aparece.
- Si hay tests de API notes: cubrir `type=TRIP` sin regresión.

**Riesgo:** bajo. Solo UI/navegación.

---

## Fase 2 — Unificar la escritura de texto ✅

**Estado:** Completada (2026-08-31).

**Objetivo UX:** una sola experiencia “escribir / editar / borrar nota”, también en lugares.

### 2a — UI compartida (sin migración de BD) ✅

- Extender `NoteForm` / `EditableNote` (o wrapper) para comentarios de lugar.
- En `TravelPlacesPanel`, sustituir el textarea ad-hoc de `comment` por la misma UX de notas (aunque siga persistiendo en `Place.comment`).

**Criterio de hecho:** crear/editar comentario de lugar se siente igual que una nota de foto/día.

### 2b — Modelo unificado (migración) ✅

**Propuesta de esquema (aditiva):**

```prisma
enum NoteType {
  PHOTO
  DAY
  TRIP
  PLACE   // nuevo
}

model Note {
  // ...
  placeId String?
  place   Place?  @relation(...)
}

model Place {
  // comment queda deprecated; migración one-shot a Note(PLACE)
  notes Note[]
}
```

**Pasos**

1. Añadir `PLACE` + `placeId` nullable.
2. Script/migración: por cada `Place.comment` no vacío → `Note(type=PLACE, placeId, text, userId, travelId)`.
3. APIs notes: aceptar `placeId` cuando `type=PLACE`.
4. Journal pipeline / export: leer notas de lugar en lugar de (o además de) `comment`.
5. Dejar de escribir `Place.comment` en UI; campo nullable hasta limpieza posterior.
6. Offline: `PendingNote` con `placeLocalId` análogo a `photoLocalId`.

**Criterio de hecho**

- Viajes viejos con comentarios de lugar aparecen como notas tras migrar.
- Crónica y export HTML/PDF incluyen esas notas.
- Offline: nota de lugar encola y sincroniza.

**Tests**

- Migración sobre fixture con places con/sin comment.
- `POST /api/notes` con `PLACE` + `placeId`.
- Pipeline journal: lugar con nota entra en contexto.

**Riesgo:** medio (migración + offline + consumers). Hacer 2a mergeable antes que 2b si se quiere reducir el PR.

---

## Fase 3 — CTA único “+ Añadir recuerdo” ✅

**Estado:** Completada (2026-08-31). Deep-link `?add=photo|place|day|trip` implementado. Opcional `ShareReceivePage` → `?add=photo&shared=` no implementado.

**Objetivo UX:** un gesto principal; los tabs pasan a ser contexto, no la única puerta de entrada.

**UI**

1. Botón flotante o destacado en `/travel/[id]`: **+ Añadir recuerdo**.
2. Sheet/modal con 4 atajos:
   - **Foto** → abre flujo actual de selección/cámara/share prep.
   - **Estoy aquí** → modo marcar lugar (GPS o mapa).
   - **Cómo fue el día** → salta a fecha (hoy o última con fotos) + foco en `NoteForm` DAY.
   - **Sobre el viaje** → salta a notas del viaje (`TRIP`).
3. Deep-link por query (`?add=photo|place|day|trip&date=YYYY-MM-DD`) para que tabs/share puedan reutilizar el mismo entry.

**Archivos previstos**

- Nuevo: `AddMemorySheet.tsx` (o similar)
- `TravelWorkspaceTabs.tsx` / `page.tsx` (estado de tab + intent)
- Opcional: `ShareReceivePage` → `?add=photo&shared=`

**Criterio de hecho**

- Desde el CTA se llega a los 4 flujos sin buscar bloques sueltos.
- Los flujos existentes siguen accesibles desde sus tabs (no romper hábitos).

**Tests**

- Manual E2E de los 4 atajos (online).
- Offline: foto y nota desde el sheet encolan igual.

**Riesgo:** bajo–medio (estado de navegación entre tabs).

---

## Fase 4 — Sinergias Foto ↔ Lugar ↔ Día ✅

**Estado:** Completada (2026-08-31). Núcleo 4a–4d implementado; opcionales 4a (chip día) y 4c (banners de asociación) pendientes.

**Objetivo UX:** el contexto rellena el vínculo; el usuario confirma, no rellena formularios cruzados.

### 4a — Foto → Día (quick win)

- En tab Días, bajo cada miniatura: “Añadir nota” que abre `NoteForm` `PHOTO` (sin ir a Fotos).
- Opcional: al crear nota de foto, chip “también en nota del día” (crear `DAY` con mismo texto o enlace visual).

### 4b — Ida/Vuelta post-upload

- En `PhotoGallery`: toggles Ida/Vuelta (y desmarcar).
- API: `PATCH` foto o reutilizar `/api/travels/[id]/boundaries` con `photoId` ya persistido.
- Quitar/evitar el PATCH prematuro pre-confirmación (o dejarlo solo como intent local hasta `POST /api/photos`).
- En Lugares: copy explícito “Derivado de fotos marcadas como Ida/Vuelta” + link al tab Fotos.

### 4c — Foto ↔ Lugar por proximidad

- Util: distancia haversine; umbral configurable (p. ej. 80–150 m).
- Tras confirmar fotos con GPS: banner “N fotos cerca de *Hotel X* — ¿asociar?”.
- Al guardar lugar: “¿Adjuntar foto de la galería cercana?”.
- Persistencia mínima: `Note(PLACE)` mencionando foto, **o** (mejor si se acepta más modelo) `photoId` opcional en `Place` / tabla `PlacePhoto`. Preferir al inicio **sugerencia UX + nota**, y solo después FK formal si hace falta en mapa/export.

### 4d — Mapa como hub de lectura

- Mapa muestra: pins de lugares + puntos de fotos con GPS + línea de ruta.
- Tap foto → preview + añadir nota.
- Tap lugar → notas del lugar.
- No es editor de ruta.

**Criterio de hecho**

- Se puede anotar una foto desde Días.
- Ida/Vuelta se cambia después de subir; fronteras del viaje se actualizan.
- Al menos una sugerencia foto↔lugar funciona en happy path con GPS.

**Tests**

- Unit: haversine / matching.
- API boundaries con foto ya guardada.
- Manual: mapa con fotos+lugares; asociar; regenerar crónica.

**Riesgo:** medio (mapa + matching + boundaries).

---

## Fase 5 — Pulido de información y vacíos ✅

**Estado:** Completada (2026-08-31). Empty states, contadores en tabs y checklist pre-crónica implementados. Revisión `POST /api/photos` vs `/api/sync` pendiente (opcional).

- Empty states por tab que empujen al CTA (“Aún no hay lugares — Márcalo desde + Añadir”).
- Contador simple en tabs: `Fotos (12) · Lugares (3) · Días · Viaje (1)`.
- Checklist pre-crónica: “Faltan notas del viaje / no hay Ida / 4 días sin texto” (no bloqueante).
- Revisar duplicación `POST /api/photos` vs `/api/sync` solo si duele mantenimiento (no bloquea UX).

**Riesgo:** bajo.

---

## Fuera de alcance (explícito)

- Editor de trayecto/ruta por etapas o GPX.
- Modelo `Post`/`Entrada` separado de `Travel.journalMarkdown`.
- Auth completa (sigue alias + share code).
- Rediseño visual total de la PWA.
- Unificar export HTML/PDF en un solo pipeline (salvo roturas por notas de lugar).

---

## Orden de entrega recomendado

```
Fase 0 ──► Fase 1 ──► Fase 2a ──► Fase 3 ──► Fase 2b ──► Fase 4 ──► Fase 5
              │                      │
              └─ valor UX inmediato ─┘
```

- **1 + 2a + 3** = paquete “más user friendly” sin migración dura.
- **2b + 4** = sinergias reales entre entidades.
- **5** = conversión a crónica más guiada.

Cada fase = 1 PR (o 2 si 2b/4 se parten). No mezclar migración Prisma con el sheet del CTA en el mismo PR.

---

## Desglose técnico por área

| Área | Fases | Notas |
|---|---|---|
| `TravelWorkspaceTabs` / `page.tsx` | 1, 3, 5 | Tabs + intent `?add=` |
| `NoteForm` / `EditableNote` | 1, 2 | Contrato único de texto |
| `Place` schema + APIs | 2b, 4c | `NoteType.PLACE` / vínculos |
| `PhotoGallery` + boundaries | 4b | Transporte editable |
| `TravelDayCalendar` | 4a | Notas de foto in-situ |
| `TravelPlacesMap` | 4d | Hub de lectura |
| `journal-pipeline` / export | 2b, 4 | Consumers de notas de lugar |
| Offline (`offline-db`, sync) | 2b, 3, 4 | Paridad online/offline |
| README / copy | 0, 1, 5 | Producto = código |

---

## Métricas de éxito (cualitativas)

- Un usuario nuevo encuentra **dónde escribir** sin preguntar “¿foto, día o trayecto?”.
- “Trayecto” en UI solo significa recorrido en mapa (si aparece).
- Comentarios de lugar y notas comparten el mismo gesto de edición.
- Al menos un cruce foto↔lugar o foto↔día se usa en el flujo feliz antes de generar la crónica.

## Validación por fase

| Fase | Cómo validar | Estado |
|---|---|---|
| 0–1 | Smoke UI + generar crónica con nota del viaje | ✅ |
| 2a | Editar comentario de lugar con misma UI | ✅ |
| 2b | Migrar DB de prueba; export + journal | ✅ |
| 3 | Los 4 atajos del sheet online/offline | ✅ |
| 4 | Boundaries post-upload; matching GPS; mapa | ✅ |
| 5 | Empty states + checklist pre-crónica | ✅ |

---

## Arranque (histórico)

> Plan ejecutado. El primer ticket (Fase 1) se completó con la pestaña **Viaje** (Opción A).

**Título original:** Fase 1 — Renombrar nota del trayecto y moverla al workspace

**Acceptance criteria** (cumplidos)

1. La UI dice “Nota del viaje” (no “trayecto”) en formularios de captura.
2. Las notas `TRIP` viven en una pestaña **Viaje**.
3. Crear / editar / borrar / offline sync siguen funcionando.
4. La crónica IA sigue usando esas notas.
5. README actualizado.
