const UNITS = ["B", "kB", "MB", "GB", "TB"] as const;

/** Decimal units, matching what Finder and most operating systems show. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const exponent = Math.min(Math.floor(Math.log10(bytes) / 3), UNITS.length - 1);
  const value = bytes / 1000 ** exponent;
  const digits = exponent === 0 || value >= 100 ? 0 : 1;
  const text = value.toFixed(digits).replace(/\.0$/, "");
  return `${text} ${UNITS[exponent]}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "3 days", "5 hours", "12 minutes". Returns null once the date has passed. */
export function timeUntil(date: Date | string, now: Date = new Date()): string | null {
  const ms = new Date(date).getTime() - now.getTime();
  if (ms <= 0) return null;
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return pluralize(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return pluralize(hours, "hour");
  return pluralize(Math.round(hours / 24), "day");
}

/** "2 Oct 2026". UTC, so server and client agree. */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

/** "About 3 min", "About 40 s". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

/** Last path segment: "Photos/IMG_1.jpg" -> "IMG_1.jpg". */
export function basename(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

/** Two-digit row index: 1 -> "01". */
export function rowNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}
