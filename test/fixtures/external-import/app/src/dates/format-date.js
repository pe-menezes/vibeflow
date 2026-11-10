// Dates travel as Date objects and are shown as YYYY-MM-DD, in UTC.
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}
