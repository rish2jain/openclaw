# Application Review

Review a job listing in detail and provide an honest assessment of fit, covering requirements match, company signals, and a clear recommendation.

## When to use

When the user wants an informed opinion on whether a specific job listing is worth applying to.

## Steps

1. **Read the job listing.** Use `job_review` with the listing ID to get the full description, requirements, relevance score, and score breakdown.

2. **Read the user's profile.** Use `career_profile_read` to load skills, work history, and preferences.

3. **Analyze requirements match.** For each listed requirement:
   - Mark as "strong match" if the user has direct, demonstrated experience.
   - Mark as "partial match" if the user has related but not exact experience.
   - Mark as "gap" if the user has no relevant experience.
   - Calculate an overall match percentage.

4. **Identify strong fits.** Highlight 2-4 areas where the user's background is particularly well-suited. Reference specific work entries, skills, or projects.

5. **Identify gaps.** List requirements where the user falls short. For each gap, assess severity:
   - "Nice-to-have gap" — unlikely to block the application.
   - "Core gap" — the requirement is central to the role and the user lacks it.
   - "Learnable gap" — the user could credibly acquire this skill quickly.

6. **Assess company signals.** If company intelligence is available, evaluate:
   - Recent funding, layoffs, or leadership changes.
   - Company stage relative to user's preferences.
   - Industry alignment with user's target industries.

7. **Check deal-breakers.** Compare the listing against the user's stated deal-breakers in preferences. Flag any matches.

8. **Recommend: apply or skip.** Provide a clear recommendation with reasoning:
   - **Apply:** Strong match on core requirements, no deal-breakers, company aligns.
   - **Apply with caveats:** Good match but notable gaps; worth it if the user is willing to address them.
   - **Skip:** Core gaps, deal-breakers, or misalignment outweigh the positives.

## Output format

- Score breakdown table (factor | score | notes)
- Requirements match list (strong / partial / gap)
- Strong fits summary
- Gaps summary with severity
- Company signals (if available)
- Deal-breaker check
- Final recommendation with reasoning

## Example usage

> "Review the Product Engineer listing at Linear (listing ID: linear-eng-7) and tell me if I should apply."
