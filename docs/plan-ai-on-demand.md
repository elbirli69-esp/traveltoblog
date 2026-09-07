# Plan: IA bajo demanda (captions, día, storyboard Reel)

## Objetivo

Añadir tres ayudas de IA **solo cuando el usuario las pide**, en este orden:

1. **Sugerir nota/caption de una foto** (draft editable)
2. **Resumen de un día** (nota `DAY` borrador)
3. **Storyboard + captions del Reel** (elige fotos existentes + textos cortos)

Misma filosofía que crónica y brief de export: **el usuario dispara; la IA propone; nada se guarda sin confirmar**.

---

## Principios no negociables

| Principio | Cómo se aplica |
|-----------|----------------|
| Manual | Ningún job al subir foto, al abrir viaje, al exportar ni en cron |
| Confirmación | Botón «Usar / Insertar / Aplicar»; Cancelar descarta |
| Tokens bajos | Contexto mínimo tipado; **sin visión por defecto**; techos duros de prompt |
| Sin inventar media | Solo elige entre fotos/lugares/notas ya existentes |
| Offline-safe | Sin clave / sin red → mensaje claro; no romper flujos |
| Idempotente | Re-lanzar no duplica notas hasta que el usuario acepte |

```
Usuario pulsa «Sugerir…»
    → empaquetar contexto pequeño (JSON)
    → 1 llamada IA (o 0 si heurística basta)
    → draft en UI
    → Usuario acepta → persistir Note / prefs / selección
```

---

## Eficiencia de tokens (política compartida)

### Qué enviar al modelo

- **Texto estructurado**, no markdown de crónica completa ni HTML.
- Campos tipados: título viaje, día, alias, nombre de lugar, tipo lugar, hora EXIF, notas ya escritas (recortadas), `highlightScore`.
- **No** enviar base64 de imagen en P1–P2.
- **No** reenviar el diario entero salvo en fase 3 (y entonces solo extracto del día o bullets).

### Techos (defaults)

| Superficie | Max input aprox. | Max output | Modelo |
|------------|------------------|------------|--------|
| Caption foto | ~400–600 tokens ctx | ~80 tokens (1–2 frases) | chat barato (`deepseek-chat` / `OPENAI_MODEL`) |
| Resumen día | ~800–1200 tokens ctx | ~180 tokens | mismo |
| Storyboard Reel | ~1000–1500 tokens ctx | JSON ≤ ~400 tokens | mismo |

### Ahorros obligatorios

1. **Prefiltro determinista** antes de IA (GPS→lugar, highlightScore, diversidad) — igual que `export-photo-pick`.
2. **Cache por clave** en memoria/viaje: `hash(tipo + entidadId + inputs)` → si el usuario vuelve a pulsar sin cambios, devolver cache (opcional mostrar «última sugerencia»).
3. **Un solo completion** por acción (no pipelines multi-paso tipo crónica).
4. **Temperature baja** (0.3–0.5) y `max_tokens` estricto.
5. **Batch opcional** solo bajo botón explícito («Sugerir captions de las N seleccionadas», N≤10) con **una** llamada que devuelve array — nunca N llamadas en bucle silencioso.
6. Brief vacío / sin notas / sin GPS: **heurística local primero**; IA solo si el usuario insiste («Mejorar con IA»).

### Qué no hacer

- Vision/multimodal en cada foto (caro; valorar en P4 opcional «Describir esta foto» con resize ≤512px y consentimiento).
- Regenerar al cambiar de pestaña.
- Meter IA en sync offline / share-target.
- Sustituir `interpretExportBrief` ni el journal pipeline (siguen aparte).

---

## Fase 1 — Caption / nota de foto (prioridad alta)

### UX

- En detalle de foto (galería / sheet): botón **«Sugerir nota»**.
- Muestra draft en textarea; acciones: **Insertar como nota PHOTO**, **Copiar**, **Descartar**.
- Si ya hay notas en esa foto, el prompt pide *complementar*, no repetir.
- Opcional: tono corto (`neutro` / `divertido` / `poético`) — 3 chips; default `neutro`.

