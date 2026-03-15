import { describe, it, expect } from "vitest";
import { parseHNHiringThread } from "./hn.js";

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a minimal HN comment HTML block at top-level indent (width=0). */
function hnComment(body: string, id?: string): string {
  const idAttr = id ? ` id="${id}"` : "";
  return `<tr class="athing comtr"${idAttr}>
    <td class="default">
      <img width="0" />
      <div class="commtext c00">${body}</div>
    </td>
  </tr>`;
}

/** Build a full page wrapping multiple comments. */
function hnPage(comments: string[]): string {
  return `<html><body>${comments.join("\n")}</body></html>`;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("parseHNHiringThread", () => {
  it("returns empty array for empty HTML", () => {
    expect(parseHNHiringThread("")).toEqual([]);
  });

  it("returns empty for HTML with no comments", () => {
    expect(parseHNHiringThread("<html><body>No comments</body></html>")).toEqual([]);
  });

  it("skips very short comments (< 30 chars)", () => {
    const html = hnPage([hnComment("Too short.")]);
    expect(parseHNHiringThread(html)).toEqual([]);
  });

  it("extracts company from pipe-delimited format", () => {
    const body =
      "Google | Software Engineer | NYC<br>A great opportunity to work on search infrastructure using Python and Go.";
    const html = hnPage([hnComment(body)]);
    const results = parseHNHiringThread(html);
    expect(results[0].company).toBe("Google");
  });

  it("detects remote policy from text", () => {
    const testCases: Array<{ text: string; expected: string }> = [
      {
        text: "Acme | Eng | Fully Remote<br>Description here for the remote role at Acme.",
        expected: "remote",
      },
      {
        text: "Acme | Eng | Hybrid<br>Come into the office three days per week at our downtown location.",
        expected: "hybrid",
      },
      {
        text: "Acme | Eng | On-site only<br>Must work from our San Francisco headquarters every day.",
        expected: "onsite",
      },
      {
        text: "Acme | Eng | NYC<br>Building a great product with a small team in our new office space.",
        expected: "unknown",
      },
    ];

    for (const { text, expected } of testCases) {
      const html = hnPage([hnComment(text)]);
      const results = parseHNHiringThread(html);
      expect(results[0].remotePolicy).toBe(expected);
    }
  });

  it("extracts title from second pipe segment", () => {
    const body =
      "Stripe | Staff Backend Engineer | Remote<br>Detailed description of the engineering role with many responsibilities.";
    const html = hnPage([hnComment(body)]);
    const results = parseHNHiringThread(html);
    expect(results[0].title).toBe("Staff Backend Engineer");
  });

  it("parses multiple comments into multiple listings", () => {
    const comments = [
      hnComment(
        "Company A | Role A | Remote<br>Long description about Company A and their engineering team culture.",
        "100",
      ),
      hnComment(
        "Company B | Role B | NYC<br>Another long description about Company B and their product development.",
        "200",
      ),
    ];
    const html = hnPage(comments);
    const results = parseHNHiringThread(html);
    expect(results).toHaveLength(2);
    expect(results[0].company).toBe("Company A");
    expect(results[1].company).toBe("Company B");
  });

  it("generates stable IDs from company name", () => {
    const body =
      "Acme Corp | Engineer | Remote<br>Building amazing products with cutting edge technology at Acme Corp.";
    const html = hnPage([hnComment(body)]);
    const results = parseHNHiringThread(html);
    expect(results[0].id).toMatch(/^hn-acme-corp-/);
  });

  it("strips HTML tags from comment body", () => {
    const body =
      "<b>Acme Corp</b> | <a href='url'>Senior Engineer</a> | Remote<br>We build <i>amazing</i> products using &amp; TypeScript and more technologies.";
    const html = hnPage([hnComment(body)]);
    const results = parseHNHiringThread(html);
    expect(results[0].company).toBe("Acme Corp");
    expect(results[0].description).not.toContain("<b>");
    expect(results[0].description).not.toContain("<i>");
  });

  it("uses fallback parsing for simplified/cached pages", () => {
    // No tr/td structure, just div.commtext blocks
    const fallbackHtml = `
      <div class="commtext c00">FallbackCo | Engineer | Remote<br>Long description about this job at FallbackCo for qualified candidates.</div>
      <div class="commtext c00">AnotherCo | Dev | NYC<br>Come join our growing engineering team at AnotherCo in downtown NYC.</div>
    `;
    const results = parseHNHiringThread(fallbackHtml);
    expect(results).toHaveLength(2);
    expect(results[0].company).toBe("FallbackCo");
    expect(results[1].company).toBe("AnotherCo");
  });

  it("detects location from pipe segments", () => {
    const body =
      "Acme | Engineer | San Francisco, CA<br>In our downtown office building with a great team of engineers working on cool projects.";
    const html = hnPage([hnComment(body)]);
    const results = parseHNHiringThread(html);
    // The location extractor uses heuristics; it should find "San Francisco, CA"
    // since it matches a city pattern and contains a state abbreviation
    expect(results[0].location).toContain("San Francisco");
  });

  it("skips comments with company name shorter than 2 characters", () => {
    // First pipe segment is just "A" — too short
    const body =
      "A | Engineer | Remote<br>A long enough description for this particular role at our company.";
    const html = hnPage([hnComment(body)]);
    const results = parseHNHiringThread(html);
    expect(results).toHaveLength(0);
  });
});
