# concert-playlist

A weekly agent that searches Chicago venue listings, matches upcoming artists to your Spotify taste profile using Claude, and keeps a private playlist up to date.

**Stack:** TypeScript · Anthropic API (claude-sonnet-4 + web_search) · Spotify REST API · GitHub Actions

---

## How it works

1. **Taste profile** — Pulls your top artists (short + medium term) from Spotify
2. **Concert discovery** — Sends the profile to Claude, which uses `web_search` to scrape upcoming shows at ~12 Chicago venues
3. **Matching** — Claude reasons over genre fit and returns a JSON list of matched artists
4. **Playlist update** — Fetches top tracks for each artist and replaces the playlist contents

Runs every Monday at 9am Chicago time via GitHub Actions.

---

## Setup

### 1. Spotify developer app

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add `http://localhost:8888/callback` as a Redirect URI
4. Copy the **Client ID** and **Client Secret**

### 2. Get a refresh token (one-time)

```bash
npm install
SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=xxx npm run get-token
```

This opens a browser, asks you to authorize, and prints the refresh token to your terminal.

### 3. Add GitHub Actions secrets

In your repo → Settings → Secrets and variables → Actions, add:

| Secret | Value |
|--------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `SPOTIFY_CLIENT_ID` | From the Spotify dashboard |
| `SPOTIFY_CLIENT_SECRET` | From the Spotify dashboard |
| `SPOTIFY_REFRESH_TOKEN` | From step 2 |

### 4. Push and test

Push to GitHub. Then go to Actions → **Concert Playlist Update** → **Run workflow** to trigger manually before waiting for Monday.

---

## Local dev

```bash
cp .env.example .env
# Fill in .env with your secrets

npm install
npm run dev   # runs via tsx, no build step needed
```

---

## Customization

| What | Where |
|------|-------|
| Venues | `CHICAGO_VENUES` array in `src/agent.ts` |
| Playlist name | `PLAYLIST_NAME` in `src/agent.ts` |
| Tracks per artist | `TRACKS_PER_ARTIST` in `src/agent.ts` |
| Schedule | `cron` in `.github/workflows/concert-playlist.yml` |
| Matching criteria | System prompt in `discoverConcertArtists()` |
