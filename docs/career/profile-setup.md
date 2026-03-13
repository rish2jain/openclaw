# Profile Setup Guide

Your career profile is the foundation of the intelligence platform. Job scoring, network recommendations, and outreach all reference your profile data.

## Profile Sections

| Section          | What it stores                                                   | How it's used                            |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| **Profile**      | Name, headline, narrative, target roles, location, compensation  | System prompt context, job scoring       |
| **Work History** | Companies, titles, dates, descriptions, achievements             | Skills overlap scoring, resume tailoring |
| **Skills**       | Name, category, proficiency (0-1), sources                       | Job matching (40% of score)              |
| **Projects**     | Name, description, tech stack, role, impact                      | Portfolio evidence, skill validation     |
| **Education**    | Institution, degree, field, dates                                | Profile completeness                     |
| **Preferences**  | Role types, industries, deal-breakers, work style, company stage | Job filtering (25% of score)             |

## Importing Data

### LinkedIn Export

LinkedIn provides CSV files for different data categories. The career platform parses:

- **Positions.csv** - Extracts work history entries (company, title, dates, description)
- **Skills.csv** - Populates your skill list with LinkedIn-endorsed skills
- **Profile.csv** - Sets your name, headline, and summary narrative
- **Connections.csv** - Imports your network (see [Network Management](/career/network-management))

To import, share the CSV content with your career agent. It handles parsing and deduplication automatically.

### Resume Text

Paste your resume text and ask the agent to parse it. The parser detects sections by heading patterns:

- Work experience sections: "Experience", "Work History", "Employment"
- Skills sections: "Skills", "Technical Skills", "Technologies"
- Education sections: "Education", "Academic Background"
- Summary sections: "Summary", "Profile", "About"

**Supported formats:** Plain text or copied from PDF. The parser uses heading and bullet-point patterns, not file format detection.

### GitHub Profile

Provide your GitHub username. The import extracts:

- **Public repos** become project entries (name, description, URL)
- **Language bytes** are converted to skill proficiency using a log-scale formula
- **Repo topics** are added as domain/framework skills
- **Star count** factors into project prominence

### Conversational Updates

The profile enricher detects profile-relevant statements in conversation and suggests updates. For example:

- "I just got promoted to Staff Engineer" triggers a work history update suggestion
- "I'm switching focus to ML infrastructure" triggers a target role update
- "I led a team of 8 on the payments migration" adds an achievement

The agent asks for confirmation before applying detected updates.

## Skill Categories

Skills are classified into five categories:

| Category    | Examples                             | Detection source               |
| ----------- | ------------------------------------ | ------------------------------ |
| `language`  | TypeScript, Python, Go               | GitHub languages, resume       |
| `framework` | React, FastAPI, Rails                | Resume keywords, GitHub topics |
| `domain`    | Machine Learning, Payments, Security | Resume sections, conversation  |
| `soft`      | Leadership, Communication, Mentoring | Resume achievements            |
| `tool`      | Docker, Kubernetes, Terraform        | Resume skills sections, GitHub |

Proficiency is scored from 0 (beginner) to 1 (expert). GitHub imports use a log-scale formula based on bytes written. Resume and LinkedIn imports start at 0.5 (moderate) and can be adjusted conversationally.

## Profile Completeness

The career agent tracks profile readiness across three dimensions:

1. **Has preferences** - Role types, work style, or industries set
2. **Has target roles** - At least one target role defined
3. **Has work history** - At least one work entry

When all three are present, the agent suggests switching from Discovery to Execution mode. You can check completeness anytime with the "Profile Gaps" skill:

> "What's missing from my profile?"

## Updating Your Profile

Use natural conversation to update any profile field:

```
"Update my headline to 'Staff Engineer specializing in distributed systems'"
"Add Rust to my skills"
"My compensation target is 200-250k USD"
"Remove 'onsite' from my work style preferences"
```

The agent uses `career_profile_update` and `career_preferences_set` tools to apply changes. Array fields (target roles, industries, deal-breakers) support add/remove operations.
