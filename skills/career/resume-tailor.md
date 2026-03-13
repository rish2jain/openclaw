# Resume Tailor

Tailor the user's resume to a specific job listing by aligning experience, skills, and language to what the role demands.

## When to use

When the user wants to customize their resume for a particular job listing before applying.

## Steps

1. **Read the user's profile.** Use `career_profile_read` with `sections=all` to get the full profile: work history, skills, projects, and education.

2. **Read the target job listing.** Use `job_review` with the listing ID to get the full job description, requirements, and score breakdown.

3. **Identify top matching skills and experiences.** Compare the job requirements against the user's skills and work history. Rank each requirement by how strongly the user's background supports it.

4. **Rewrite bullet points using the job's language.** For each relevant work entry:
   - Mirror the terminology from the job description (e.g., if the listing says "cross-functional collaboration," use that phrase instead of "worked with other teams").
   - Lead with impact and quantified results where the user has them.
   - Remove or de-emphasize bullet points irrelevant to this role.

5. **Highlight relevant achievements.** Pull specific achievements from work history and projects that directly address the job's key requirements. Prioritize entries where the user has measurable outcomes (revenue, efficiency, scale).

6. **Surface gaps honestly.** If the listing requires skills or experience the user lacks, note them. Do not fabricate experience. Suggest adjacent experience that partially covers the gap.

7. **Output tailored resume sections.** Present the rewritten content organized by section:
   - Summary/headline (rewritten for this role)
   - Work experience (reordered and rewritten bullets)
   - Skills (prioritized to match listing)
   - Projects (if relevant to this role)

## Output format

Present each section with clear headings. Use bullet points for work experience entries. After the tailored sections, include a brief "Fit notes" section listing strong matches and gaps.

## Example usage

> "Tailor my resume for the Senior Backend Engineer role at Acme Corp (listing ID: abc-123)"
