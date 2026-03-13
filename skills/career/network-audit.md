# Network Audit

Analyze the user's professional network to identify strengths, gaps, clusters, and reconnection opportunities.

## When to use

When the user wants to understand the shape of their professional network and find strategic ways to strengthen it, especially relative to their career goals.

## Steps

1. **Read the user's profile and preferences.** Use `career_profile_read` to understand target roles, industries, and career direction. This sets the lens for evaluating the network.

2. **Generate distribution analysis.** Use `network_lookup` with broad criteria to assess the network's composition:
   - **By industry:** Which industries are represented and in what proportion.
   - **By company:** Concentration at specific companies.
   - **By seniority/title:** Distribution across IC, management, and executive levels.
   - **By relationship type:** Proportion of "knows" vs "worked_with" vs "studied_with".

3. **Identify clusters.** Group contacts that share companies, schools, or tight mutual connections. For each cluster:
   - Name it by the common thread (e.g., "Former Stripe colleagues").
   - List the size and key members.
   - Note how active the cluster is (based on last interaction dates).

4. **Identify gaps.** Compare the network distribution against the user's target industries and roles:
   - Which target industries have few or no connections.
   - Which seniority levels are underrepresented (e.g., few director+ contacts in a target industry).
   - Which companies on the user's target list have zero known contacts.

5. **Find bridge connections.** Identify people who connect otherwise-disconnected clusters. These contacts are strategically valuable for expanding reach.

6. **List stale high-value contacts.** Find connections with high connection strength (> 0.5) that have not been contacted in 180+ days. These are relationships worth reactivating.

7. **Recommend reconnection priorities.** Rank stale contacts by strategic value:
   - At a target company with open roles.
   - In a target industry at a senior level.
   - Bridge connections between clusters.
   - Former close colleagues who could provide referrals.

## Output format

Present as a structured report:

- **Network overview** (total contacts, top industries, top companies)
- **Cluster map** (named clusters with size and activity level)
- **Gap analysis** (missing industries, seniority levels, target companies)
- **Bridge connections** (names and what they bridge)
- **Reconnection priorities** (ordered list with reason for each)

## Example usage

> "Audit my professional network and tell me where the gaps are."
