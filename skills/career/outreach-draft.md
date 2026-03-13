# Outreach Draft

Draft a personalized networking or outreach message to a professional contact, grounded in the user's actual relationship context and shared history.

## When to use

When the user wants to reach out to someone in their network for reconnection, referral, informational interview, or introduction.

## Steps

1. **Identify the recipient.** Get the contact's details using `network_lookup` by name, company, or ID. Confirm the right person with the user if multiple matches exist.

2. **Check relationship context.** Review the contact's relationship data: connection type (knows, worked_with, studied_with), connection strength, last interaction date, shared history (companies, schools).

3. **Check if they are at a target company.** If the user has active job searches, cross-reference the contact's company against saved or high-match listings. This determines whether a referral angle is appropriate.

4. **Determine the outreach purpose.** Based on the user's stated goal:
   - **Reconnect:** Casual check-in referencing shared history.
   - **Informational interview:** Ask about their experience at the company/role.
   - **Referral request:** Reference a specific open role and ask if they can refer.
   - **Introduction request:** Ask to be connected to someone else at their company.
   - **Congratulations:** React to a career update or achievement.

5. **Draft the message.** Follow these principles:
   - Open with a genuine reference to shared context (not generic "Hope you're well").
   - Be specific about what you are asking for.
   - Keep it concise (3-5 sentences for LinkedIn/Slack, slightly longer for email).
   - Do not be overly formal or use templated language.
   - Include a clear, low-friction call to action.

6. **Present for user review.** Show the draft and explain the reasoning behind the approach. Offer to adjust tone, length, or angle.

## Output format

Present the draft message in a quote block, followed by a brief explanation of the approach taken and what shared context was referenced. If the contact is at a target company with an open listing, note that.

## Example usage

> "Draft a message to Alex Chen asking about the engineering culture at Figma. I worked with him at my last company."
