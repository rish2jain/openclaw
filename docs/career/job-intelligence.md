# Job Intelligence Guide

The job intelligence system finds, scores, deduplicates, and tracks job listings through your application pipeline.

## How Job Scoring Works

Every listing is scored 0-100 against your profile using four weighted factors:

| Factor              | Weight | What it measures                                                             |
| ------------------- | ------ | ---------------------------------------------------------------------------- |
| Skills overlap      | 40%    | How many of the listing's requirements match your skills                     |
| Seniority alignment | 20%    | Whether the role level matches your experience (10-level hierarchy)          |
| Preference match    | 25%    | Alignment with your work style, industries, company stage, and deal-breakers |
| Company signals     | 15%    | Intelligence signals about the company (growth, funding, culture, layoffs)   |

**Deal-breakers are hard filters.** If a listing matches any of your deal-breakers (e.g., "mandatory RTO"), its preference score drops to zero regardless of other matches.

### Seniority Hierarchy

The scorer uses a 10-level seniority hierarchy to measure alignment:

```
intern → junior → mid → senior → staff → principal → director → vp → c-level → founder
```

Roles more than 2 levels away from your current level receive a reduced seniority score.

## Searching for Jobs

Use natural language to search:

```
"Find senior TypeScript roles"
"Search for remote ML engineer positions in healthtech"
"Show me staff-level opportunities at growth-stage companies"
```

The `job_search` tool supports these filters:

| Filter         | Description                                                  |
| -------------- | ------------------------------------------------------------ |
| `keywords`     | Space-separated search terms (required)                      |
| `location`     | City, region, or "Remote"                                    |
| `remotePolicy` | "remote", "hybrid", or "onsite"                              |
| `minScore`     | Only show listings scored at or above this threshold (0-100) |
| `limit`        | Maximum results (default: 20)                                |

## Job Sources

The platform includes parsers for three job sources out of the box:

### Hacker News Who's Hiring

Parses the monthly "Ask HN: Who is hiring?" threads. Tell the agent: "Check the latest HN hiring thread" or set up a cron job for monthly scraping.

### Company Career Pages

A generic parser that detects common ATS patterns (Lever, Greenhouse, Workday). Provide a career page URL: "Scrape jobs from careers.stripe.com".

### LinkedIn Job Search

Parses LinkedIn job search result pages. Note: this requires providing the page content since LinkedIn requires authentication.

### Adding Custom Sources

The scraper system is pluggable via `registerScraper()`. Each scraper implements a simple interface: take raw input, return an array of parsed job listings.

## Application Pipeline

Every listing has a pipeline status:

```
new → saved → applied → interviewing → offer
                ↘ rejected
                ↘ dismissed
```

Track your progress with natural commands:

```
"Mark the Acme role as applied"
"I got an interview at Stripe, update the status"
"Dismiss the Google listing - not a fit"
"I received an offer from Vercel"
```

### Pipeline Summary

Get an overview anytime:

```
"Show my application pipeline"
"How many active applications do I have?"
```

The `pipeline_summary` tool returns counts by status, average relevance scores, and pending follow-ups.

## Company Intelligence

The company tracker collects signals about companies from various sources:

| Signal Type | Examples                          |
| ----------- | --------------------------------- |
| Funding     | "Series B, $50M"                  |
| Layoffs     | "Laid off 15% in Q3"              |
| Growth      | "Grew engineering 3x this year"   |
| Culture     | "Known for strong remote culture" |
| Product     | "Launched v2 of core product"     |

Signals are appended over time and factor into the company signals component of job scoring (15% weight). The tracker also links companies to people in your network for finding warm introductions.

## Deduplication

When listings are ingested from multiple sources, the deduplication system normalizes company names and titles to identify matches. When duplicates are found, metadata is merged (combining requirements lists, keeping the richest description) and the duplicate is removed.

## Setting Up Automated Searches

Use OpenClaw's cron system to run recurring job searches:

```
"Set up a weekly search for senior TypeScript roles at remote companies"
```

This creates a cron job using the `cron_manage` MCP tool that periodically runs your saved search parameters and notifies you of new matches above your score threshold.
