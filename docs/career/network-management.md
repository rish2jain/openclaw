# Network Management Guide

The network graph tracks your professional relationships, scores connection strength, finds warm introduction paths, and identifies networking gaps.

## Importing Your Network

### LinkedIn Connections

Export your LinkedIn connections (Settings > Data Privacy > Get a copy of your data > Connections). The CSV includes name, company, position, and connection date.

Tell your agent: "Import my LinkedIn connections" and share the CSV. Each connection becomes a `NetworkPerson` node with a `knows` relationship edge.

### Manual Additions

Add contacts conversationally:

```
"Add Alex Chen to my network - she's an Engineering Manager at Stripe"
"Add my former colleague James Park from Acme Corp"
```

## Connection Strength Scoring

Every relationship edge gets a composite strength score from 0 (weak) to 1 (strong), calculated from five factors:

| Factor         | Weight | Description                                            |
| -------------- | ------ | ------------------------------------------------------ |
| Recency        | 30%    | How recently you interacted (180-day half-life decay)  |
| Frequency      | 25%    | How often you interact                                 |
| Depth          | 20%    | Quality of interactions (meeting > email > group chat) |
| Shared history | 15%    | Common companies, schools, or organizations            |
| Manual boost   | 10%    | Your own override for close relationships              |

### Recency Decay

Connection strength decays with time using a 180-day half-life. A connection you spoke with yesterday scores high on recency; one you haven't contacted in a year scores low. This ensures stale connections are flagged for reconnection.

## Tracking Interactions

Log interactions to keep connection scores current:

```
"I had coffee with Alex Chen today"
"I emailed James Park about the VP role"
"Had a group meeting with the Acme team"
```

Interaction channels are classified as: `dm`, `group`, `email`, `meeting` (from least to most depth weight).

## Finding Warm Introductions

The pathfinder uses BFS (breadth-first search) up to 3 hops to find introduction chains:

```
"Who can introduce me to someone at Vercel?"
"Find a path to reach the VP of Engineering at Stripe"
```

Results are ranked by the weakest connection strength along the path (weakest-link principle). The top 5 paths are returned with a suggested approach for each.

### Example Output

```
Path 1 (strength: 0.72):
  You → Alex Chen (Stripe) → Maria Lopez (Vercel)
  Suggested approach: Ask Alex for a warm intro to Maria

Path 2 (strength: 0.45):
  You → James Park (Acme) → Tom Wilson (ex-Acme, now Vercel)
  Suggested approach: Reconnect with James, then ask about Tom
```

## Network Audit

Run a periodic network audit to understand your networking position:

```
"Audit my professional network"
```

The audit analyzes:

- **Industry distribution** - Where your contacts cluster (e.g., 40% fintech, 25% healthtech)
- **Seniority distribution** - Balance across career levels
- **Clusters** - Groups of interconnected contacts (detected via union-find algorithm)
- **Bridge contacts** - People who connect otherwise separate clusters (high-value for introductions)
- **Stale high-value contacts** - Strong connections that have gone quiet (candidates for reconnection)
- **Gaps** - Industries or companies where you have no connections but have job targets

## Reconnection Suggestions

The interaction tracker identifies contacts worth reconnecting with based on:

1. High historical connection strength but no recent interaction
2. Currently at a company you're targeting
3. Bridge contacts connecting you to otherwise unreachable clusters

Ask: "Who should I reconnect with?" or "Suggest networking actions for this week."

## Tags

Tag contacts for easy filtering:

```
"Tag Alex Chen as mentor and ex-colleague"
"Show me all contacts tagged recruiter"
```

Tags are freeform strings. Common useful tags: `mentor`, `ex-colleague`, `recruiter`, `hiring-manager`, `referral-source`, `school`.
