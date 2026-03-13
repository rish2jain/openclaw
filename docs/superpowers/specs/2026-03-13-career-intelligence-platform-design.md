# Career Intelligence Platform Design

**Date:** 2026-03-13
**Scope:** New `src/career/` subsystem + career agent + skills

## Overview

A career intelligence platform built into OpenClaw that helps the user discover career direction, find and score job opportunities, leverage their professional network, and execute targeted outreach. Five sub-projects that compose into a persistent career co-pilot.

## Sub-Project 1: Professional Profile Builder

**New directory:** `src/career/profile/`

Foundation layer. Ingests existing assets (LinkedIn export, resume, GitHub) and builds a structured, living representation of the user's professional identity.

### Data Model

```typescript
type CareerProfile = {
  name: string;
  headline: string;
  narrative: string; // free-form career summary
  targetRoles: string[];
  locationPreferences: string[];
  compensationExpectations?: string;
  updatedAt: number;
};

type WorkEntry = {
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
  description: string;
  skills: string[];
  achievements: string[];
};

type Skill = {
  name: string;
  category: "language" | "framework" | "domain" | "soft" | "tool";
  proficiency: number; // 0.0-1.0, derived from signals
  lastUsed?: string;
  sources: string[]; // where this was observed: "resume", "github", "linkedin", "self-report"
};

type Project = {
  name: string;
  description: string;
  url?: string;
  techStack: string[];
  role: string;
  impact?: string;
};

type Education = {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate?: string;
};

type CareerPreferences = {
  roleTypes: string[]; // exploring
  industries: string[];
  dealBreakers: string[];
  workStyle: "remote" | "hybrid" | "onsite" | "flexible";
  companyStage: string[]; // "startup", "growth", "enterprise"
  updatedAt: number;
};
```

### Ingestion Pipeline

1. **LinkedIn data export** — parse ZIP containing Connections.csv, Profile.csv, Positions.csv, Skills.csv. Connections feed into Network Graph (Sub-Project 4).
2. **Resume** — extract text from PDF, use LLM to map to WorkEntry[], Skill[], Education[] structures.
3. **GitHub** — fetch via REST API: repos (name, description, language, stars), contribution graph, README content for pinned/top repos. Derive Skill proficiency from commit frequency per language.
4. **Conversation** — career agent interviews user to fill CareerPreferences and gaps in profile.

### Files

- `src/career/profile/types.ts` — all type definitions
- `src/career/profile/store.ts` — CRUD operations for profile data in agent memory
- `src/career/profile/ingest-linkedin.ts` — LinkedIn CSV/ZIP parser
- `src/career/profile/ingest-resume.ts` — PDF text extraction + LLM structuring
- `src/career/profile/ingest-github.ts` — GitHub API fetcher + skill derivation
- `src/career/profile/enricher.ts` — conversational enrichment (detects profile updates from chat)

## Sub-Project 2: Job Market Intelligence

**New directory:** `src/career/jobs/`

Monitors job boards, scores opportunities against the user's profile, and maintains a ranked pipeline.

### Job Sources (browser automation)

- LinkedIn job search (logged-in browser session)
- Company career pages (user-provided target list)
- HN Who's Hiring threads (monthly)
- Wellfound/AngelList
- Greenhouse/Lever/Ashby public board pages

### Scoring Model

| Factor              | Weight | Signal                                                         |
| ------------------- | ------ | -------------------------------------------------------------- |
| Skills overlap      | 40%    | Profile skills vs job requirements, weighted by proficiency    |
| Seniority alignment | 20%    | Title/level matching against work history                      |
| Preference match    | 25%    | Location, remote, company stage, industry vs CareerPreferences |
| Company signals     | 15%    | Recent funding, growth, known connections                      |

Produces a 0-100 relevance score per listing.

### Data Model

```typescript
type JobListing = {
  id: string;
  title: string;
  company: string;
  location: string;
  remotePolicy: "remote" | "hybrid" | "onsite" | "unknown";
  description: string;
  requirements: string[];
  sourceUrl: string;
  source: string; // "linkedin", "hn", "company_page", etc.
  postedDate?: string;
  relevanceScore: number;
  scoreBreakdown: Record<string, number>;
  status: "new" | "saved" | "applied" | "rejected" | "interviewing" | "offer" | "dismissed";
  appliedDate?: string;
  notes: string[];
};

type CompanyIntel = {
  name: string;
  industry: string;
  stage: string;
  size?: string;
  recentSignals: CompanySignal[];
  careerPageUrl?: string;
  knownConnectionIds: string[]; // links to Network Graph
};

type CompanySignal = {
  type: "funding" | "layoff" | "hiring_surge" | "leadership_change" | "acquisition" | "news";
  summary: string;
  date: string;
  sourceUrl?: string;
};

type JobSearch = {
  id: string;
  keywords: string[];
  locations: string[];
  filters: Record<string, string>;
  sources: string[];
  cronSchedule: string; // e.g., "0 */6 * * *"
  enabled: boolean;
};
```

