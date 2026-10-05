/** The daily analysis quota resets at midnight UTC (the backend counts days in UTC). */
export function nextUtcMidnight(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/** When the quota resets, as a local time of day such as "5:30 AM". */
export function quotaResetTime(now: Date = new Date()): string {
  return nextUtcMidnight(now).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
