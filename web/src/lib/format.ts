/** "12m", "3h", "2d" — compact list timestamps, WhatsApp style. */
export function shortRelative(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Date divider label: "Today", "Yesterday", or "20 Apr 2026". */
export function dayLabel(iso: string, now: number = Date.now()): string {
  const date = new Date(iso);
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date(now)) - startOf(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Stored numbers are bare E.164 digits; render them readably. */
export function formatPhone(digits: string): string {
  const clean = digits.replace(/\D/g, "");
  if (!clean) return digits;
  if (clean.length <= 10) return `+${clean}`;
  const cc = clean.slice(0, clean.length - 10);
  const rest = clean.slice(-10);
  return `+${cc} ${rest.slice(0, 5)} ${rest.slice(5)}`;
}
