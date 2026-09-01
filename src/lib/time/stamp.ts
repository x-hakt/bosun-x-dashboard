import { loadConfig } from "@/lib/data/config";

// ISO-8601 stamps in the instance timezone (config.yml `timezone`, else the system
// zone). The formatter is rebuilt only when the zone changes, which is ~never.
let zone: string | undefined;
let formatter: Intl.DateTimeFormat;

function partsFor(date: Date): Record<string, string> {
  const tz = loadConfig().timezone;
  if (!formatter || tz !== zone) {
    zone = tz;
    formatter = new Intl.DateTimeFormat("en-CA", {
      ...(tz ? { timeZone: tz } : {}),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    });
  }
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

export function isoTimestamp(date = new Date()): string {
  const parts = partsFor(date);
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, "0");
  const offset = parts.timeZoneName
    .replace("GMT", "")
    .replace("UTC", "")
    .replace(/^([+-]\d{2})$/, "$1:00") || "+00:00";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}${offset}`;
}

export function dateStamp(date = new Date()): string {
  const parts = partsFor(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
