# Offer Compare

Compare multiple job offers side-by-side across seven dimensions with weighted scoring to help the user decide which offer to accept.

## When to use

When the user has two or more active offers and wants help deciding between them, or when they want to understand the tradeoffs between offers.

## Steps

1. **Identify offers to compare.** Check the pipeline for listings with status "offer". If fewer than two offers exist, ask the user to provide details for the offers they want to compare.

2. **Capture missing details.** For each offer, ensure compensation details are stored via `career_negotiation_save`. Ask about:
   - Compensation components (base, equity, bonus, benefits)
   - Work-life signals (hours expectations, PTO, flexibility)
   - Growth signals (role scope, team size, promotion path)
   - Culture signals (interview experience, Glassdoor reviews, values alignment)
   - Stability signals (funding stage, revenue, runway)

3. **Set dimension weights.** Present the seven dimensions and ask the user to rank or weight them:
   - Total compensation (default: 25%)
   - Equity upside (default: 15%)
   - Work-life balance (default: 15%)
   - Growth potential (default: 15%)
   - Culture fit (default: 10%)
   - Stability (default: 10%)
   - Location match (default: 10%)

4. **Generate comparison.** Use `career_offer_compare` with the offer IDs and custom weights to produce the scored matrix.

5. **Present the verdict.** Show:
   - Side-by-side dimension scores for each offer
   - Weighted total scores
   - Recommendation with reasoning
   - Tradeoffs (what you give up with the top pick)
   - Tiebreakers if scores are close

6. **Next steps.** If the user selects an offer to negotiate, offer to run the salary negotiation skill on the chosen offer.

## Output format

Present as a comparison table followed by:

- Verdict with reasoning
- Tradeoff analysis
- Recommended next action

## Example usage

> "I have offers from Google and Stripe. Help me compare them."