### Notification Flow

- Cron fires scraper on schedule
- New listings scored against profile
- Score > 70: notify via preferred channel ("3 new high-match roles found")
- Score <= 70: accumulate silently, surface when user asks

### Files

- `src/career/jobs/types.ts` — all type definitions
- `src/career/jobs/store.ts` — listing CRUD, search config management
- `src/career/jobs/scraper.ts` — browser-based job board scraping orchestrator
- `src/career/jobs/scrapers/linkedin.ts` — LinkedIn-specific scraper
- `src/career/jobs/scrapers/hn.ts` — HN Who's Hiring parser
- `src/career/jobs/scrapers/career-page.ts` — generic career page scraper
- `src/career/jobs/scorer.ts` — relevance scoring engine
- `src/career/jobs/dedup.ts` — cross-source deduplication
- `src/career/intel/company-tracker.ts` — company signal monitoring
- `src/career/intel/types.ts` — CompanyIntel, CompanySignal types

## Sub-Project 3: Career Coach Agent

A specialized OpenClaw agent with career-specific system prompt, tools, and skills.

### Agent Configuration

- Dedicated agent entry in OpenClaw's agent config
- Custom system prompt (`CAREER_AGENT.md`) with: identity, behavioral guidelines, mode-switching logic
- System prompt injects: CareerProfile summary, active CareerPreferences, pipeline stats
- Available tools: profile read/update, job search/score, outreach draft, network lookup, browser, web search

### Operating Modes

**Discovery mode** (early phase):

- Interviews user about career goals, values, non-negotiables
- Analyzes profile strengths and gaps
- Suggests role archetypes matching profile + preferences
- Helps articulate career narrative
- Recommends skills to develop based on market demand

**Execution mode** (direction clear):

- Reviews listings and recommends apply/skip with reasoning
- Tailors resume per application
- Drafts cover letters and outreach
- Prepares interview talking points
- Tracks pipeline status
- Post-interview debrief and refinement

### Career Skills (SKILL.md files)

- `resume-tailor` — rewrite resume for a specific listing
- `interview-prep` — generate likely questions + talking points
- `outreach-draft` — draft personalized networking messages
- `application-review` — review listing, recommend apply/skip
- `career-debrief` — structured reflection after interviews
- `weekly-standup` — pipeline summary, new matches, pending follow-ups
- `network-audit` — analyze connection distribution and gaps
- `profile-gaps` — identify weak spots in professional profile

### Files

- `src/career/agent/system-prompt.ts` — builds dynamic CAREER_AGENT.md
- `src/career/agent/tools.ts` — career-specific tool definitions
- `src/career/agent/mode.ts` — discovery/execution mode logic
- `skills/career/resume-tailor.md`
- `skills/career/interview-prep.md`
- `skills/career/outreach-draft.md`
- `skills/career/application-review.md`
- `skills/career/career-debrief.md`
- `skills/career/weekly-standup.md`
- `skills/career/network-audit.md`
- `skills/career/profile-gaps.md`

## Sub-Project 4: Professional Network Graph

**New directory:** `src/career/network/`

Maps relationships, scores connection strength, and finds warm intro paths.

### Relationship Scoring

`connectionStrength` (0.0-1.0) based on:

- Recency of interaction (decays over time)
- Frequency of contact
- Depth (DM vs group, substantive vs casual)
- Shared history (same company, same school)
- Manual boost (user tags as "strong" or "mentor")

### Network Audit

Generates a report covering:

- Total connections, distribution by industry/company/seniority
- Cluster analysis: where connections are concentrated vs gaps
- Bridge connections: people linking you to otherwise unreachable industries/companies
- Stale high-value connections: people at target companies not contacted in 6+ months

### Warm Intro Pathfinding

Given a target company or person:

1. BFS through entity graph to find all paths (max 3 hops)
2. Rank paths by minimum connection strength along the path
3. Suggest approach strategy with context

### Data Model

Extends existing entity graph:

- `person` entities — name, company, title, LinkedIn URL, email, tags
- Relationship edges: `knows`, `worked_with`, `studied_with`
- Edge weights: `connectionStrength`, `lastInteraction` timestamp
- Company-to-person edges link to CompanyIntel