### Contexto enviado (ejemplo)

```json
{
  "travelTitle": "Krakow 2026",
  "authorAlias": "Irene",
  "exifLocal": "2026-06-11 10:42",
  "place": { "name": "Wawel", "type": "VIEWPOINT" },
  "existingNotes": ["Bien prontito descubrí mi destino sorpresa"],
  "nearbyPlaceNames": ["Plaza del Mercado"],
  "tone": "neutro"
}
```

Sin URL de imagen. Si no hay lugar ni notas ni EXIF → UI: «Poca info; la sugerencia será genérica» + checkbox «Aun así».

### API

`POST /api/ai/suggest-photo-note`

```ts
{ travelId, photoId, tone?: "neutro" | "divertido" | "poetico" }
→ { suggestion: string, interpretation?: string, cached?: boolean }
```

Persistencia: **ninguna** hasta que el cliente cree la `Note` con el flujo actual (`POST /api/notes`).

### Criterio de hecho

- Sin pulsar el botón, cero llamadas IA (verificar en logs/tests).
- Aceptar crea exactamente una nota PHOTO con el texto editado.
- Con `DEEPSEEK_API_KEY` ausente → 503/JSON error usable, no 500 opaco.

---

## Fase 2 — Resumen de un día

### UX

- En pestaña Días / calendario: en un día concreto, **«Resumir este día»**.
- Draft → **Crear nota del día** (`NoteType.DAY`) o **Añadir al final** si ya existe nota DAY del usuario.
- Nunca pisa notas de otros aliases.

### Contexto

- Lista corta de lugares visitados ese día (nombre, tipo).
- Hasta 8 bullets de notas PHOTO/DAY/PLACE ese día (recortar a 120 chars c/u).
- Conteo de fotos; 3–5 nombres de lugar o «foto cerca de X» — **sin** listar las 50 URLs.
- `journalBrief` del viaje solo si ≤ 400 chars (si es más largo, omitir o primeros 400).

### API

`POST /api/ai/suggest-day-summary`

```ts
{ travelId, dayKey: "YYYY-MM-DD", language?: "es" }
→ { suggestion: string, sources: { placeCount, noteCount, photoCount } }
```

### Criterio de hecho

- Solo el `dayKey` pedido entra en el prompt.
- Usuario puede editar antes de guardar.
- Día sin datos → heurística «Sin actividad registrada…» **sin** llamar IA.

---

## Fase 3 — Storyboard + captions Reel

### UX

- En panel Reel: botón **«Proponer storyboard»** (junto al brief, no dentro del export automático).
- Resultado: lista ordenada de `photoId` + caption opcional + razón corta.
- Acciones: **Aplicar selección** (marca/reordena lo que el encoder ya entiende: highlight / pick list), **Aplicar captions** (solo si el reel soporta overlay; si no, guardar como notas PHOTO o campo draft en `exportBriefCache`).
- Duración UI (15/30/60) **manda** el tamaño del storyboard (p.ej. 6 / 10 / 14 slots).

### Pipeline tokens-eficiente

1. **Heurística local** elige candidatos (highlightScore, diversidad lugar/día, transport start/end) — reutilizar `export-photo-pick` / lógica reel.
2. Enviar al modelo **solo metadatos de candidatos** (máx. ~20), no todo el álbum.
3. El modelo **reordena / descarta / escribe captions** en JSON tipado; si falla, se usa el orden heurístico sin captions.

```ts
// respuesta tipada
{
  version: 1,
  frames: Array<{ photoId: string; caption?: string; role?: "open" | "beat" | "close" }>,
  interpretation?: string
}
```

### API

`POST /api/ai/suggest-reel-storyboard`

```ts
{ travelId, durationSeconds: 15 | 30 | 60, dayKey?: string | null, brief?: string }
```

