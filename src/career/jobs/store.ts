/**
 * Job listing storage with pipeline tracking and persistence.
 */

import type { JobListing, JobSearch, JobStatus } from "./types.js";

type PipelineSummary = {
  byStatus: Record<string, number>;
  total: number;
  avgScore: number;
};

type SerializedJobStore = {
  listings: JobListing[];
  searches: JobSearch[];
};

export type JobStore = {
  addListing(listing: JobListing): void;
  updateStatus(id: string, status: JobStatus): void;
  getByStatus(status: JobStatus): JobListing[];
  getByCompany(company: string): JobListing[];
  getHighMatches(minScore: number): JobListing[];
  getRecentListings(sinceDaysAgo: number): JobListing[];
  getPipelineSummary(): PipelineSummary;
  addSearch(search: JobSearch): void;
  getSearches(): JobSearch[];
  toggleSearch(id: string): void;
  toJSON(): SerializedJobStore;
  fromJSON(data: SerializedJobStore): void;
};

/** Create a new in-memory job store. */
export function createJobStore(): JobStore {
  const listings = new Map<string, JobListing>();
  const searches = new Map<string, JobSearch>();

  function addListing(listing: JobListing): void {
    listings.set(listing.id, listing);
  }

  function updateStatus(id: string, status: JobStatus): void {
    const listing = listings.get(id);
    if (!listing) {
      return;
    }
    listing.status = status;
    if (status === "applied") {
      listing.appliedDate = new Date().toISOString();
    }
  }

  function getByStatus(status: JobStatus): JobListing[] {
    const results: JobListing[] = [];
    for (const listing of listings.values()) {
      if (listing.status === status) {
        results.push(listing);
      }
    }
    return results;
  }

  function getByCompany(company: string): JobListing[] {
    const normalized = company.toLowerCase();
    const results: JobListing[] = [];
    for (const listing of listings.values()) {
      if (listing.company.toLowerCase().includes(normalized)) {
        results.push(listing);
      }
    }
    return results;
  }

  function getHighMatches(minScore: number): JobListing[] {
    const results: JobListing[] = [];
    for (const listing of listings.values()) {
      if (listing.relevanceScore >= minScore) {
        results.push(listing);
      }
    }
    return results.toSorted((a, b) => b.relevanceScore - a.relevanceScore);
  }

  function getRecentListings(sinceDaysAgo: number): JobListing[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - sinceDaysAgo);
    const cutoffStr = cutoff.toISOString();

    const results: JobListing[] = [];
    for (const listing of listings.values()) {
      if (listing.postedDate && listing.postedDate >= cutoffStr) {
        results.push(listing);
      }
    }
    return results.toSorted((a, b) => {
      const da = a.postedDate ?? "";
      const db = b.postedDate ?? "";
      return db.localeCompare(da);
    });
  }

  function getPipelineSummary(): PipelineSummary {
    const byStatus: Record<string, number> = {};
    let totalScore = 0;
    let count = 0;

    for (const listing of listings.values()) {
      byStatus[listing.status] = (byStatus[listing.status] ?? 0) + 1;
      totalScore += listing.relevanceScore;
      count++;
    }

    return {
      byStatus,
      total: count,
      avgScore: count > 0 ? Math.round((totalScore / count) * 100) / 100 : 0,
    };
  }

  function addSearch(search: JobSearch): void {
    searches.set(search.id, search);
  }

  function getSearches(): JobSearch[] {
    return Array.from(searches.values());
  }

  function toggleSearch(id: string): void {
    const search = searches.get(id);
    if (!search) {
      return;
    }
    search.enabled = !search.enabled;
  }

  function toJSON(): SerializedJobStore {
    return {
      listings: Array.from(listings.values()),
      searches: Array.from(searches.values()),
    };
  }

  function fromJSON(data: SerializedJobStore): void {
    listings.clear();
    searches.clear();
    for (const listing of data.listings) {
      listings.set(listing.id, listing);
    }
    for (const search of data.searches) {
      searches.set(search.id, search);
    }
  }

  return {
    addListing,
    updateStatus,
    getByStatus,
    getByCompany,
    getHighMatches,
    getRecentListings,
    getPipelineSummary,
    addSearch,
    getSearches,
    toggleSearch,
    toJSON,
    fromJSON,
  };
}
