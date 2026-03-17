# Career Path

Model career trajectories from the user's current position to a target role, identifying skill gaps, timeline estimates, and concrete actions for each step.

## When to use

When the user wants to explore where their career could go, understand what it takes to reach a target role, or identify skill gaps they should address.

## Steps

1. **Understand the destination.** Ask the user about their target:
   - Target role title (e.g., "Staff Engineer", "Engineering Manager")
   - Target domain if different from current (e.g., "data science", "product management")
   - Target level (mid, senior, staff, principal, director)
   - Desired timeline (if any)

2. **Establish the origin.** Read the user's career profile to identify:
   - Current role and level
   - Current domain
   - Key skills and experience years
   - Recent role history

3. **Generate routes.** Use `career_path_model` to produce 2-3 career paths:
   - Direct path (stay in current domain, climb the ladder)
   - Lateral path (broaden experience first, then climb)
   - Pivot path (if target domain differs from current)

4. **Present routes with tradeoffs.** For each route, explain:
   - Steps involved and transition types
   - Estimated timeline
   - Difficulty level
   - What you gain and what you risk

5. **Drill into skill gaps.** For the user's preferred route, use `career_path_gaps` to show:
   - Skills they need but don't have (or need at a higher level)
   - Severity of each gap
   - Specific strategies to close each gap (courses, projects, stretch assignments)

6. **Connect to job search.** If the user is in execution mode:
   - Identify roles that would build the missing skills
   - Suggest using `career_job_search` with keywords from the gap analysis
   - Frame intermediate roles as stepping stones, not detours

## Output format

Present each route as:

- Route name and difficulty
- Step-by-step progression with timeline
- Key tradeoffs
- For the selected route: detailed skill gap analysis with actions

## Example usage

> "I'm a senior backend engineer. What would it take to become a VP of Engineering?"
