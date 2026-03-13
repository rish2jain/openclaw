# Career Intelligence Platform - Getting Started

The Career Intelligence Platform turns OpenClaw into a personal career agent that helps you build your professional profile, discover job opportunities, manage your network, and execute a structured job search.

## Prerequisites

- OpenClaw installed and running (`openclaw gateway run`)
- At least one messaging channel configured (any channel works)
- An agent configured with the career system prompt and tools

## Quick Start

### 1. Set Up a Career Agent

Create an agent configuration that includes the career tools. In your OpenClaw config:

```
openclaw config set agents.career.model "claude-sonnet-4-6"
openclaw config set agents.career.systemPrompt "career"
```

The career system prompt automatically adapts based on your profile completeness and current mode (discovery or execution).

### 2. Import Your Profile Data

The career platform accepts data from three sources. Start with whichever you have available:

**LinkedIn data export:**

1. Go to LinkedIn Settings > Data Privacy > Get a copy of your data
2. Request your data (select "Connections", "Profile", "Skills", "Positions")
3. Once downloaded, tell your agent: "Import my LinkedIn data" and share the CSV files

**Resume:**
Tell your agent: "Parse my resume" and paste or attach your resume text. The parser extracts work history, skills, and education from common resume formats.

**GitHub:**
Tell your agent: "Import my GitHub profile for `username`". This pulls your public repos, languages, and topics to populate projects and technical skills.

### 3. Set Your Career Preferences

Once your baseline profile is imported, tell the agent about your goals:

- "I'm looking for senior backend engineering roles"
- "I prefer remote work at growth-stage companies"
- "My deal-breakers are mandatory RTO and no equity"
- "I'm interested in fintech and healthtech"

The agent uses the `career_preferences_set` tool to store these and factor them into job scoring.

### 4. Start Exploring

The agent starts in **Discovery Mode** by default. In this mode, it helps you:

- Understand your strengths and gaps
- Explore role directions
- Analyze the market relative to your profile

Once your profile has work history, target roles, and preferences filled in, the agent will suggest switching to **Execution Mode** for active job searching and applications.

## What You Can Do

| Task                 | Example prompt                               |
| -------------------- | -------------------------------------------- |
| View your profile    | "Show me my career profile"                  |
| Search for jobs      | "Find senior TypeScript roles in fintech"    |
| Review a listing     | "Review the Acme Corp listing"               |
| Track an application | "Mark the Stripe role as applied"            |
| Find warm intros     | "Who can introduce me to someone at Vercel?" |
| Draft outreach       | "Draft a message to reconnect with Alex"     |
| Pipeline overview    | "Show my application pipeline"               |
| Network audit        | "Audit my professional network"              |

## Available Career Skills

Skills are step-by-step guides the agent follows for specific workflows. Invoke them by describing the task:

| Skill              | Trigger                                         |
| ------------------ | ----------------------------------------------- |
| Resume Tailor      | "Tailor my resume for [listing]"                |
| Interview Prep     | "Help me prepare for an interview at [company]" |
| Outreach Draft     | "Draft a networking message to [person]"        |
| Application Review | "Review this job listing for me"                |
| Career Debrief     | "I just finished an interview, let's debrief"   |
| Weekly Standup     | "Give me my weekly career standup"              |
| Network Audit      | "Audit my professional network"                 |
| Profile Gaps       | "What's missing from my profile?"               |

## Next Steps

- [Profile Setup Guide](/career/profile-setup) - Detailed profile building walkthrough
- [Job Intelligence Guide](/career/job-intelligence) - Configure job search and scoring
- [Network Management Guide](/career/network-management) - Build and leverage your network graph
- [Outreach Guide](/career/outreach) - Automated outreach and follow-ups
- [Tools Reference](/career/tools-reference) - All career tools and their parameters
