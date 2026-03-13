# Outreach Guide

The outreach system drafts personalized messages, tracks send status, schedules follow-ups, and learns your communication style over time.

## Message Types

| Type            | When to use                                       |
| --------------- | ------------------------------------------------- |
| `warm_intro`    | Asking a mutual connection to introduce you       |
| `cold_outreach` | Reaching out to someone with no shared connection |
| `follow_up`     | Following up on a previous message or application |
| `reconnection`  | Re-engaging a dormant connection                  |
| `thank_you`     | Post-interview or post-meeting thanks             |

## Drafting Messages

Ask your agent to draft messages naturally:

```
"Draft a reconnection message to Alex Chen"
"Write a cold outreach to the hiring manager at Stripe about the backend role"
"Draft a thank-you note for my interview with Maria"
"Write a warm intro request to James about connecting me with someone at Vercel"
```

The generator builds messages from composable sections tailored to each message type. For example, a warm intro request includes: greeting, shared context, the ask, why you're interested, and a closing.

### Context Awareness

Drafts automatically incorporate:

- **Shared history** from the network graph (common companies, schools)
- **Relationship strength** to calibrate formality
- **Job context** when the outreach is tied to a specific listing
- **Network path** when requesting introductions through intermediaries

## Outreach Pipeline

Every drafted message has a status:

```
draft → approved → sent → replied
                       ↘ no_response
```

Track progress:

```
"I sent the message to Alex"
"Alex replied to my outreach"
"Mark the Stripe outreach as no response"
```

### Pipeline Metrics

Get aggregate stats:

```
"How's my outreach going?"
```

Returns: total drafts, sent count, reply count, no-response count, pending follow-ups, and response rate.

## Follow-Up Scheduling

The follow-up scheduler sets reminders based on message type:

| Type                     | Default follow-up interval |
| ------------------------ | -------------------------- |
| Cold outreach            | 7 days                     |
| Warm intro               | 5 days                     |
| Follow-up (to follow-up) | 10 days                    |
| Reconnection             | 14 days                    |
| Thank you                | No follow-up               |

When a follow-up is due, the agent will remind you and offer to draft the follow-up message.

Override intervals per message:

```
"Follow up on the Stripe outreach in 3 days instead"
```

## Style Learning

The system learns your communication style from your edits. When you modify a drafted message before sending, the style learner tracks:

- **Preferred tone** (formal, casual, professional)
- **Average message length**
- **Formality level** (0 to 1 scale)
- **Emoji usage**
- **Signature style**

Style learning uses an exponential moving average and requires at least 3 edits before it starts influencing new drafts. The more you edit, the better drafts match your voice.

## Channels

Outreach messages can be tagged by delivery channel:

- `email` - Professional email
- `linkedin` - LinkedIn messages/InMail
- `twitter` - Twitter/X DMs
- `other` - Slack, Discord, or other platforms

The channel affects tone and length defaults. LinkedIn messages tend to be shorter; emails can be longer and more detailed.

## Tips

- **Always personalize.** The generator provides a strong starting point, but adding a specific detail about the person or their work significantly improves response rates.
- **Use warm intros when possible.** The network pathfinder helps you find introduction chains. Warm intros have 2-5x the response rate of cold outreach.
- **Follow up once.** If there's no response after one follow-up, move on. The system tracks no-response status so you don't over-message.
- **Review your style profile.** Ask "Show my outreach style profile" to see what the system has learned from your edits.
