"use client";

import { useTheme } from "@/components/ThemeProvider";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={isDark ? "Modo claro" : "Modo oscuro"}
      className={`inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] shadow-sm dark:shadow-black/20 transition hover:border-teal-500/40 hover:text-[var(--foreground)] ${className}`}
    >
      <span className="text-sm" aria-hidden>
        {isDark ? "☀️" : "🌙"}
      </span>
      <span>{isDark ? "Claro" : "Oscuro"}</span>
    </button>
  );
}
