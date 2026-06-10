# CLAUDE.md

Context for Claude Code when working in this repo.

## What this is

A weekly GitHub Actions agent that discovers upcoming Chicago concerts and keeps a Spotify playlist current. The full loop: Spotify taste profile → Claude + web_search → matched show list → Spotify playlist update + static site regeneration (GitHub Pages).

## Project structure

```
src/
  agent.ts          # Entry point. Orchestrates the full loop.
  spotify.ts        # Spotify REST client. All API calls live here.
  site.ts           # Static site renderer. Pure string templating, no client JS.
docs/
  index.html        # Generated site, served by GitHub Pages from main:/docs.
  shows.json        # Generated data snapshot. Both committed by the workflow.
scripts/
  get-refresh-token.ts  # One-time OAuth helper. Run locally only.
.github/workflows/
  concert-playlist.yml  # Weekly cron. Fires Monday 9am Chicago time.
VISION.md           # Why this exists and where it's going.
```

## Key architectural decisions

**No Spotify SDK.** `spotify.ts` uses native `fetch` directly against the Spotify REST API. Keep it that way — the SDK adds weight and the API surface we use is narrow and stable.

**No concert data API.** Claude's `web_search_20260209` tool scrapes venue websites directly. Do not introduce Bandsintown, Ticketmaster, or SeatGeek API integrations unless the web search approach demonstrably fails. The strength of this approach is that it works for small/indie venues that aren't in aggregator databases.

**Claude does the taste matching.** Do not write genre-matching heuristics. The system prompt in `discoverConcertShows()` is the matching logic. If matching quality needs to improve, improve the prompt — not the code.

**Playlist replaces, not appends.** `replacePlaylistTracks()` uses Spotify's `PUT` endpoint, which replaces all tracks. This is intentional — the playlist reflects the current week, not a growing history. The site works the same way: `docs/` is fully regenerated each run.

**The site is build-time static.** `site.ts` renders plain HTML with Spotify embed iframes (`open.spotify.com/embed/artist/{id}`) — no framework, no bundler, no client-side JS. The workflow commits `docs/` after each run and GitHub Pages serves it directly. Keep it that way.

## Environment variables

```
ANTHROPIC_API_KEY          # Anthropic API key
SPOTIFY_CLIENT_ID          # Spotify developer app client ID
SPOTIFY_CLIENT_SECRET      # Spotify developer app client secret
SPOTIFY_REFRESH_TOKEN      # Long-lived refresh token (see scripts/get-refresh-token.ts)
```

All four are required at runtime. The agent validates their presence on startup and exits with a clear error if any are missing.

In local dev, copy `.env.example` to `.env` and fill in values. `agent.ts` loads it via `import 'dotenv/config'`, so `npm run dev` picks it up automatically.

In GitHub Actions, all four are stored as repository secrets.

## Running locally

```bash
npm install
npm run dev        # tsx — no build step, picks up src/agent.ts directly
npm run build      # tsc → dist/
npm start          # node dist/agent.js
```

To test the Spotify token refresh without running the full agent, you can call `spotify.getUserId()` in isolation — it's a cheap authenticated request.

## The agentic loop

`discoverConcertShows()` in `agent.ts` runs a loop capped at `MAX_AGENT_ITERATIONS` (currently 20). In practice Claude finishes in 3–8 web searches and returns `end_turn`.

`web_search_20260209` is a server-side tool — Anthropic executes the searches, not the client. When `stop_reason === 'pause_turn'` (the server-side search loop hit its iteration cap), the loop re-sends with the assistant content appended and the server resumes. When `stop_reason === 'end_turn'`, the final text block is parsed as a JSON array of show objects.

The response format Claude is asked to return:
```json
[{"artist": "Artist Name", "venue": "Venue", "date": "2026-06-19", "url": "https://..."}]
```
`url` is optional; everything else is required per entry.

`parseShowList()` in `agent.ts` strips markdown fences, drops malformed entries, and falls back to extracting the first `[...]` substring if Claude wrapped the JSON in explanation text.

## Tuning

| What to change | Where |
|---|---|
| Which venues to search | `CHICAGO_VENUES` array in `agent.ts` |
| Genre matching criteria | System prompt in `discoverConcertShows()` |
| Site look & feel | Inline CSS / templates in `src/site.ts` |
| Tracks per artist | `TRACKS_PER_ARTIST` constant in `agent.ts` |
| Max playlist size | `MAX_PLAYLIST_TRACKS` constant in `agent.ts` |
| How many top artists to pull | `limit` param in `getTopArtists()` calls |
| Playlist name | `PLAYLIST_NAME` constant in `agent.ts` |
| Schedule | `cron` expression in `.github/workflows/concert-playlist.yml` |

## What to watch for

**Spotify token expiry.** The refresh token is long-lived but not permanent. If Spotify revokes it (e.g. if the developer app's settings change, or after extended inactivity), re-run `npm run get-token` and update the GitHub secret.

**Venue website changes.** Web search is resilient to layout changes, but if a venue moves their calendar behind a JS-heavy SPA, Claude's search-based scraping may degrade. The fallback is to point Claude at a third-party aggregator for that specific venue.

**Claude JSON parsing.** If the agent consistently returns 0 shows despite finding them, check whether Claude is wrapping the output in explanation text. `parseShowList()` already handles fences and surrounding prose; if it still fails, tighten the system prompt or add a second pass that asks Claude to extract just the JSON from its previous response.

**An all-miss week leaves the playlist and site untouched.** If Claude returns no shows, the agent exits before writing `docs/` or calling `replacePlaylistTracks()` — it never replaces the playlist with an empty list or blanks the site. If shows are found but no artist resolves to Spotify tracks, the site is still regenerated (without players) and only the playlist update is skipped.

**GitHub Actions minute budget.** Free tier provides 2,000 min/month. This workflow consumes ~20 min/month. Headroom is large.

## Out of scope (for now)

- Purchase integration (the site links to event pages when Claude finds them, nothing more)
- Push notifications or digests
- Anything beyond the static site (no backend, no interactivity, no accounts)
- Multi-user support
- Persistent storage or run history

See `VISION.md` for the longer-term roadmap.