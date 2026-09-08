# Plan: blog editorial — contenido, UX y huecos del relato

Plan de producto derivado de la auditoría editorial (2026-09-08): pasar de **archivo de viaje exportable** a **blog publiable**, sin reescribir el modelo de datos de golpe.

Complementa:

- [`AGENT-HANDOFF.md`](./AGENT-HANDOFF.md) — estado técnico y contrato de IA
- [`plan-contenido-unificado.md`](./plan-contenido-unificado.md) — captura unificada (ya ✅)
- [`plan-producto-escala.md`](./plan-producto-escala.md) — SaaS / freemium
- Planes `plan-export-*.md` — presentación HTML/PDF/Reel

## Decisión de producto

1. La IA ya escribe con **voz blog** (curiosidades ancladas). Falta **estructura editorial** y **guiar la captura** hacia un relato completo.
2. El sistema debe **decir qué falta** para un buen blog (lugares, comidas, experiencias personales, tips…), no solo “faltan fotos”.
3. Priorizar **viaje → blog legible** antes de tipologías boda/festival.

## Objetivo

El usuario entiende un embudo claro:

```
Capturar → Completar huecos del blog → Redactar crónica → Preview lector → Exportar
```

y en cada paso ve **qué aportar** para que el resultado sea útil y ameno para otras personas (no solo el grupo).

## Baseline (hoy)

| Pieza | Estado |
|-------|--------|
| Captura foto/lugar/día/viaje | ✅ Fuerte |
| Seed-first + voz blog en IA | ✅ En `main` |
| Checklist crónica (`journal-readiness`) | ⚠️ Solo cobertura técnica (ida/vuelta, notas viaje, días vacíos) |
| Arco narrativo (gancho / tips / guía lector) | ❌ No guiado |
| Semillas por tipo de lugar | ❌ Textarea genérico |
| Cola “fotos sin nota” | ❌ No |
| Preview HTML tipo blog pre-ZIP | ⚠️ Parcial / no “momento lector” |
| Detección de huecos editoriales (comida, anécdota, tip…) | ❌ No |

## Principios

1. **Detectar huecos ≠ inventar contenido.** El sistema sugiere *qué escribir o enlazar*; no rellena visitas falsas.
2. **Heurísticas primero, IA después.** Contar lugares tipados, notas, seeds; la IA solo opcionalmente prioriza o redacta el mensaje.
3. **CTA accionable.** Cada hueco lleva a `?add=…`, foto concreta, o semilla prefijada.
4. **Viaje en curso vs pasado.** Mismos huecos; copy distinto (“hoy falta…” vs “en la reconstrucción falta…”).
5. **Compatible** con viajes existentes; sin migración obligatoria de schema en las primeras fases.

---

## Pieza central: “Qué falta para un buen blog”

### ¿Se puede añadir? **Sí.**

Extender (o complementar) `journal-readiness` con un **BlogCompleteness** / checklist editorial que evalúa el *relato*, no solo la presencia de entidades.

### Señales de entrada (datos ya existentes)

| Señal | Fuente |
|-------|--------|
| Fotos seleccionadas sin `Note(PHOTO)` | Photo + notes |
| Días del rango sin `Note(DAY)` | travel dates + day notes |
| Lugares por `PlaceType` (RESTAURANT, CAFE, MUSEUM, VIEWPOINT…) | Place |
| Fotos con GPS / placeId vs huérfanas | Photo |
| Notas TRIP (intro/cierre) | Note TRIP |
| Longitud / existencia de semillas usadas (opcional, client) | UI state |
| Título del viaje (destino) | Travel.title |
| Brief de crónica vacío | Travel.journalBrief |

### Categorías de hueco (producto)

| Código | Qué detecta (ejemplos) | Mensaje tipo | Acción |
|--------|------------------------|--------------|--------|
| `places_sparse` | Pocos pins vs muchas fotos GPS | “Hay muchas fotos con ubicación y pocos lugares marcados. Añade 2–3 sitios con nombre.” | `?add=place` |
| `food_missing` | 0 RESTAURANT/CAFE y el viaje tiene ≥2 días | “Un blog de viaje suele contar al menos una comida o café. ¿Dónde comisteis?” | Añadir lugar tipo restaurante/café + nota |
| `personal_thin` | Notas PHOTO/DAY muy cortas o ausentes; muchas fotos “mudas” | “Faltan experiencias personales: una anécdota, un momento del grupo, algo que solo vosotros vivisteis.” | Cola fotos sin nota / nota del día |
| `day_gaps` | Días con fotos pero sin nota DAY | “El martes tiene fotos pero no relato del día.” | Nota del día ese `dayDate` |
| `hook_missing` | Sin TRIP note ni brief | “Falta el gancho del viaje (por qué fuisteis / la escena de apertura).” | Nota Viaje + brief crónica |
| `tips_missing` | Lugares sin ninguna nota PLACE ni tip en DAY | “Añade 1–2 consejos útiles para quien lea el blog (cola, horario, ‘merece la pena’).” | Nota en lugar o día |
| `transport_bounds` | Sin ida/vuelta (ya en readiness) | Mantener mensaje actual | Marcar foto ida/vuelta |
| `destination_context` | Título genérico o sin lugares anclables | “Nombra mejor el destino o enlaza lugares: la IA podrá aportar historia local con ancla.” | Editar título / lugares |
| `cover_story` | Muchas fotos, ninguna con highlight alto / sin “foto del día” | “Elige 3–5 fotos protagonistas (score) para el ritmo del blog y el Reel.” | Galería highlight |
| `reader_guide` | ≥3 lugares pero export sin bloque guía (fase posterior) | “Listo para generar una mini-guía al final del HTML solo con sitios visitados.” | Export HTML |

