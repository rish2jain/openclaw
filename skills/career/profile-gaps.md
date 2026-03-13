# Profile Gaps

Identify weaknesses and missing information in the user's career profile, then suggest specific improvements to strengthen it for job applications.

## When to use

When the user wants to improve their profile, when starting a new job search, or when the agent detects the profile is incomplete during other workflows.

## Steps

1. **Read the full profile.** Use `career_profile_read` with `sections=all` to get every section.

2. **Check each section for completeness.** Evaluate:
   - **Profile header:** Is name, headline, and narrative populated? Is the headline specific (not generic like "Software Engineer")?
   - **Work history:** Are there entries? Do entries have descriptions and achievements (not just titles)? Are achievements quantified with metrics?
   - **Skills:** Are skills listed? Do they have proficiency ratings? Are there skills from multiple categories (technical, domain, soft)?
   - **Projects:** Are there project entries? Do they include tech stack and impact?
   - **Education:** Are entries present if applicable?
   - **Preferences:** Are role types, industries, work style, and deal-breakers set?
   - **Target roles:** Are target roles defined? Are they specific enough?

3. **Compare skills to market demand.** For each target role in the user's preferences:
   - Identify commonly required skills for that role type.
   - Check which of those skills are present in the user's profile.
   - Flag missing high-demand skills as gaps.

4. **Identify missing achievements and metrics.** For each work entry:
   - Check if achievements are listed.
   - Check if any achievements include quantified impact (numbers, percentages, scale).
   - Flag entries that only have job descriptions without specific accomplishments.

5. **Assess narrative strength.** Evaluate the career narrative:
   - Does it tell a coherent story connecting past roles to future goals?
   - Does it differentiate the user from others with similar titles?
   - Is it specific enough to be useful for tailoring applications?

6. **Suggest specific improvements.** For each gap found, provide:
   - What is missing or weak.
   - Why it matters for the job search.
   - A specific prompt or question to help the user fill it in.
   - Priority level: critical (blocks applications), important (weakens applications), or nice-to-have.

## Output format

Present as a structured assessment:

- **Completeness score** (percentage of sections adequately filled)
- **Section-by-section review** (status and specific issues for each)
- **Skills gap analysis** (market-demand skills missing from profile)
- **Achievement gaps** (work entries lacking metrics or specifics)
- **Improvement priorities** (ordered list of actions from most to least impactful)

## Example usage

> "Check my profile for gaps and tell me what I need to improve before I start applying."
