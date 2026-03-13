/**
 * Company intelligence tracker.
 * Stores and queries company signals, connections, and metadata.
 */

import type { CompanyIntel, CompanySignal } from "./types.js";

type SerializedTracker = {
  companies: CompanyIntel[];
};

export type CompanyTracker = {
  addCompany(intel: CompanyIntel): void;
  getCompany(name: string): CompanyIntel | undefined;
  getAllCompanies(): CompanyIntel[];
  addSignal(companyName: string, signal: CompanySignal): void;
  getCompaniesWithRecentSignals(daysSince: number): CompanyIntel[];
  linkConnection(companyName: string, connectionId: string): void;
  toJSON(): SerializedTracker;
  fromJSON(data: SerializedTracker): void;
};

/** Normalize company name for lookup (lowercase, trimmed). */
function normalizeKey(name: string): string {
  return name.toLowerCase().trim();
}

/** Create a company intelligence tracker. */
export function createCompanyTracker(): CompanyTracker {
  const companies = new Map<string, CompanyIntel>();

  function addCompany(intel: CompanyIntel): void {
    companies.set(normalizeKey(intel.name), intel);
  }

  function getCompany(name: string): CompanyIntel | undefined {
    return companies.get(normalizeKey(name));
  }

  function getAllCompanies(): CompanyIntel[] {
    return Array.from(companies.values());
  }

  function addSignal(companyName: string, signal: CompanySignal): void {
    const key = normalizeKey(companyName);
    const intel = companies.get(key);
    if (!intel) {
      // Auto-create a minimal entry for the company.
      const newIntel: CompanyIntel = {
        name: companyName,
        industry: "",
        stage: "",
        recentSignals: [signal],
        knownConnectionIds: [],
      };
      companies.set(key, newIntel);
      return;
    }
    intel.recentSignals.push(signal);
  }

  function getCompaniesWithRecentSignals(daysSince: number): CompanyIntel[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysSince);
    const cutoffStr = cutoff.toISOString();

    const results: CompanyIntel[] = [];

    for (const intel of companies.values()) {
      const hasRecent = intel.recentSignals.some((s) => s.date >= cutoffStr);
      if (hasRecent) {
        results.push(intel);
      }
    }

    return results;
  }

  function linkConnection(companyName: string, connectionId: string): void {
    const key = normalizeKey(companyName);
    const intel = companies.get(key);
    if (!intel) {
      return;
    }

    if (!intel.knownConnectionIds.includes(connectionId)) {
      intel.knownConnectionIds.push(connectionId);
    }
  }

  function toJSON(): SerializedTracker {
    return {
      companies: Array.from(companies.values()),
    };
  }

  function fromJSON(data: SerializedTracker): void {
    companies.clear();
    for (const intel of data.companies) {
      companies.set(normalizeKey(intel.name), intel);
    }
  }

  return {
    addCompany,
    getCompany,
    getAllCompanies,
    addSignal,
    getCompaniesWithRecentSignals,
    linkConnection,
    toJSON,
    fromJSON,
  };
}
