# Weekly Standup

Generate a weekly career search summary covering pipeline status, new opportunities, pending actions, and priorities for the coming week.

## When to use

At the start or end of each week to review job search progress and plan next actions.

## Steps

1. **Get pipeline summary.** Use `pipeline_summary` with `includeDetails=true` to get current counts by status and per-listing details for active items.

2. **Count new listings.** Use `job_search` with broad keywords matching the user's target roles, filtered to the last 7 days. Report how many new listings appeared since the last standup.

3. **Summarize pipeline by status.** Present current counts:
   - New/unreviewed listings
   - Saved (reviewed but not yet applied)
   - Applied (awaiting response)
   - Interviewing (active interview processes)
   - Offers (pending decisions)
   - Dismissed/rejected (for trend context)

4. **List pending follow-ups.** Identify listings where action is needed:
   - Applied more than 7 days ago with no response — consider follow-up.
   - Interview scheduled — note date and prep status.
   - Offer pending — note deadline if known.
   - Saved listings older than 14 days — review or dismiss.

5. **Highlight high-match roles not yet reviewed.** From new listings, surface any with a relevance score above 70 that the user has not yet opened or saved.

6. **Suggest this week's priorities.** Based on the pipeline state, recommend 3-5 specific actions:
   - If pipeline is thin: prioritize finding and reviewing new listings.
   - If many saved but few applied: prioritize applications.
   - If interviewing: prioritize interview prep and follow-ups.
   - If stale: suggest revisiting search criteria or expanding scope.

## Output format

Present as a structured report:

- **This week's numbers** (new listings, applications sent, interviews, etc.)
- **Pipeline snapshot** (table or list by status)
- **Action items** (ordered by priority with specific listing references)
- **High-match opportunities** (new listings worth reviewing)
- **Suggested focus** (2-3 sentences on where to spend time this week)

## Example usage

> "Give me my weekly career standup."
