# Interview Prep

Prepare the user for an upcoming interview by mapping their experience to the role's requirements, generating likely questions, and building talking points.

## When to use

When the user has an interview scheduled (or is preparing for one) for a specific job listing.

## Steps

1. **Read the job listing.** Use `job_review` to get the full description, requirements list, and company intelligence.

2. **Read the user's profile.** Use `career_profile_read` to load work history, skills, and projects.

3. **Map experience to each requirement.** For every listed requirement or preferred qualification:
   - Identify the user's most relevant experience.
   - Note the strength of the match (strong, partial, gap).
   - Flag requirements where the user has no direct experience.

4. **Generate likely interview questions.** Create two categories:
   - **Behavioral questions:** Based on the role's soft-skill requirements and seniority level (e.g., "Tell me about a time you handled conflicting priorities"). Generate 5-8 questions.
   - **Technical questions:** Based on the role's technical requirements and the user's claimed skills (e.g., "How would you design a rate-limiting system?"). Generate 5-8 questions.

5. **Create STAR-format talking points.** For each behavioral question, draft a talking point using the user's real work history:
   - **Situation:** Set the scene from a real work entry.
   - **Task:** What was the user responsible for.
   - **Action:** What they specifically did.
   - **Result:** The outcome, ideally with a metric.

6. **Identify weak spots and prepare responses.** For gaps between the user's experience and the role's requirements:
   - Acknowledge the gap honestly.
   - Frame adjacent experience that demonstrates transferable capability.
   - Suggest a learning narrative if the user is actively building the skill.

7. **Company context.** If company intel is available, note recent signals (funding, leadership changes, product launches) that the user can reference to show research depth.

## Output format

Organize output as:

- Requirements match table (requirement | user's experience | match strength)
- Behavioral questions with STAR talking points
- Technical questions with suggested approach angles
- Weak spot responses
- Company context notes

## Example usage

> "Help me prepare for my interview at Stripe for the Staff Engineer role (listing ID: stripe-42)"
