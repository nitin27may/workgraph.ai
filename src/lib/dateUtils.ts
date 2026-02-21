/**
 * Parse a UTC datetime string from Microsoft Graph API.
 * Graph returns datetime without timezone suffix — this adds 'Z' to parse as UTC.
 */
export function parseUTCDateTime(dateTimeString: string): Date {
  const cleanedString = dateTimeString.replace(/\.\d+$/, "");
  return new Date(cleanedString + "Z");
}

/** Full date + time format: "Mon, Jan 1, 2024, 2:30 PM" */
export function formatMeetingDateTime(dateTimeString: string): string {
  const date = parseUTCDateTime(dateTimeString);
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Long date only: "Monday, January 1, 2024" */
export function formatMeetingDate(dateTimeString: string): string {
  const date = parseUTCDateTime(dateTimeString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Time only: "2:30 PM" */
export function formatMeetingTime(dateTimeString: string): string {
  const date = parseUTCDateTime(dateTimeString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