**Reglas de tono del mensaje**

- Concreto y amable (“falta una comida contada”), no punitivo.
- Máximo ~5 huecos visibles a la vez, ordenados por impacto editorial.
- Nunca sugerir inventar un sitio no visitado; sugerir *marcar* o *escribir* lo ya vivido.

### Dónde mostrarlo (UX)

1. **Crónica** — panel “Listo para un buen blog” junto al checklist técnico actual.
2. **Recuerdos** — banner o chip “N fotos sin nota” + cola.
3. **Export** — aviso suave si se exporta con huecos altos (no bloquear).
4. **Cierre de día** (viaje en curso) — “Hoy aún no hay: comida / nota del día / 1 foto comentada”.

### Implementación técnica (borrador)

```
src/lib/blog-completeness.ts
  buildBlogCompleteness(travelContext) → { score 0–100, gaps: BlogGap[] }

src/components/BlogCompletenessPanel.tsx
  lista + CTAs

Integración:
  JournalWorkspace + JournalReadinessChecklist (o panel hermano)
  PhotoGallery / TravelDayCalendar (cola y banners)
```

Heurísticas puras en v1. Opcional v2: una llamada IA **solo** para priorizar/redactar gaps a partir del JSON de conteos (barata, sin vision), gateada por `AI_SUGGESTIONS`.

---

## Resto del plan editorial (priorizado)

### Fase B0 — Documento y criterios ✅ (este archivo)

- [x] Acordar embudo Capturar → Huecos → Redactar → Preview → Export
- [x] Definir categorías de hueco y que **sí** entran comida / personal / tips

### Fase B1 — Completeness + cola fotos sin nota

**Alcance**

- Lib `blog-completeness` + panel en Crónica
- Cola “Fotos sin nota” en galería / recuerdos (CTA Completar con IA con semilla guiada)
- Reusar readiness técnica; no duplicar ida/vuelta

**Criterio de hecho**

- Viaje Krakow-like muestra huecos accionables (p. ej. sin restaurantes → `food_missing`)
- Clic en hueco lleva al sitio correcto a completar
- Tests unitarios de heurísticas

**Riesgo:** bajo.

### Fase B2 — Semillas guiadas + chips de intención en crónica

**Alcance**

- Placeholders / chips por `PlaceType` y por cierre de día (mañana/tarde/cena)
- Chips en brief de crónica: contexto destino / anécdotas / tips / lírico
- Prefill “usar última nota como semilla”

**Criterio de hecho**

- Usuario completa 3 semillas sin pensar el prompt
- Brief con chips se refleja en `journalBrief` y en la prosa generada

**Riesgo:** bajo–medio (prompts).

### Fase B3 — Arco narrativo y bloque “Guía para el lector”

**Alcance**

- Pipeline / refine: respetar intención (gancho, tips, cierre útil)
- En export HTML: sección opcional “Si vais, no os perdáis…” **solo** con lugares visitados (+ tip si hay nota PLACE)
- Título público editable distinto del título interno del viaje (opcional)

**Criterio de hecho**

- HTML de prueba incluye guía ≤5 ítems sin inventar sitios
- Crónica con chip “tips” produce al menos un consejo anclado

**Riesgo:** medio (export templates).

### Fase B4 — Preview lector + audiencia de export

**Alcance**

- Preview HTML a pantalla casi completa antes del ZIP
- Pregunta de audiencia: Blog largo / Álbum / Reel → rellena brief + preset

**Criterio de hecho**

- Usuario puede juzgar “¿se puede compartir?” sin descargar
- Elegir “Reel” no obliga a conocer knobs técnicos

**Riesgo:** medio.

### Fase B5 — Ficha destino ligera (opcional)

**Alcance**

- Campos opcionales en Travel: destino canónico, 2–3 temas (historia, comida, barrios)
- Alimentan voz blog y completeness (`destination_context`)

**Criterio de hecho**

- Sin ficha, todo sigue igual; con ficha, curiosidades más coherentes

**Riesgo:** bajo; schema aditivo.

---

## Orden de ejecución recomendado

```
B0 (plan) → B1 (huecos + cola notas) → B2 (semillas + chips)
        → B3 (guía lector + arco) → B4 (preview) → B5 (ficha destino)
```

No mezclar con A1 auth SaaS en el mismo PR; sí puede vivir en self-host.

## Fuera de alcance (ahora)

- Vision por foto
- Inventar restaurantes/monumentos no visitados
- Paywall / tipologías boda-festival
- Rewrite completo del modelo Note/Photo

## Criterios de hecho globales del plan

- [ ] El usuario ve **qué falta para un buen blog** (lugares, comidas, personal, tips…) con CTAs.
- [ ] Completar huecos mejora de forma medible la crónica/export sin alucinaciones nuevas.
- [ ] Embudo editorial entendible en UI (no solo tabs técnicas).
- [ ] Documentado en AGENT-HANDOFF al cerrar B1.

## Estado

| Fase | Estado |
|------|--------|
| B0 Plan | ✅ En `main` |
| B1 Completeness + cola | ✅ En `main` |
| B2 Semillas + chips | 🚧 PR B2 |
| B3 Guía lector + arco | 🚧 Este PR |
| B4 Preview + audiencia | 📋 Pendiente |
| B5 Ficha destino | 📋 Pendiente |
