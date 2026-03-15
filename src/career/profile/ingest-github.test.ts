import { describe, it, expect } from "vitest";
import { parseGitHubProfile } from "./ingest-github.js";
import type { GitHubProfileData } from "./types.js";

function makeGitHubData(overrides: Partial<GitHubProfileData> = {}): GitHubProfileData {
  return {
    username: "octocat",
    repos: [],
    languages: {},
    ...overrides,
  };
}

describe("parseGitHubProfile", () => {
  // == Basic behavior ==

  it("returns empty arrays for a user with no repos and no languages", () => {
    const result = parseGitHubProfile(makeGitHubData());
    expect(result.projects).toEqual([]);
    expect(result.skills).toEqual([]);
  });

  // == Project mapping ==

  describe("project mapping", () => {
    it("maps a repo to a project with correct fields", () => {
      const data = makeGitHubData({
        repos: [
          {
            name: "my-app",
            description: "A web app",
            language: "TypeScript",
            stars: 42,
            url: "https://github.com/octocat/my-app",
            topics: [],
          },
        ],
      });

      const { projects } = parseGitHubProfile(data);
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe("my-app");
      expect(projects[0].description).toBe("A web app");
      expect(projects[0].url).toBe("https://github.com/octocat/my-app");
      expect(projects[0].role).toBe("Owner");
      expect(projects[0].impact).toBe("42 GitHub stars");
      expect(projects[0].techStack).toContain("TypeScript");
    });

    it("handles null description gracefully", () => {
      const data = makeGitHubData({
        repos: [
          {
            name: "no-desc",
            description: null,
            language: "Go",
            stars: 0,
            url: "https://github.com/octocat/no-desc",
            topics: [],
          },
        ],
      });

      const { projects } = parseGitHubProfile(data);
      expect(projects[0].description).toBe("");
    });

    it("sets impact to undefined when stars is 0", () => {
      const data = makeGitHubData({
        repos: [
          {
            name: "zero-stars",
            description: "Test",
            language: null,
            stars: 0,
            url: "https://github.com/octocat/zero-stars",
            topics: [],
          },
        ],
      });

      const { projects } = parseGitHubProfile(data);
      expect(projects[0].impact).toBeUndefined();
    });

    it("includes recognized topics in techStack with proper formatting", () => {
      const data = makeGitHubData({
        repos: [
          {
            name: "full-stack",
            description: "Full stack app",
            language: "TypeScript",
            stars: 10,
            url: "https://github.com/octocat/full-stack",
            topics: ["react", "docker", "nextjs"],
          },
        ],
      });

      const { projects } = parseGitHubProfile(data);
      const stack = projects[0].techStack;
      expect(stack).toContain("TypeScript");
      expect(stack).toContain("React");
      expect(stack).toContain("Docker");
      expect(stack).toContain("Next.js");
    });

    it("deduplicates techStack entries", () => {
      const data = makeGitHubData({
        repos: [
          {
            name: "dupe-stack",
            description: "",
            language: "TypeScript",
            stars: 0,
            url: "",
            // "typescript" topic won't be added since it's not in TOPIC_CATEGORIES,
            // but this tests the Set-based dedup
            topics: ["react", "react"],
          },
        ],
      });

      const { projects } = parseGitHubProfile(data);
      const reactCount = projects[0].techStack.filter((t) => t === "React").length;
      expect(reactCount).toBe(1);
    });

    it("handles null language field", () => {
      const data = makeGitHubData({
        repos: [
          {
            name: "markdown-only",
            description: "Docs",
            language: null,
            stars: 5,
            url: "",
            topics: [],
          },
        ],
      });

      const { projects } = parseGitHubProfile(data);
      expect(projects[0].techStack).toEqual([]);
    });
  });

  // == Skill derivation ==

  describe("skill derivation from languages", () => {
    it("derives skills from language byte counts", () => {
      const data = makeGitHubData({
        languages: { TypeScript: 50000, Python: 30000, Shell: 5000 },
      });

      const { skills } = parseGitHubProfile(data);
      const names = skills.map((s) => s.name);
      expect(names).toContain("TypeScript");
      expect(names).toContain("Python");
      expect(names).toContain("Shell");
    });

    it("assigns higher proficiency to dominant languages", () => {
      const data = makeGitHubData({
        languages: { TypeScript: 90000, Shell: 1000 },
      });

      const { skills } = parseGitHubProfile(data);
      const ts = skills.find((s) => s.name === "TypeScript")!;
      const sh = skills.find((s) => s.name === "Shell")!;
      expect(ts.proficiency).toBeGreaterThan(sh.proficiency);
    });

    it("all language skills have source 'github'", () => {
      const data = makeGitHubData({
        languages: { Python: 10000 },
      });

      const { skills } = parseGitHubProfile(data);
      for (const skill of skills) {
        expect(skill.sources).toContain("github");
      }
    });

    it("proficiency is between 0 and 1 inclusive", () => {
      const data = makeGitHubData({
        languages: {
          JavaScript: 1000000,
          TypeScript: 500000,
          Python: 100,
          Shell: 1,
        },
      });

      const { skills } = parseGitHubProfile(data);
      for (const skill of skills) {
        expect(skill.proficiency).toBeGreaterThanOrEqual(0);
        expect(skill.proficiency).toBeLessThanOrEqual(1);
      }
    });

    it("formats language names with proper casing", () => {
      const data = makeGitHubData({
        languages: { javascript: 1000, "c++": 500, html: 200 },
      });

      const { skills } = parseGitHubProfile(data);
      const names = skills.map((s) => s.name);
      expect(names).toContain("JavaScript");
      expect(names).toContain("C++");
      expect(names).toContain("HTML");
    });

    it("classifies known languages as category 'language'", () => {
      const data = makeGitHubData({
        languages: { typescript: 1000, python: 500 },
      });

      const { skills } = parseGitHubProfile(data);
      for (const skill of skills) {
        expect(skill.category).toBe("language");
      }
    });

    it("sorts skills by proficiency descending", () => {
      const data = makeGitHubData({
        languages: { TypeScript: 100000, Python: 50000, Shell: 1000 },
      });

      const { skills } = parseGitHubProfile(data);
      for (let i = 1; i < skills.length; i++) {
        expect(skills[i - 1].proficiency).toBeGreaterThanOrEqual(skills[i].proficiency);
      }
    });
  });

  // == Skill derivation from topics ==

  describe("skill derivation from topics", () => {
    it("derives skills from repo topics", () => {
      const data = makeGitHubData({
        repos: [
          {
            name: "app1",
            description: "",
            language: "JavaScript",
            stars: 0,
            url: "",
            topics: ["react", "docker"],
          },
          {
            name: "app2",
            description: "",
            language: "Python",
            stars: 0,
            url: "",
            topics: ["docker", "kubernetes"],
          },
        ],
        languages: {},
      });

      const { skills } = parseGitHubProfile(data);
      const names = skills.map((s) => s.name);
      expect(names).toContain("React");
      expect(names).toContain("Docker");
      expect(names).toContain("Kubernetes");
    });

    it("assigns correct categories to topic-derived skills", () => {
      const data = makeGitHubData({
        repos: [
          {
            name: "ml-proj",
            description: "",
            language: null,
            stars: 0,
            url: "",
            topics: ["react", "docker", "machine-learning"],
          },
        ],
      });

      const { skills } = parseGitHubProfile(data);
      const react = skills.find((s) => s.name === "React");
      const docker = skills.find((s) => s.name === "Docker");
      const ml = skills.find((s) => s.name === "Machine Learning");

      expect(react?.category).toBe("framework");
      expect(docker?.category).toBe("tool");
      expect(ml?.category).toBe("domain");
    });

    it("increases proficiency for topics that appear in multiple repos", () => {
      const repos = Array.from({ length: 5 }, (_, i) => ({
        name: `repo-${i}`,
        description: "",
        language: null,
        stars: 0,
        url: "",
        topics: ["docker"],
      }));
      // Add one with react
      repos.push({
        name: "react-app",
        description: "",
        language: null,
        stars: 0,
        url: "",
        topics: ["react"],
      });

      const data = makeGitHubData({ repos });
      const { skills } = parseGitHubProfile(data);

      const docker = skills.find((s) => s.name === "Docker")!;
      const react = skills.find((s) => s.name === "React")!;
      expect(docker.proficiency).toBeGreaterThan(react.proficiency);
    });

    it("topic proficiency is at least 0.2", () => {
      const data = makeGitHubData({
        repos: [
          {
            name: "solo",
            description: "",
            language: null,
            stars: 0,
            url: "",
            topics: ["terraform"],
          },
        ],
      });

      const { skills } = parseGitHubProfile(data);
      const tf = skills.find((s) => s.name === "Terraform")!;
      expect(tf.proficiency).toBeGreaterThanOrEqual(0.2);
    });

    it("ignores unrecognized topics", () => {
      const data = makeGitHubData({
        repos: [
          {
            name: "proj",
            description: "",
            language: null,
            stars: 0,
            url: "",
            topics: ["my-custom-topic", "react"],
          },
        ],
      });

      const { skills } = parseGitHubProfile(data);
      const names = skills.map((s) => s.name);
      expect(names).not.toContain("My Custom Topic");
      expect(names).toContain("React");
    });
  });

  // == Combined language + topic ==

  describe("combined language and topic derivation", () => {
    it("does not duplicate when a topic overlaps with a language key", () => {
      // This tests the `if (skillMap.has(topic)) continue` guard
      const data = makeGitHubData({
        repos: [
          {
            name: "proj",
            description: "",
            language: "Python",
            stars: 0,
            url: "",
            topics: ["python"],
          },
        ],
        languages: { python: 50000 },
      });

      const { skills } = parseGitHubProfile(data);
      // "python" appears in both languages and topics — should not create two skills
      // Note: "python" is not in TOPIC_CATEGORIES so it won't be picked up as a topic skill anyway
      // This is more about the guard working for cases like if typescript were in topics
      const pythonSkills = skills.filter((s) => s.name.toLowerCase() === "python");
      expect(pythonSkills).toHaveLength(1);
    });
  });

  // == Edge cases ==

  describe("edge cases", () => {
    it("handles a single repo with all fields populated", () => {
      const data = makeGitHubData({
        username: "dev",
        repos: [
          {
            name: "big-project",
            description: "My big project description",
            language: "Rust",
            stars: 1234,
            url: "https://github.com/dev/big-project",
            topics: ["docker", "aws", "machine-learning"],
          },
        ],
        languages: { Rust: 80000, Python: 20000 },
      });

      const { projects, skills } = parseGitHubProfile(data);

      expect(projects).toHaveLength(1);
      expect(projects[0].impact).toBe("1234 GitHub stars");

      // Should have language skills + topic skills
      expect(skills.length).toBeGreaterThanOrEqual(4); // Rust, Python + Docker, AWS, ML
    });

    it("handles empty languages object with topic-only repos", () => {
      const data = makeGitHubData({
        repos: [
          {
            name: "infra",
            description: "Infra repo",
            language: null,
            stars: 0,
            url: "",
            topics: ["terraform", "kubernetes"],
          },
        ],
        languages: {},
      });

      const { skills } = parseGitHubProfile(data);
      expect(skills.length).toBe(2);
    });
  });
});
