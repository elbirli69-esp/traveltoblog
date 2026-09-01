"use client";

import { formatDateKey } from "@/lib/travel-dates";

interface MemoryDateTimeFieldProps {
  label?: string;
  date: string;
  time?: string;
  onDateChange: (dateKey: string) => void;
  onTimeChange?: (time: string) => void;
  hint?: string;
  /** Show optional time input (default true when onTimeChange is set) */
  showTime?: boolean;
  className?: string;
}

export function dateTimeToIso(dateKey: string, time = "12:00"): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [h, m] = time.split(":").map(Number);
  const d = new Date(dateKey + "T00:00:00");
  d.setHours(Number.isFinite(h) ? h : 12, Number.isFinite(m) ? m : 0, 0, 0);
  return d.toISOString();
}

export function isoToDateAndTime(iso: string | Date | null | undefined): {
  date: string;
  time: string;
} {
  if (!iso) return { date: "", time: "12:00" };
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "12:00" };
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return { date: `${y}-${mo}-${day}`, time: `${h}:${mi}` };
}

export default function MemoryDateTimeField({
  label = "¿Cuándo fue?",
  date,
  time = "12:00",
  onDateChange,
  onTimeChange,
  hint,
  showTime,
  className = "",
}: MemoryDateTimeFieldProps) {
  const withTime = showTime ?? Boolean(onTimeChange);

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
      <div className={`grid gap-2 ${withTime ? "sm:grid-cols-2" : ""}`}>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
        {withTime && onTimeChange && (
          <input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        )}
      </div>
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{hint}</p>}
      {date && (
        <p className="text-xs text-teal-700">
          {formatDateKey(date)}
          {withTime && time ? ` · ${time}` : ""}
        </p>
      )}
    </div>
  );
}
