export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "traveltoblog-theme";

export function resolveTheme(stored: string | null): Theme {
  return stored === "light" ? "light" : "dark";
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return resolveTheme(localStorage.getItem(THEME_STORAGE_KEY));
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

/** Read a CSS custom property from :root (for Mapbox markers, etc.). */
export function getThemeColor(cssVar: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return value || fallback;
}

export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var dark=t!=='light';document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';}catch(e){document.documentElement.classList.add('dark');}})();`;
