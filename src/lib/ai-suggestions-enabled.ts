/** Feature flag: set AI_SUGGESTIONS=0 to disable on-demand AI routes. */
export function aiSuggestionsEnabled(): boolean {
  const raw = process.env.AI_SUGGESTIONS;
  if (raw == null || raw === "") return true;
  return !/^(0|false|off|no)$/i.test(raw.trim());
}