### Files

- `src/career/network/types.ts` — network-specific types
- `src/career/network/importer.ts` — LinkedIn Connections.csv parser
- `src/career/network/scorer.ts` — relationship strength calculator
- `src/career/network/pathfinder.ts` — warm intro BFS pathfinding
- `src/career/network/audit.ts` — network analysis and report generation
- `src/career/network/tracker.ts` — interaction logging and decay

## Sub-Project 5: Outreach Automation

**New directory:** `src/career/outreach/`

Drafts, manages approval for, sends, and tracks networking/application messages.

### Message Types

- **Warm intro request** — ask connection to introduce you
- **Cold outreach** — direct contact to hiring manager/recruiter
- **Application follow-up** — nudge after applying
- **Reconnection** — re-engage stale connection genuinely
- **Thank you / debrief** — post-interview follow-ups

### Hard Rule

**Never sends without user approval.** Always presents draft, waits for confirm/edit/discard.

### Personalization Engine

Every message generated fresh from:

- User's CareerProfile
- Recipient's entity graph data
- Specific opportunity context (if job-related)
- User's communication style (learned from edits over time)

Style adaptation: tracks user edits to drafts, adjusts tone/length/formality over time.

### Pipeline Tracking

```typescript
type OutreachRecord = {
  id: string;
  recipientId: string; // entity graph person ID
  channel: string;
  messageType: "warm_intro" | "cold_outreach" | "follow_up" | "reconnection" | "thank_you";
  content: string;
  status: "draft" | "approved" | "sent" | "replied" | "no_response";
  sentAt?: number;
  followUpDate?: number;
  relatedJobId?: string; // links to JobListing
  notes: string[];
};
```

### Files

- `src/career/outreach/types.ts` — OutreachRecord and related types
- `src/career/outreach/generator.ts` — message drafting engine
- `src/career/outreach/pipeline.ts` — outreach tracking and status management
- `src/career/outreach/followup.ts` — follow-up scheduling via cron
- `src/career/outreach/style-learner.ts` — tracks edits, adapts tone over time

## Implementation Order

1. **Profile Builder** (foundation — everything depends on it)
2. **Network Graph** + **Job Intelligence** (parallel — independent of each other)
3. **Career Coach Agent** (wires profile, jobs, and network together)
4. **Outreach Automation** (depends on all of the above)

## Testing Strategy

- Unit tests for all parsers (LinkedIn CSV, resume PDF, GitHub API responses)
- Unit tests for scoring engines (job relevance, connection strength)
- Unit tests for pathfinder (graph traversal with mock entity data)
- Integration test for ingestion pipeline (mock data → structured profile)
- Integration test for career agent (mock tools, verify mode switching)
- Outreach generator tests with mock profile + recipient data

## Files Created Summary

**New files (30+):**

_Profile:_

- `src/career/profile/types.ts`
- `src/career/profile/store.ts`
- `src/career/profile/ingest-linkedin.ts`
- `src/career/profile/ingest-resume.ts`
- `src/career/profile/ingest-github.ts`
- `src/career/profile/enricher.ts`

_Jobs:_

- `src/career/jobs/types.ts`
- `src/career/jobs/store.ts`
- `src/career/jobs/scraper.ts`
- `src/career/jobs/scrapers/linkedin.ts`
- `src/career/jobs/scrapers/hn.ts`
- `src/career/jobs/scrapers/career-page.ts`
- `src/career/jobs/scorer.ts`
- `src/career/jobs/dedup.ts`
- `src/career/intel/company-tracker.ts`
- `src/career/intel/types.ts`

_Agent:_

- `src/career/agent/system-prompt.ts`
- `src/career/agent/tools.ts`
- `src/career/agent/mode.ts`

_Network:_

- `src/career/network/types.ts`
- `src/career/network/importer.ts`
- `src/career/network/scorer.ts`
- `src/career/network/pathfinder.ts`
- `src/career/network/audit.ts`
- `src/career/network/tracker.ts`

_Outreach:_

- `src/career/outreach/types.ts`
- `src/career/outreach/generator.ts`
- `src/career/outreach/pipeline.ts`
- `src/career/outreach/followup.ts`
- `src/career/outreach/style-learner.ts`

_Skills (8):_

- `skills/career/resume-tailor.md`
- `skills/career/interview-prep.md`
- `skills/career/outreach-draft.md`
- `skills/career/application-review.md`
- `skills/career/career-debrief.md`
- `skills/career/weekly-standup.md`
- `skills/career/network-audit.md`
- `skills/career/profile-gaps.md`
