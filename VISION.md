# Concert Playlist Agent — Vision

## The problem

Discovering live music in a city like Chicago is genuinely hard — not because there isn't enough happening, but because there's too much. Venue calendars are siloed, aggregators optimize for popularity over fit, and the gap between "I should check what's at the Hideout this month" and actually doing it is wide enough that it just doesn't happen.

The result: you find out your favorite band played Schubas two weeks ago from an Instagram post after the fact.

## What this is

A lightweight autonomous agent that runs weekly, searches Chicago venue listings, and maintains a Spotify playlist of bands with upcoming shows that match your listening taste. No app to open, no newsletter to skim. Monday morning the playlist is updated; it's there when you want it.

The intelligence lives in the Anthropic API — Claude reasons over your taste profile and the raw noise of venue calendars to produce a signal you can actually act on. The infrastructure is as thin as possible: a scheduled GitHub Actions job, direct Spotify API access, no database, no UI, no server to maintain.

## Why this way

**Taste profile as ground truth.** Spotify's top-artists endpoint captures what you're actually listening to, not what you think you listen to. Short-term and medium-term windows together surface both current obsessions and stable preferences.

**Claude as the matching layer.** Genre matching from first principles is brittle. An artist whose Spotify genre tags say "indie rock" might be Slaughter Beach Dog or it might be Imagine Dragons. Claude can reason about genre DNA — shared aesthetics, lineage, scene adjacency — in a way a tag-matching heuristic cannot.

**Web search over a structured API.** Venue-level concert APIs are either expensive, incomplete, or both. The venues you care about (Empty Bottle, Hideout, Thalia Hall) maintain their own calendars. Claude with web search can read those directly, just like a person would.

**Playlist as the interface.** A Spotify playlist is a zero-friction output. It lives where your music already is, works on every device, and requires no behavior change to consume. The playlist replaces itself each week so it stays current without accumulating cruft.

## What success looks like

- You catch at least one show per month you'd have otherwise missed
- The playlist feels like it was curated by someone who actually knows your taste
- Zero maintenance — it runs, it works, you don't think about it

## What this is not

This is not a recommendation engine, a ticketing integration, or a social product. It does one thing: translate your listening habits into actionable local discovery, automatically, every week.

## Future directions

These are possible but deliberately out of scope for v1:

**Ticket links.** Enriching matched artists with Bandsintown or Ticketmaster links so the playlist description or a companion artifact surfaces "Ratboys @ Thalia Hall, July 12 — tickets."

**Multi-city support.** Parameterizing the venue list to support travel weeks (e.g., run against Austin venues the week before a trip).

**Notification.** Posting a weekly Slack or iMessage digest of matched shows alongside the playlist update.

**Feedback loop.** Tracking which matched artists you actually go see (via check-in data or manual input) to weight future recommendations.

**Expanded taste signals.** Pulling from Last.fm scrobbles or Apple Music history in addition to Spotify to build a richer profile.

Any of these would be additive layers on top of the same core loop. The core loop should stay simple.

## Guiding principles

**Anthropic infrastructure does the thinking.** As Anthropic builds out scheduling, memory, and agent orchestration primitives, this project should migrate toward them. GitHub Actions is a temporary host for a dumb cron trigger — not a permanent architecture decision.

**Prefer deletion over configuration.** When in doubt, remove complexity. A playlist that's wrong 20% of the time and requires no maintenance is better than one that's right 95% of the time and requires a settings UI.

**The output is the product.** The playlist is what matters. The code is just a means to that end.