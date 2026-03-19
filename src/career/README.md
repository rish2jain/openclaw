# Career Intelligence Platform

Provides end-to-end career management: profile ingestion, job market scoring, professional network graphing, and outreach automation.

**Persistence:** All persistent data is stored as JSON files under `~/.openclaw/career/`. This is a **single-user design**; the career platform is intended for one operator per OpenClaw instance. For multi-user or high-concurrency use cases, consider migrating to a structured store (e.g. SQLite) in the future.

## Key Exports

- `CareerContext` — aggregated runtime context combining profile, jobs, network, and outreach state
- `getCareerContext()` — loads or initializes the full career context from disk
- Profile types: `UserProfile`, `WorkExperience`, `Skill`
- Job types: `JobListing`, `JobScore`, `ScoredJob`
- Network types: `NetworkGraph`, `NetworkNode`, `NetworkEdge`
- Outreach types: `OutreachPipeline`, `OutreachMessage`, `FollowUpSchedule`

## Structure

### `profile/`

Manages the user's professional identity.

- `store.ts` — reads and writes profile data to `~/.openclaw/career/profile.json`
- `enricher.ts` — augments profile fields with inferred skills and titles
- `ingest-linkedin.ts` — parses LinkedIn export data into a normalized profile
- `ingest-github.ts` — pulls repos, languages, and activity from GitHub
- `ingest-resume.ts` — extracts structured data from resume text
- `infer-skill-category.ts` — maps raw skill strings to canonical categories

### `jobs/`

Job market intelligence and deduplication.

- `scorer.ts` — scores job listings against profile fit using weighted criteria
- `scraper.ts` — scraper orchestrator and result normalizer
- `scrapers/hn.ts`, `scrapers/linkedin.ts`, `scrapers/career-page.ts` — source-specific scrapers
- `dedup.ts` — deduplicates listings across sources by title/company/URL fingerprint
- `store.ts` — persists scored jobs to `~/.openclaw/career/jobs.json`

### `network/`

Professional network graph and relationship tracking.

- `tracker.ts` — builds and maintains the directed graph of contacts and relationships
- `scorer.ts` — computes connection strength scores
- `pathfinder.ts` — finds shortest introduction paths between the user and a target
- `importer.ts` — bulk import of contacts from external sources
- `audit.ts` — identifies stale or weak connections worth re-engaging

### `outreach/`

Automated outreach generation and follow-up scheduling.

- `pipeline.ts` — orchestrates the full outreach lifecycle from draft to sent
- `generator.ts` — generates personalized message drafts given a contact and goal
- `style-learner.ts` — learns the user's writing style from past sent messages
- `followup.ts` — schedules and queues follow-up messages based on non-response windows

### `intel/`

- `company-tracker.ts` — monitors target companies for news, headcount changes, and open roles

### `agent/`

Career coach agent configuration and tooling.

- `mode.ts` — switches between discovery mode (research) and execution mode (action)
- `system-prompt.ts` — constructs the agent system prompt from current career context
- `tools.ts` — registers career-specific tools available to the agent

### `persistence.ts`

Shared read/write helpers for all career JSON stores under `~/.openclaw/career/`.

## Usage

```typescript
import { getCareerContext } from "./career/persistence";

const ctx = await getCareerContext();
console.log(ctx.profile.name, ctx.jobs.scored.length);
```
