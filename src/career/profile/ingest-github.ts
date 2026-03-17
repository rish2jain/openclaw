/**
 * GitHub profile parser.
 * Transforms pre-fetched GitHub data into Project and Skill entries.
 * Does NOT make HTTP calls — the caller fetches data and passes it in.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { GitHubProfileData, Project, Skill, SkillCategory } from "./types.js";

const log = createSubsystemLogger("career/profile/ingest-github");

/** Known language-to-category mappings for GitHub languages. */
const LANGUAGE_CATEGORIES: Record<string, SkillCategory> = {
  javascript: "language",
  typescript: "language",
  python: "language",
  java: "language",
  "c++": "language",
  c: "language",
  "c#": "language",
  go: "language",
  rust: "language",
  ruby: "language",
  swift: "language",
  kotlin: "language",
  php: "language",
  scala: "language",
  dart: "language",
  elixir: "language",
  haskell: "language",
  lua: "language",
  perl: "language",
  shell: "language",
  r: "language",
  objective_c: "language",
  "objective-c": "language",
  html: "language",
  css: "language",
  scss: "language",
  sass: "language",
  less: "language",
};

/** Known topic-to-category mappings for GitHub topics. */
const TOPIC_CATEGORIES: Record<string, SkillCategory> = {
  react: "framework",
  angular: "framework",
  vue: "framework",
  svelte: "framework",
  nextjs: "framework",
  django: "framework",
  flask: "framework",
  express: "framework",
  fastapi: "framework",
  spring: "framework",
  rails: "framework",
  laravel: "framework",
  nestjs: "framework",
  gatsby: "framework",
  remix: "framework",
  docker: "tool",
  kubernetes: "tool",
  terraform: "tool",
  ansible: "tool",
  webpack: "tool",
  graphql: "tool",
  grpc: "tool",
  redis: "tool",
  mongodb: "tool",
  postgresql: "tool",
  mysql: "tool",
  elasticsearch: "tool",
  "machine-learning": "domain",
  "deep-learning": "domain",
  "data-science": "domain",
  blockchain: "domain",
  security: "domain",
  devops: "domain",
  "ci-cd": "tool",
  aws: "tool",
  azure: "tool",
  gcp: "tool",
};

export function parseGitHubProfile(data: GitHubProfileData): {
  projects: Project[];
  skills: Skill[];
} {
  log.info(`Parsing GitHub profile for ${data.username} with ${data.repos.length} repos`);

  const projects = mapReposToProjects(data);
  const skills = deriveSkills(data);

  log.info(`Derived ${projects.length} projects and ${skills.length} skills`);
  return { projects, skills };
}

function mapReposToProjects(data: GitHubProfileData): Project[] {
  return data.repos.map((repo) => {
    const techStack: string[] = [];
    if (repo.language) {
      techStack.push(repo.language);
    }
    for (const topic of repo.topics) {
      // Add recognized framework/tool topics to tech stack
      if (topic in TOPIC_CATEGORIES) {
        techStack.push(formatTopicName(topic));
      }
    }

    return {
      name: repo.name,
      description: repo.description ?? "",
      url: repo.url,
      techStack: [...new Set(techStack)],
      role: "Owner",
      impact: repo.stars > 0 ? `${repo.stars} GitHub stars` : undefined,
    };
  });
}

