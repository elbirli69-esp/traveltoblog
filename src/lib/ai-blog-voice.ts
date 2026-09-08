/**
 * Shared voice for on-demand AI suggestions aimed at travel-blog copy.
 * Distinguishes: invent photo visuals (forbidden) vs. place/destination
 * cultural-historical curiosities for readers (encouraged when anchored).
 */

/** Common rules injected into photo-note, day-summary and reel storyboard prompts. */
export function buildTravelBlogVoiceBlock(opts?: {
  /** Shorter captions / notes — keep curiosities to half a sentence. */
  compact?: boolean;
}): string {
  const compact = opts?.compact ?? false;
  return [
    "Audiencia: texto para un BLOG de viaje (útil y ameno para otras personas, no solo un diario privado).",
    compact
      ? "Cuando haya un lugar nombrado o el título del viaje indique el destino, añade SI CABE una curiosidad muy breve (historia, tradición, costumbre o dato de interés) ligada a ese sitio/destino."
      : "Cuando haya lugares nombrados o el título del viaje indique el destino (p. ej. «Krakow»), enriquece con 1–2 curiosidades útiles: historia local, tradiciones, costumbres, gente del lugar o por qué ese sitio interesa a quien lee el blog.",
    "Ancla cada curiosidad a un nombre que aparezca en la semilla, en «lugar»/«lugares»/«cerca» o en el título del viaje. Ejemplo válido: semilla «paseo por la muralla» + lugar Wawel → mencionar que fue sede real polaca.",
    "Prefiere hechos ampliamente conocidos y sobrios; una sola idea por curiosidad. No encadenes datos de guía turística.",
    "PROHIBIDO inventar lo que SE VE en la foto (objetos, personas, ropa, clima, comida, sonidos) si no está en la semilla o en captions/notas dadas.",
    "PROHIBIDO inventar visitas a monumentos o barrios que el viajero no haya nombrado ni enlazado en el JSON.",
    "PROHIBIDO inventar anécdotas personales falsas («conocimos a…», «probamos…») que no estén en la semilla o notas.",
    "No copies párrafos de Wikipedia; una frase de color basta. Sin spoilers de películas ni leyendas dudosas presentadas como hecho.",
  ].join(" ");
}
