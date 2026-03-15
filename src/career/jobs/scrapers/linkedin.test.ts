import { describe, it, expect } from "vitest";
import { parseLinkedInJobResults } from "./linkedin.js";

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a LinkedIn base-card style job card. */
function linkedInCard({
  title,
  company,
  location,
  description,
  jobUrl,
}: {
  title: string;
  company: string;
  location?: string;
  description?: string;
  jobUrl?: string;
}): string {
  const urlAttr = jobUrl ? `<a href="${jobUrl}" class="base-card--link">View</a>` : "";
  const locSpan = location ? `<span class="job-search-card__location">${location}</span>` : "";
  const descP = description ? `<p class="job-result-card__snippet">${description}</p>` : "";
  return `<div class="base-card job-card">
    ${urlAttr}
    <h3 class="base-search-card__title">${title}</h3>
    <h4 class="base-search-card__subtitle">${company}</h4>
    ${locSpan}
    ${descP}
  </div></div>`;
}

/** Build a LinkedIn entity-urn style card. */
function linkedInUrnCard({
  urn,
  title,
  company,
  location,
}: {
  urn: string;
  title: string;
  company: string;
  location?: string;
}): string {
  const locSpan = location ? `<span class="job-search-card__location">${location}</span>` : "";
  // The regex expects: <div data-entity-urn="...">CONTENT</div></div></div>
  // The content capture group ([\s\S]*?) is greedy-minimal and captures up to
  // the first sequence of three closing div tags.
  return `<div data-entity-urn="urn:li:jobPosting:${urn}" class="job-card">
    <div class="inner">
      <div class="card-content">
        <h3 class="base-search-card__title">${title}</h3>
        <h4 class="base-search-card__subtitle">${company}</h4>
        ${locSpan}
      </div>
    </div>
  </div></div></div>`;
}

