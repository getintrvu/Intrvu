/** A short stable identifier for a job posting, used to tell whether results belong to the job the
 * user is looking at now. Based on the description only (titles and company names are the parts of
 * LinkedIn's page that are hardest to read reliably), ignoring case and whitespace. */
export function jobKey(description: string): string {
  const text = description.toLowerCase().replace(/\s+/g, ' ').trim();
  // FNV-1a, 32 bit: fast, synchronous, and plenty to tell two postings apart.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}