`brief` opcional: si ya hay `exportBrief`, reutilizar knobs **cacheados** de `interpretExportBrief` en lugar de re-interpretar (0 tokens extra).

### Criterio de hecho

- Exportar Reel **sin** pulsar «Proponer storyboard» = 0 llamadas nuevas de storyboard.
- JSON inválido → fallback heurístico + warning UI.
- No inventa `photoId` fuera de la lista enviada (validar server-side).

---

## Infra compartida

| Pieza | Rol |
|-------|-----|
| `src/lib/ai.ts` | Cliente existente |
| `src/lib/ai-suggest.ts` (nuevo) | Prompts cortos, clamp, parse JSON, techos `max_tokens` |
| `src/lib/ai-suggest-cache.ts` (nuevo, opcional P1.1) | Cache por travel + hash en proceso (o campo JSON en Travel) |
| `POST /api/ai/*` | Authz mínima: travelId existe; (futuro) sesión = participante |
| Feature flag env | `AI_SUGGESTIONS=0` desactiva las tres rutas |

Telemetría ligera (log servidor): `surface`, `promptTokens?`, `cached`, `durationMs` — sin texto del usuario en logs de producción si es posible.

---

## Fuera de alcance (este plan)

- Visión automática al subir
- Resúmenes de viaje enteros (ya cubre la crónica)
- Traducción masiva de notas
- Generación de audio / imágenes
- Paywall (ver `plan-producto-escala.md`; estas rutas serían candidatas Plus más adelante)
- Cambiar el journal pipeline multi-paso

---

## Orden de implementación

| Fase | Entrega | Dependencias | Riesgo tokens |
|------|---------|--------------|---------------|
| **1** | Suggest nota foto + UI | `ai.ts`, notes API | Bajo |
| **1.1** | Cache + batch ≤10 seleccionadas | Fase 1 | Bajo |
| **2** | Resumen día + UI Días | Fase 1 (helpers) | Bajo–medio |
| **3** | Storyboard Reel + aplicar | Fase 1 + photo-pick + reel panel | Medio (acotado por candidatos) |
| **4** (opcional) | «Describir foto» con vision on-demand | Consentimiento + resize | Alto — solo opt-in |

Estimación de invasividad: Fases 1–2 tocan UI de foto/día y 2 rutas API. Fase 3 toca `ExportReelPanel` + validación de IDs; no cambia el encoder salvo consumir una lista `photoIds` ordenada si aún no existe knob (si falta, añadir `storyboardPhotoIds?: string[]` en prefs de export).

---

## Tests

1. Unit: construcción de contexto (recortes, techos, día vacío → no llama IA).
2. Unit: parse/validación storyboard (rechaza photoIds desconocidos).
3. Integration ligera con mock del client OpenAI (1 completion).
4. Manual: Krakow — sugerir nota en foto con lugar; resumir un día; proponer storyboard 30s y exportar.

---

## Copy UI (ES)

- «Sugerir nota» / «Resumir este día» / «Proponer storyboard»
- Pie: «Usa IA solo al pulsar. Puedes editar antes de guardar.»
- Error red: «No hay conexión con la IA. Prueba más tarde o escribe a mano.»

---

## Relación con planes existentes

| Plan | Relación |
|------|----------|
| `plan-export-ai-brief.md` | Brief → knobs de presentación; **no** sustituye storyboard (Fase 3 puede reutilizar cache del brief) |
| Crónica / `journal-pipeline` | Viaje completo; Fase 2 es **un día**, más barato y local |
| `plan-producto-escala.md` | Candidato a feature Plus; self-host sigue con la misma UX on-demand |

---

## Definición de éxito

Un usuario puede mejorar captions, un día y un reel **solo cuando quiere**, con borradores editables, sin sorpresas de coste, y con degradación elegante sin API key — sin cambiar el flujo actual de captura ni el export silencioso.
