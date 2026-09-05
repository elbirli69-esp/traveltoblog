# Plan: catálogo tipado de presets de Reel (brief → match)

## Principio

El Reel es **un solo layout** vertical (Instagram 9:16). No hay “estructuras” HTML distintas.
Lo análogo al catálogo HTML es un **catálogo de presets de montaje**: ritmo, captions, cortes, densidad de fotos, sesgo a highlights/mapa.

Prioridad:

`duración UI` > `preset UI` / `Aplicar sugerencia` > knobs del brief > defaults del preset.

La IA **no** genera MP4 libre: solo elige un preset tipado y/o afina knobs existentes.

---

## Catálogo inicial (6)

| Id | Look |
|----|------|
| `balanced-story` | Default: ritmo medio, textos cortos, cortes mixtos |
| `calm-story` | Pocas fotos, fundidos, captions narrativos |
| `punchy-highlights` | Rápido, highlights, cortes vivos |
| `textless-photos` | Sin texto en pantalla |
| `place-labels` | Solo nombres de lugar |
| `map-pulse` | Recorrido/mapa al frente + lugares |

---

## Modelo

Ver `src/lib/export/reel-preset-catalog.ts` y `src/lib/export/reel-preset-match.ts`.

- `ReelPresetCatalogEntry`: criteria + `defaultDirectives`
- `matchReelPresetCatalog`: score determinista sobre directrices del brief
- `mergeReelDirectives` / `resolveReelDirectivesForPreset`: preset ⊕ brief (brief gana)

---

## UX

1. Selector de preset en el panel Reel (junto a duración).
2. Brief libre + Interpretar → chip **Sugerencia: …** + **Aplicar**.
3. Export envía `presetId`; el servidor fusiona preset + brief; la duración UI manda.

---

## Fase 1 (este PR)

- [x] Schema + 6 presets
- [x] Matcher + tests
- [x] API brief → `reelPresetMatch`
- [x] Panel: selector + chip Aplicar
- [x] Export-reel acepta `presetId` y fusiona

## Qué no hacer

- Inventar clips/MP4 con IA
- Cambiar la duración UI desde el brief
- Prometer “cumple el 100% del brief”
