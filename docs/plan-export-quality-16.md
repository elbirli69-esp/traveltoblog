# Plan: calidad de exportación (puntos 1–6)

Plan de ejecución sobre las mejoras sugeridas tras Recuerdos, Reel por día y HTML/ZIP estable.
Complementa `plan-export-next.md` (Fases A–C **ya hechas** en producto).

## Objetivo

Más confianza al exportar y más “listo para Instagram / relive” sin romper:

> Knobs tipados + catálogos. **No** HTML/CSS/MP4/audio libres.

## Alcance v1 (este ciclo)

| # | Mejora | Entregable v1 | Fuera de v1 |
|---|--------|---------------|-------------|
| 1 | Reel audio / beats | Presets tipados `none` / `soft-pulse` / `travel-beat` (audio sintetizado + sync de cortes a BPM); default mute | Subida de MP3, biblioteca comercial, stems IA |
| 2 | Photo picking | Módulo compartido + diversidad por lugar + near-dupe en PDF (y tope galería HTML si emphasis low) | Perceptual hash / ML |
| 3 | Scroll-spy mapa ↔ crónica | Al scrollear `.story-day`, activa `.map-day-item` + `flyToGroup` (throttle) | Play mode Magazine completo |
| 4 | PDF ≈ HTML/Reel | Type pack override en panel PDF + guía con más callouts densos vía knobs | Layouts PDF nuevos |
| 5 | Preview fiel | HTML: confirmación de que preview usa mismos packs; Reel: storyboard 6–8 thumbs sin encode | Preview PDF WeasyPrint |
| 6 | Avisos de peso | Warnings en PDF/Reel + confirm al HTML único ≥25 fotos | Bloqueo duro irreversible |

## Principios

1. Un PR / rama de producto (`cursor/export-quality-16-6db5`) con commits por área si hace falta.
2. Tests: `test-export-reel`, `test-export-html`, `test-export-quality-d`, PDF catalog.
3. Copy UI en español; README Reel actualizado (audio opcional).
4. No deploy salvo petición explícita.

## Orden de implementación

1. Doc (este archivo)  
2. `#2` picking compartido (base para Reel/PDF/HTML)  
3. `#3` scroll-spy HTML  
4. `#6` warnings cross-panel  
5. `#5` preview Reel storyboard (+ HTML confirm)  
6. `#4` PDF type-pack + guide polish  
7. `#1` audio presets + mux + beat snap  

## Criterio de hecho global

- Usuario puede elegir audio tipado o silencio en Reel.
- Un viaje denso reduce near-dupes / apilado de un mismo lugar en Reel y PDF.
- En HTML Magazine/Visual, scrollear un día mueve el mapa.
- PDF admite type pack explícito.
- Reel muestra storyboard antes de codificar.
- HTML único grande pide confirmación; PDF/Reel muestran avisos de peso.

## Relacionado

- `plan-export-next.md` Fase D  
- `plan-export-html-next.md` A2 (scroll-spy)  
- `plan-export-reel-preset-catalog.md`
