/** Dates are stored in UTC and displayed in Ghana time (Africa/Accra, GMT). */
export const TIME_ZONE = "Africa/Accra";

const dateFmt = new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE });
const dateTimeFmt = new Intl.DateTimeFormat("en-GH", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});
const timeFmt = new Intl.DateTimeFormat("en-GH", { hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE });

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  return dateFmt.format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  return dateTimeFmt.format(new Date(value));
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  return timeFmt.format(new Date(value));
}

export function timeAgo(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "";
  const seconds = Math.round((now.getTime() - new Date(value).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

export function timeUntil(value: string | Date, now: Date = new Date()): string {
  const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000);
  if (seconds <= 0) return "expired";
  const hours = Math.floor(seconds / 3600);
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`;
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.floor(seconds / 60))}m left`;
}

export function isPast(value: string | Date): boolean {
  return new Date(value).getTime() < Date.now();
}

export function isWithinDays(value: string | Date, days: number): boolean {
  return Date.now() - new Date(value).getTime() < days * 86_400_000;
}
