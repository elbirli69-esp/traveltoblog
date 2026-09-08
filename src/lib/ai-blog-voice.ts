/**
 * Shared voice for on-demand AI suggestions aimed at travel-blog copy.
 * Distinguishes: invent photo visuals (forbidden) vs. place/destination
 * cultural-historical curiosities for readers (encouraged when anchored).
 */

import {
  destinationFichePromptAddon,
  hasDestinationFiche,
  type DestinationFiche,
} from "@/lib/destination-fiche";

/** Common rules injected into photo-note, day-summary and reel storyboard prompts. */
export function buildTravelBlogVoiceBlock(opts?: {
  /** Shorter captions / notes — keep curiosities to half a sentence. */
  compact?: boolean;
  /** Optional destination fiche (B5) — steers curiosities when present. */
  destination?: DestinationFiche | null;
}): string {
  const compact = opts?.compact ?? false;
  const dest = opts?.destination ?? null;
  const destHint = hasDestinationFiche(dest)
    ? compact
      ? `Si hay ficha destino («${dest!.name ?? "destino"}»), prioriza esos temas en media frase cuando el lugar encaje.`
      : `Si el viaje tiene ficha destino${dest!.name ? ` («${dest!.name}»)` : ""}${
          dest!.themes.length
            ? ` con temas ${dest!.themes.join(", ")}`
            : ""
        }, prioriza curiosidades de esos temas ancladas a lugares visitados.`
    : compact
      ? "Cuando haya un lugar nombrado o el título del viaje indique el destino, añade SI CABE una curiosidad muy breve (historia, tradición, costumbre o dato de interés) ligada a ese sitio/destino."
      : "Cuando haya lugares nombrados o el título del viaje indique el destino (p. ej. «Krakow»), enriquece con 1–2 curiosidades útiles: historia local, tradiciones, costumbres, gente del lugar o por qué ese sitio interesa a quien lee el blog.";

  const lines = [
    "Audiencia: texto para un BLOG de viaje (útil y ameno para otras personas, no solo un diario privado).",
    destHint,
    "Ancla cada curiosidad a un nombre que aparezca en la semilla, en «lugar»/«lugares»/«cerca», en el título del viaje o en la ficha destino. Ejemplo válido: semilla «paseo por la muralla» + lugar Wawel → mencionar que fue sede real polaca.",
    "Prefiere hechos ampliamente conocidos y sobrios; una sola idea por curiosidad. No encadenes datos de guía turística.",
    "PROHIBIDO inventar lo que SE VE en la foto (objetos, personas, ropa, clima, comida, sonidos) si no está en la semilla o en captions/notas dadas.",
    "PROHIBIDO inventar visitas a monumentos o barrios que el viajero no haya nombrado ni enlazado en el JSON.",
    "PROHIBIDO inventar anécdotas personales falsas («conocimos a…», «probamos…») que no estén en la semilla o notas.",
    "No copies párrafos de Wikipedia; una frase de color basta. Sin spoilers de películas ni leyendas dudosas presentadas como hecho.",
  ];
  const addon = destinationFichePromptAddon(dest).trim();
  if (addon) lines.push(addon);
  return lines.join(" ");
}
