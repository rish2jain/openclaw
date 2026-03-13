# Career Tools Reference

Complete reference for all career intelligence tools available to the agent.

## Profile Tools

### career_profile_read

Read the user's full career profile.

| Parameter  | Type   | Required | Description                                                                                                          |
| ---------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `sections` | string | No       | Comma-separated sections: "all", "profile", "work", "skills", "projects", "education", "preferences". Default: "all" |

### career_profile_update

Update a specific profile field.

| Parameter | Type   | Required | Description                                                                                               |
| --------- | ------ | -------- | --------------------------------------------------------------------------------------------------------- |
| `field`   | enum   | Yes      | One of: "name", "headline", "narrative", "targetRoles", "locationPreferences", "compensationExpectations" |
| `value`   | string | Yes      | New value. For array fields, provide JSON-encoded array                                                   |

### career_preferences_set

Update career search preferences. Omitted fields are left unchanged.

| Parameter      | Type   | Required | Description                              |
| -------------- | ------ | -------- | ---------------------------------------- |
| `roleTypes`    | string | No       | JSON array of target role types          |
| `industries`   | string | No       | JSON array of preferred industries       |
| `dealBreakers` | string | No       | JSON array of non-negotiable exclusions  |
| `workStyle`    | enum   | No       | "remote", "hybrid", "onsite", "flexible" |
| `companyStage` | string | No       | JSON array of company stages             |

## Job Tools

### job_search

Search for job listings matching criteria.

| Parameter      | Type   | Required | Description                                 |
| -------------- | ------ | -------- | ------------------------------------------- |
| `keywords`     | string | Yes      | Space-separated search keywords             |
| `location`     | string | No       | Location filter                             |
| `remotePolicy` | enum   | No       | "remote", "hybrid", "onsite"                |
| `minScore`     | string | No       | Minimum relevance score (0-100). Default: 0 |
| `limit`        | string | No       | Maximum results. Default: 20                |

### job_review

Get detailed listing information with score breakdown.

| Parameter   | Type   | Required | Description        |
| ----------- | ------ | -------- | ------------------ |
| `listingId` | string | Yes      | The job listing ID |

### job_status_update

Update the pipeline status of a listing.

| Parameter   | Type   | Required | Description                                                          |
| ----------- | ------ | -------- | -------------------------------------------------------------------- |
| `listingId` | string | Yes      | The job listing ID                                                   |
| `status`    | enum   | Yes      | "saved", "applied", "rejected", "interviewing", "offer", "dismissed" |
| `note`      | string | No       | Optional note                                                        |

## Network Tools

### network_lookup

Search contacts by company, title, or tags.

| Parameter       | Type   | Required | Description                    |
| --------------- | ------ | -------- | ------------------------------ |
| `company`       | string | No       | Filter by current company      |
| `titleKeywords` | string | No       | Space-separated title keywords |
| `tags`          | string | No       | Comma-separated tags           |
| `limit`         | string | No       | Maximum results. Default: 10   |

### network_intro_path

Find warm introduction paths to a target.

| Parameter        | Type   | Required | Description                                                |
| ---------------- | ------ | -------- | ---------------------------------------------------------- |
| `targetCompany`  | string | No       | Company to find a path to (provide this or targetPersonId) |
| `targetPersonId` | string | No       | Person ID to reach (provide this or targetCompany)         |
| `maxHops`        | string | No       | Maximum intermediary hops. Default: 3                      |

## Outreach Tools

### outreach_draft

Draft a personalized outreach message.

| Parameter         | Type   | Required | Description                                                                                                      |
| ----------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `personId`        | string | Yes      | Recipient person ID                                                                                              |
| `purpose`         | enum   | Yes      | "reconnect", "informational_interview", "referral_request", "introduction_request", "congratulations", "general" |
| `targetListingId` | string | No       | Related job listing ID                                                                                           |
| `channel`         | enum   | No       | "linkedin", "email", "slack", "other"                                                                            |

## Pipeline Tools

### pipeline_summary

Get application pipeline overview.

| Parameter        | Type   | Required | Description                                           |
| ---------------- | ------ | -------- | ----------------------------------------------------- |
| `includeDetails` | string | No       | "true" to include per-listing details. Default: false |

## Career Skills

Skills are agent-executed workflows invoked by describing the task:

| Skill              | File                                  | Purpose                                   |
| ------------------ | ------------------------------------- | ----------------------------------------- |
| Resume Tailor      | `skills/career/resume-tailor.md`      | Customize resume for a specific listing   |
| Interview Prep     | `skills/career/interview-prep.md`     | STAR-format behavioral + technical prep   |
| Outreach Draft     | `skills/career/outreach-draft.md`     | Personalized networking messages          |
| Application Review | `skills/career/application-review.md` | Listing fit analysis with match scoring   |
| Career Debrief     | `skills/career/career-debrief.md`     | Post-interview reflection and improvement |
| Weekly Standup     | `skills/career/weekly-standup.md`     | Pipeline summary with action priorities   |
| Network Audit      | `skills/career/network-audit.md`      | Network distribution and gap analysis     |
| Profile Gaps       | `skills/career/profile-gaps.md`       | Profile completeness check                |

## Agent Modes

The career agent operates in two modes:

### Discovery Mode (default)

Focus: understanding goals, exploring options, analyzing the market.

Active behaviors:

- Probing questions about strengths and gaps
- Market analysis relative to profile
- Helping narrow direction before taking action

### Execution Mode

Focus: concrete action on job search and applications.

Active behaviors:

- Reviewing and scoring listings
- Tailoring application materials
- Tracking pipeline progress
- Suggesting next steps based on pipeline state

**Automatic switching:** The agent suggests Execution mode once your profile has work history, target roles, and preferences set. It suggests switching back to Discovery if those foundations are removed.
