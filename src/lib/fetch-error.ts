/** Browser TypeError when the request never reaches the app (DNS, Tailscale, offline). */
export function isNetworkFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    error.name === "TypeError" ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("network request failed")
  );
}

/**
 * Human-readable error for fetch failures.
 * Distinguishes Tailscale/connectivity from HTTP/API errors.
 */
export function describeFetchError(
  error: unknown,
  fallback = "Error de red al contactar el servidor"
): string {
  if (isNetworkFetchError(error)) {
    return (
      "No hay conexión con el servidor (Failed to fetch). " +
      "Revisa Tailscale, que el NAS esté encendido y que la URL de la app cargue."
    );
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
