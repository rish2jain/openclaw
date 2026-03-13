# Career Debrief

Conduct a structured post-interview debrief to capture insights, identify improvements, and update the pipeline.

## When to use

After the user completes an interview round and wants to process the experience and prepare for next steps.

## Steps

1. **Ask what went well.** Prompt the user to share:
   - Questions they answered confidently.
   - Moments where they connected with the interviewer.
   - Topics where their experience clearly resonated.

2. **Ask what was challenging.** Prompt the user to share:
   - Questions they struggled with or felt unprepared for.
   - Topics where they felt their experience was thin.
   - Any unexpected format or question types.

3. **Identify challenging questions.** For each difficult question:
   - Capture the question (or the gist of it).
   - Discuss what a stronger answer would look like.
   - If the question maps to a skill gap, note it for future prep.

4. **Capture new information about the role or company.** Ask if the user learned anything new:
   - Team structure, reporting chain, or day-to-day responsibilities.
   - Company culture signals (positive or negative).
   - Timeline for next steps or decision.
   - Compensation details if discussed.

5. **Update the job listing status.** Use `job_status_update` to:
   - Keep status as "interviewing" if more rounds remain.
   - Move to "offer" if an offer was extended.
   - Move to "rejected" if the user was declined.
   - Add a note summarizing the interview round.

6. **Suggest improvements for next interviews.** Based on the challenging areas:
   - Recommend specific preparation topics.
   - Suggest STAR stories to refine or develop.
   - If a skill gap was exposed, note it as a development area.

## Output format

Summarize the debrief as:

- Strengths demonstrated (bullet list)
- Areas for improvement (bullet list with specific actions)
- New role/company insights
- Pipeline status update confirmation
- Preparation recommendations for next round or future interviews

## Example usage

> "I just finished my second round at Vercel. Let's debrief."
