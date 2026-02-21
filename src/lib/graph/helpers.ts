export const DEFAULT_DAYS_BACK = 30;
export const DEFAULT_MAX_RESULTS = 50;
export const MAX_EVENTS = 100;
export const TRANSCRIPT_BATCH_SIZE = 5;
export const SIMILARITY_THRESHOLD = 0.15;
export const MAX_RELATED_EMAILS = 15;
export const MAX_RELATED_MEETINGS = 8;
export const MAX_PREP_ATTENDEES = 5;
export const PREP_DAYS_BACK = 60;

export { sanitizeOData } from "./client";

/** Get today's date range from midnight to end of day */
export function getTodayDateRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Extract meaningful keywords from text, filtering out stop words */
export function extractKeywords(text: string): Set<string> {
  const stopWords = new Set([
    'meeting', 'call', 'sync', 'discussion', 'session', 'review', 'update',
    'weekly', 'daily', 'monthly', 'standup', 'check', 'in', 'the', 'a', 'an',
    'and', 'or', 'but', 'for', 'with', 'on', 'at', 'to', 'from', 'of', 'by', 'q1', 'q2', 'q3', 'q4'
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
  );
}

/** Calculate Jaccard similarity between two subject strings */
export function getSubjectSimilarity(subject1: string, subject2: string): number {
  const keywords1 = extractKeywords(subject1);
  const keywords2 = extractKeywords(subject2);

  if (keywords1.size === 0 || keywords2.size === 0) return 0;

  const intersection = new Set([...keywords1].filter(k => keywords2.has(k)));
  const union = new Set([...keywords1, ...keywords2]);

  return intersection.size / union.size;
}
