/**
 * Shared skill category inference — used by resume ingest, LinkedIn ingest,
 * and profile enricher to keep categorization consistent.
 */

import type { SkillCategory } from "./types.js";

/**
 * Infer a skill category from its name using keyword heuristics.
 * Order: language (exact) → framework → tool → soft → domain.
 */
export function inferSkillCategory(name: string): SkillCategory {
  const lower = name.toLowerCase();

  const languages = [
    "javascript",
    "typescript",
    "python",
    "java",
    "c++",
    "c#",
    "ruby",
    "go",
    "rust",
    "swift",
    "kotlin",
    "php",
    "scala",
    "r",
    "sql",
    "html",
    "css",
    "shell",
    "bash",
    "perl",
    "lua",
    "dart",
    "elixir",
    "haskell",
    "objective-c",
    "matlab",
    "groovy",
    "assembly",
  ];
  if (languages.some((l) => lower === l)) {
    return "language";
  }

  const frameworks = [
    "react",
    "angular",
    "vue",
    "django",
    "flask",
    "spring",
    "express",
    "next.js",
    "nuxt",
    "svelte",
    "rails",
    "laravel",
    "fastapi",
    "tensorflow",
    "pytorch",
    "node.js",
    "nest.js",
    "bootstrap",
    "tailwind",
    "jquery",
    ".net",
    "asp.net",
    "ember",
    "gatsby",
    "remix",
  ];
  if (frameworks.some((f) => lower.includes(f))) {
    return "framework";
  }

  const tools = [
    "git",
    "docker",
    "kubernetes",
    "aws",
    "azure",
    "gcp",
    "jenkins",
    "terraform",
    "ansible",
    "webpack",
    "jira",
    "figma",
    "postman",
    "grafana",
    "prometheus",
    "nginx",
    "redis",
    "mongodb",
    "postgresql",
    "mysql",
    "elasticsearch",
    "kafka",
    "rabbitmq",
    "ci/cd",
    "linux",
    "vim",
    "vscode",
  ];
  if (tools.some((t) => lower.includes(t))) {
    return "tool";
  }

  const softSkills = [
    "leadership",
    "communication",
    "teamwork",
    "management",
    "mentoring",
    "agile",
    "scrum",
    "problem solving",
    "project management",
    "strategic planning",
    "negotiation",
    "public speaking",
    "coaching",
    "collaboration",
    "critical thinking",
    "time management",
  ];
  if (softSkills.some((s) => lower.includes(s))) {
    return "soft";
  }

  return "domain";
}
