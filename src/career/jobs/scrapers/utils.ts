/**
 * Shared scraper utilities for HTML stripping and remote policy detection.
 */

import type { RemotePolicy } from "../types.js";

/** Strip HTML tags and decode common entities. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Detect remote policy from text. */
export function detectRemotePolicy(text: string): RemotePolicy {
  const lower = text.toLowerCase();
  if (/\bfully\s+remote\b/.test(lower) || /\bremote\s+only\b/.test(lower)) {
    return "remote";
  }
  if (/\bremote\b/.test(lower)) {
    return "remote";
  }
  if (/\bhybrid\b/.test(lower)) {
    return "hybrid";
  }
  if (/\bon[\s-]?site\b/.test(lower) || /\bin[\s-]?office\b/.test(lower)) {
    return "onsite";
  }
  return "unknown";
}
