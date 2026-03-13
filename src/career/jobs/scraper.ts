/**
 * Job scraping orchestrator.
 * Routes searches to registered source-specific scrapers.
 */

import type { JobListing, JobSearch } from "./types.js";

/** A scraper function that fetches listings for a given search config. */
export type JobScraperFn = (config: JobSearch) => Promise<JobListing[]>;

export type JobScraper = {
  registerScraper(source: string, scraper: JobScraperFn): void;
  runSearch(search: JobSearch): Promise<JobListing[]>;
  getSources(): string[];
};

/** Create a scraping orchestrator with pluggable source scrapers. */
export function createJobScraper(): JobScraper {
  const scrapers = new Map<string, JobScraperFn>();

  function registerScraper(source: string, scraper: JobScraperFn): void {
    scrapers.set(source.toLowerCase(), scraper);
  }

  async function runSearch(search: JobSearch): Promise<JobListing[]> {
    // Determine which scrapers to invoke.
    const targetSources =
      search.sources.length > 0
        ? search.sources.map((s) => s.toLowerCase())
        : Array.from(scrapers.keys());

    // Run all matching scrapers concurrently.
    const promises: Promise<JobListing[]>[] = [];

    for (const source of targetSources) {
      const scraper = scrapers.get(source);
      if (!scraper) {
        continue;
      }

      promises.push(
        scraper(search).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Scraper "${source}" failed: ${msg}`);
          return [] as JobListing[];
        }),
      );
    }

    const results = await Promise.all(promises);
    return results.flat();
  }

  function getSources(): string[] {
    return Array.from(scrapers.keys());
  }

  return { registerScraper, runSearch, getSources };
}
