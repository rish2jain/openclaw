# Salary Negotiation

Guide the user through analyzing a job offer and building a negotiation strategy with specific counter-offer scripts.

## When to use

When the user has received a job offer and wants help evaluating compensation, comparing to market rates, or preparing to negotiate.

## Steps

1. **Identify the offer.** Ask which listing the user received an offer for. If it has status "offer" in the pipeline, load it. If not, use `career_outreach_track` to update the status.

2. **Capture compensation details.** Use `career_negotiation_save` to store:
   - Base salary
   - Equity (type, amount, vesting schedule)
   - Signing bonus
   - Annual bonus (target and range)
   - Benefits (list)
   - Other compensation (relocation, education, etc.)

3. **Gather market context.** Ask the user:
   - Do they have competing offers? (If yes, capture those too.)
   - Do they have market data (levels.fyi, Glassdoor, etc.)?
   - What is their current compensation?

4. **Analyze the offer.** Use `career_negotiation_analyze` to assess:
   - How the offer compares to market benchmarks.
   - Leverage points (competing offers, rare skills, experience).
   - Risk areas (below market, weak equity, no bonus).

5. **Set priorities.** Ask what matters most to the user:
   - Base salary vs equity vs signing bonus vs flexibility vs title.
   - What is their walk-away threshold?

6. **Build the strategy.** Use `career_negotiation_strategy` to generate:
   - Prioritized counter-asks with ranges and justifications.
   - Specific scripts (what to say for each ask).
   - Overall approach recommendation (collaborative, competitive, walk-away-ready).

7. **Track rounds.** As the user negotiates:
   - Record each round (counter sent, counter received, final outcome).
   - Adjust strategy based on the company's responses.

## Output format

Present the strategy as:

- Offer summary (one-line per component)
- Market comparison (where the offer sits relative to benchmarks)
- Recommended asks (ordered by priority, with scripts)
- Walk-away analysis (when to accept, when to push, when to walk)

## Example usage

> "I just got an offer from Stripe for 185k base. Let's negotiate."
