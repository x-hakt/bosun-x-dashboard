const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "longOffset",
});

export function sydneyIsoTimestamp(date = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, "0");
  const offset = parts.timeZoneName.replace("GMT", "").replace(/^([+-]\d{2})$/, "$1:00");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}${offset}`;
}