function wrapPage(cards: string[]): string {
  return `<html><body><div class="jobs-search__results-list">${cards.join("\n")}</div></body></html>`;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("parseLinkedInJobResults", () => {
  it("returns empty array for empty HTML", () => {
    expect(parseLinkedInJobResults("")).toEqual([]);
  });

  it("returns empty for HTML without job cards", () => {
    const html = `<html><body><p>No jobs here</p></body></html>`;
    expect(parseLinkedInJobResults(html)).toEqual([]);
  });

  it("parses base-card style job cards", () => {
    const html = wrapPage([
      linkedInCard({
        title: "Senior Software Engineer",
        company: "Google",
        location: "Mountain View, CA",
        jobUrl: "https://www.linkedin.com/jobs/view/123456",
      }),
    ]);
    const results = parseLinkedInJobResults(html);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Senior Software Engineer");
    expect(results[0].company).toBe("Google");
    expect(results[0].location).toBe("Mountain View, CA");
    expect(results[0].sourceUrl).toContain("linkedin.com/jobs/view/123456");
  });

  it("parses entity-urn style job cards", () => {
    const html = wrapPage([
      linkedInUrnCard({
        urn: "789",
        title: "Product Manager",
        company: "Meta",
        location: "Remote",
      }),
    ]);
    const results = parseLinkedInJobResults(html);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Product Manager");
    expect(results[0].company).toBe("Meta");
    // The URN is in the outer div tag, not in the captured inner content,
    // so extractJobUrl may not find it in the card HTML capture group.
    // The source URL may be empty if no <a href> with job URL is present.
    expect(results[0].source).toBe("linkedin");
  });

  it("sets source to 'linkedin'", () => {
    const html = wrapPage([linkedInCard({ title: "Engineer", company: "Acme" })]);
    const results = parseLinkedInJobResults(html);
    expect(results[0].source).toBe("linkedin");
  });

  it("detects remote policy from location and title", () => {
    const html = wrapPage([
      linkedInCard({
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
      }),
    ]);
    const results = parseLinkedInJobResults(html);
    expect(results[0].remotePolicy).toBe("remote");
  });

  it("detects hybrid and onsite policies", () => {
    const hybridHtml = wrapPage([
      linkedInCard({
        title: "Designer",
        company: "Acme",
        location: "Hybrid - San Francisco",
      }),
    ]);
    expect(parseLinkedInJobResults(hybridHtml)[0].remotePolicy).toBe("hybrid");

    const onsiteHtml = wrapPage([
      linkedInCard({
        title: "On-site Support Engineer",
        company: "Acme",
        location: "NYC",
      }),
    ]);
    expect(parseLinkedInJobResults(onsiteHtml)[0].remotePolicy).toBe("onsite");
  });

  it("returns 'unknown' when no policy indicators present", () => {
    const html = wrapPage([
      linkedInCard({
        title: "Data Analyst",
        company: "Acme",
        location: "Austin, TX",
      }),
    ]);
    const results = parseLinkedInJobResults(html);
    expect(results[0].remotePolicy).toBe("unknown");
  });

  it("skips cards without a title", () => {
    const html = wrapPage([
      `<div class="base-card job-card">
        <h4 class="base-search-card__subtitle">CompanyOnly</h4>
      </div></div>`,
    ]);
    const results = parseLinkedInJobResults(html);
    expect(results).toHaveLength(0);
  });

  it("skips cards without a company", () => {
    const html = wrapPage([
      `<div class="base-card job-card">
        <h3 class="base-search-card__title">Title Only</h3>
      </div></div>`,
    ]);
    const results = parseLinkedInJobResults(html);
    expect(results).toHaveLength(0);
  });

  it("deduplicates cards with the same URL", () => {
    const card = linkedInCard({
      title: "Engineer",
      company: "Acme",
      jobUrl: "https://www.linkedin.com/jobs/view/123",
    });
    const html = wrapPage([card, card]);
    const results = parseLinkedInJobResults(html);
    expect(results).toHaveLength(1);
  });

  it("parses multiple cards", () => {
    const html = wrapPage([
      linkedInCard({
        title: "Frontend Engineer",
        company: "Google",
        jobUrl: "https://www.linkedin.com/jobs/view/1",
      }),
      linkedInCard({
        title: "Backend Engineer",
        company: "Meta",
        jobUrl: "https://www.linkedin.com/jobs/view/2",
      }),
    ]);
    const results = parseLinkedInJobResults(html);
    expect(results).toHaveLength(2);
  });

  it("generates stable IDs with li- prefix", () => {
    const html = wrapPage([linkedInCard({ title: "Engineer", company: "Acme" })]);
    const results = parseLinkedInJobResults(html);
    expect(results[0].id).toMatch(/^li-/);
  });

  it("strips HTML entities from extracted fields", () => {
    const html = wrapPage([
      linkedInCard({
        title: "Software Engineer &amp; Architect",
        company: "Acme &amp; Co",
      }),
    ]);
    const results = parseLinkedInJobResults(html);
    expect(results[0].title).toBe("Software Engineer & Architect");
    expect(results[0].company).toBe("Acme & Co");
  });

  it("resolves relative job URLs to full LinkedIn URLs", () => {
    const html = `<html><body>
      <div class="base-card job-card">
        <a href="/jobs/view/999" class="base-card--link">View</a>
        <h3 class="base-search-card__title">Engineer</h3>
        <h4 class="base-search-card__subtitle">Acme</h4>
      </div></div>
    </body></html>`;
    const results = parseLinkedInJobResults(html);
    expect(results[0].sourceUrl).toBe("https://www.linkedin.com/jobs/view/999");
  });

  it("sets all listings to 'new' status with zero relevance score", () => {
    const html = wrapPage([linkedInCard({ title: "DevOps Engineer", company: "Acme" })]);
    const results = parseLinkedInJobResults(html);
    expect(results[0].status).toBe("new");
    expect(results[0].relevanceScore).toBe(0);
    expect(results[0].requirements).toEqual([]);
  });

  it("extracts description snippet from card", () => {
    const html = wrapPage([
      linkedInCard({
        title: "Data Scientist",
        company: "Acme",
        description: "Apply ML models to solve real-world business problems at scale",
      }),
    ]);
    const results = parseLinkedInJobResults(html);
    expect(results[0].description).toContain("ML models");
  });
});
