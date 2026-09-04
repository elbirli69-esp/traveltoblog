# Plan: export HTML tipo blog experto (plantilla Magazine)

Plan derivado de la auditoría de blogs de viaje de referencia (narrativa única, fotos protagonistas, utilidad práctica, SEO). Objetivo: que el export HTML se lea como un post profesional, no como un dashboard de datos.

## Estado

| Fase | Estado | Descripción |
|------|--------|-------------|
| 1 — Recorrido visual | ✅ | Timeline tipo story cards (fotos, lugares, notas, vuelos) |
| 2 — Plantilla Magazine | ✅ | Hero + deck, TOC, meta OG, cierre, callouts |
| 3 — Integración export | ✅ | Nueva plantilla por defecto en panel de export |
| 4 — Pulido visual | ✅ | Estilos editorial, progreso de lectura, galería secundaria |

## Principios (blogs expertos)

1. **Una sola narrativa** — Sección **El viaje** (crónica IA + cards). Luego **Galería**, **Guía** y **Cierre**.
2. **Titular + deck** — Subtítulo emocional desde nota TRIP o primer párrafo de la crónica.
3. **Fotos en contexto** — Grandes dentro del recorrido, con comentarios PHOTO fusionados.
4. **Utilidad práctica** — Callouts de hoteles, restaurantes y miradores al cierre.
5. **Navegación** — TOC por días + barra de progreso al scroll.
6. **Compartir** — Open Graph y JSON-LD para publicar estático.

## Arquitectura

```
src/lib/export/
  story-timeline-html.ts   # Recorrido visual (cards por evento)
  magazine-html.ts         # Deck, TOC, meta, callouts, cierre, estilos
  timeline-html.ts         # Puente + stats, vuelos, play mode
  typologies/registry.ts   # Orden de secciones por tipo de viaje

src/lib/export-html.ts     # Orquestación plantillas + ZIP
```

## Secciones plantilla Magazine

1. Hero (portada + título + deck + viajeros)
2. TOC sticky (días + enlace a cierre)
3. Stats (si tipología lo indica)
4. Mapa (si hay GPS)
5. **El viaje** (crónica + recorrido unificados: intro IA, prosa por día, cards, cierre)
6. **Galería** completa (cronológica)
7. Guía práctica (callouts por tipo de lugar)
8. Para cerrar (nota TRIP + resumen)

## Criterios de hecho

- Export ZIP/HTML con plantilla Magazine genera recorrido visual legible.
- Deck automático desde nota TRIP o crónica.
- TOC enlaza a cada día del viaje.
- Meta `og:title`, `og:description`, `og:image` en `<head>`.
- Callouts agrupan hoteles/restaurantes/miradores.
- Galería ordenada por EXIF con pie fecha + autor.

## Pendiente futuro (fuera de alcance)

Ver **`docs/plan-export-html-next.md`** para el backlog priorizado.

Resumen:
- ✅ P1: mapa estático offline, vídeo en Recorrido/Galería, tipologías Magazine reales
- Mapa inline por sección / scroll spy con mapa lateral
- «Reproducir» en Magazine + dual maps
- Tests del export HTML, lightbox/a11y, HTML único liviano, GPS trail UX, paridad plantillas
- Plantilla totalmente personalizable (colores, fuentes)
- Preview en app antes de exportar
- Avisos pre-export (“3 días sin nota DAY”)
- Plantillas por tipología de experiencia (boda, festival, etc.) — ver [`plan-producto-escala.md`](./plan-producto-escala.md)
