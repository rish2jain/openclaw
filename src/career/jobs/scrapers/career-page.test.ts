import { describe, it, expect } from "vitest";
import { parseCareerPage } from "./career-page.js";

// ── Tests ────────────────────────────────────────────────────────────

describe("parseCareerPage", () => {
  it("returns empty array for empty HTML", () => {
    expect(parseCareerPage("", "Acme", "https://acme.com")).toEqual([]);
  });

  it("returns empty when no job-like links exist", () => {
    const html = `<html><body><a href="/about">About Us</a></body></html>`;
    expect(parseCareerPage(html, "Acme", "https://acme.com")).toEqual([]);
  });

  it("extracts job listings from Lever-style job URLs", () => {
    const html = `<html><body>
      <a href="/jobs/abc-123">Senior Software Engineer</a>
    </body></html>`;
    const results = parseCareerPage(html, "Acme", "https://acme.com");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Senior Software Engineer");
    expect(results[0].company).toBe("Acme");
    expect(results[0].source).toBe("company_page");
    expect(results[0].sourceUrl).toBe("https://acme.com/jobs/abc-123");
  });

  it("extracts from /positions/, /openings/, /careers/, /apply/ URLs", () => {
    const urlPaths = ["/positions/123", "/openings/456", "/careers/789", "/apply/abc"];
    for (const path of urlPaths) {
      const html = `<html><body><a href="${path}">Software Developer</a></body></html>`;
      const results = parseCareerPage(html, "Acme", "https://acme.com");
      expect(results.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("detects job titles by keyword matching", () => {
    const html = `<html><body>
      <a href="/role/1">Senior Software Engineer</a>
      <a href="/team/about">Meet Our Team</a>
    </body></html>`;
    const results = parseCareerPage(html, "Test Co", "https://test.co");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Senior Software Engineer");
  });

  it("resolves relative URLs against base URL", () => {
    const html = `<html><body><a href="/jobs/123">Frontend Developer</a></body></html>`;
    const results = parseCareerPage(html, "Acme", "https://acme.com");
    expect(results[0].sourceUrl).toBe("https://acme.com/jobs/123");
  });

  it("resolves protocol-relative URLs", () => {
    const html = `<html><body><a href="//careers.acme.com/jobs/123">Backend Engineer</a></body></html>`;
    const results = parseCareerPage(html, "Acme", "https://acme.com");
    expect(results[0].sourceUrl).toBe("https://careers.acme.com/jobs/123");
  });

  it("leaves absolute URLs unchanged", () => {
    const html = `<html><body><a href="https://other.com/jobs/1">Data Engineer</a></body></html>`;
    const results = parseCareerPage(html, "Acme", "https://acme.com");
    expect(results[0].sourceUrl).toBe("https://other.com/jobs/1");
  });

  it("deduplicates listings with the same URL", () => {
    const html = `<html><body>
      <a href="/jobs/123">Software Engineer</a>
      <a href="/jobs/123">Software Engineer</a>
    </body></html>`;
    const results = parseCareerPage(html, "Acme", "https://acme.com");
    expect(results).toHaveLength(1);
  });

  it("skips link text shorter than 5 characters", () => {
    const html = `<html><body><a href="/jobs/1">Dev</a></body></html>`;
    const results = parseCareerPage(html, "Acme", "https://acme.com");
    expect(results).toHaveLength(0);
  });

  it("skips link text longer than 150 characters", () => {
    const longText = "A".repeat(151);
    const html = `<html><body><a href="/jobs/1">${longText}</a></body></html>`;
    const results = parseCareerPage(html, "Acme", "https://acme.com");
    expect(results).toHaveLength(0);
  });

  it("detects remote policy from link text and location", () => {
    const html = `<html><body>
      <a href="/jobs/1">Senior Engineer (Remote)</a>
    </body></html>`;
    const results = parseCareerPage(html, "Acme", "https://acme.com");
    expect(results[0].remotePolicy).toBe("remote");
  });

  it("generates stable IDs from company and title", () => {
    const html = `<html><body><a href="/jobs/1">Product Manager</a></body></html>`;
    const results = parseCareerPage(html, "Acme", "https://acme.com");
    expect(results[0].id).toMatch(/^cp-/);
    expect(results[0].id).toContain("acme");
  });

  it("extracts department from preceding heading", () => {
    const html = `<html><body>
      <h2>Engineering</h2>
      <a href="/jobs/1">Senior Software Engineer</a>
    </body></html>`;
    const results = parseCareerPage(html, "Acme", "https://acme.com");
    expect(results[0].description).toContain("Engineering");
  });

  it("extracts nearby location from text after the link", () => {
    const html = `<html><body>
      <a href="/jobs/1">Senior Software Engineer</a>
      <span>San Francisco, CA</span>
    </body></html>`;
    const results = parseCareerPage(html, "Acme", "https://acme.com");
    expect(results[0].location).toContain("San Francisco");
  });

  it("sets all listings to 'new' status with zero relevance score", () => {
    const html = `<html><body><a href="/jobs/1">Data Scientist</a></body></html>`;
    const results = parseCareerPage(html, "Acme", "https://acme.com");
    expect(results[0].status).toBe("new");
    expect(results[0].relevanceScore).toBe(0);
    expect(results[0].requirements).toEqual([]);
  });
});