function deriveSkills(data: GitHubProfileData): Skill[] {
  const skillMap = new Map<string, { category: SkillCategory; bytes: number }>();

  // Derive from language byte counts
  const totalBytes = Object.values(data.languages).reduce((a, b) => a + b, 0);

  for (const [lang, bytes] of Object.entries(data.languages)) {
    const normalized = lang.toLowerCase();
    const category = LANGUAGE_CATEGORIES[normalized] ?? "language";
    const existing = skillMap.get(normalized);
    if (existing) {
      existing.bytes += bytes;
    } else {
      skillMap.set(normalized, { category, bytes });
    }
  }

  // Derive from repo topics (aggregate across all repos)
  const topicCounts = new Map<string, number>();
  for (const repo of data.repos) {
    for (const topic of repo.topics) {
      const lower = topic.toLowerCase();
      if (lower in TOPIC_CATEGORIES) {
        topicCounts.set(lower, (topicCounts.get(lower) ?? 0) + 1);
      }
    }
  }

  // Convert language bytes to skills with normalized proficiency
  const skills: Skill[] = [];

  for (const [lang, info] of skillMap) {
    // Normalize to 0-1 based on proportion of total bytes, with a log scale
    // to avoid dominant languages drowning everything else
    const ratio = totalBytes > 0 ? info.bytes / totalBytes : 0;
    const proficiency = Math.min(1, Math.max(0.1, logScale(ratio)));

    skills.push({
      name: formatLanguageName(lang),
      category: info.category,
      proficiency: Math.round(proficiency * 100) / 100,
      sources: ["github"],
    });
  }

  // Convert topic counts to skills
  const maxTopicCount = Math.max(1, ...topicCounts.values());
  for (const [topic, count] of topicCounts) {
    // Skip if already captured as a language
    if (skillMap.has(topic)) {
      continue;
    }

    const proficiency = Math.min(1, Math.max(0.2, count / maxTopicCount));
    skills.push({
      name: formatTopicName(topic),
      category: TOPIC_CATEGORIES[topic] ?? "domain",
      proficiency: Math.round(proficiency * 100) / 100,
      sources: ["github"],
    });
  }

  // Sort by proficiency descending
  skills.sort((a, b) => b.proficiency - a.proficiency);

  return skills;
}

/**
 * Log-scale normalization: maps small ratios to more visible proficiency values.
 * A language with 1% of bytes gets ~0.3 proficiency instead of 0.01.
 */
function logScale(ratio: number): number {
  if (ratio <= 0) {
    return 0;
  }
  // log(ratio) ranges from -inf to 0; we map the practical range [-5, 0] to [0.1, 1]
  const logVal = Math.log10(ratio);
  return Math.max(0, (logVal + 5) / 5);
}

/** Format a GitHub language name with proper casing. */
function formatLanguageName(lang: string): string {
  const caseMap: Record<string, string> = {
    javascript: "JavaScript",
    typescript: "TypeScript",
    "c++": "C++",
    "c#": "C#",
    "objective-c": "Objective-C",
    objective_c: "Objective-C",
    php: "PHP",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    sass: "Sass",
    less: "Less",
    sql: "SQL",
    r: "R",
    go: "Go",
  };
  return caseMap[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1);
}

/** Format a GitHub topic name for display. */
function formatTopicName(topic: string): string {
  const nameMap: Record<string, string> = {
    react: "React",
    angular: "Angular",
    vue: "Vue",
    svelte: "Svelte",
    nextjs: "Next.js",
    django: "Django",
    flask: "Flask",
    express: "Express",
    fastapi: "FastAPI",
    spring: "Spring",
    rails: "Rails",
    laravel: "Laravel",
    nestjs: "NestJS",
    gatsby: "Gatsby",
    remix: "Remix",
    docker: "Docker",
    kubernetes: "Kubernetes",
    terraform: "Terraform",
    ansible: "Ansible",
    webpack: "Webpack",
    graphql: "GraphQL",
    grpc: "gRPC",
    redis: "Redis",
    mongodb: "MongoDB",
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    elasticsearch: "Elasticsearch",
    "machine-learning": "Machine Learning",
    "deep-learning": "Deep Learning",
    "data-science": "Data Science",
    blockchain: "Blockchain",
    security: "Security",
    devops: "DevOps",
    "ci-cd": "CI/CD",
    aws: "AWS",
    azure: "Azure",
    gcp: "GCP",
  };
  return (
    nameMap[topic] ??
    topic
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}
