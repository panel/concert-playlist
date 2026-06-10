// src/agent.ts
// Concert playlist agent.
//
// Flow:
//   1. Pull taste profile from Spotify (top artists, short + medium term)
//   2. Send to Claude with web_search to discover upcoming Chicago concerts
//   3. Claude reasons over artist/genre fit, returns a JSON list
//   4. Fetch top tracks for each matched artist from Spotify
//   5. Replace playlist contents

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { SpotifyClient } from './spotify.js';
import type { Artist } from './spotify.js';

// ─── Config ─────────────────────────────────────────────────────────────────

const PLAYLIST_NAME = '🎸 Chicago Shows';
const TRACKS_PER_ARTIST = 3;
const MAX_PLAYLIST_TRACKS = 50;
const MAX_AGENT_ITERATIONS = 20; // safety ceiling for the agentic loop

// Each venue lists its official site so Claude can target searches at the
// right domain (important for small venues with thin aggregator coverage).
const CHICAGO_VENUES: { name: string; site?: string }[] = [
  { name: 'Lincoln Hall', site: 'lh-st.com' },
  { name: 'Schubas Tavern', site: 'lh-st.com' },
  { name: 'Beat Kitchen', site: 'beatkitchen.com' },
  { name: 'Subterranean', site: 'subt.net' },
  { name: 'Cobra Lounge', site: 'cobralounge.com/events' },
  { name: 'Bottom Lounge', site: 'bottomlounge.com' },
  { name: 'Salt Shed', site: 'saltshedchicago.com' },
  { name: 'Empty Bottle', site: 'emptybottle.com' },
  { name: 'Metro Chicago', site: 'metrochicago.com' },
  { name: 'Thalia Hall', site: 'thaliahallchicago.com' },
  { name: 'The Hideout', site: 'hideoutchicago.com' },
  { name: 'Park West', site: 'parkwestchicago.com' },
  { name: 'Riviera Theatre', site: 'rivieratheatre.com' },
];

// ─── Taste profile builder ───────────────────────────────────────────────────

function buildTasteProfile(shortTerm: Artist[], mediumTerm: Artist[]): string {
  // Deduplicate; short-term artists appear first (more weight)
  const seen = new Set<string>();
  const merged = [...shortTerm, ...mediumTerm].filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  return merged
    .slice(0, 30)
    .map((a) => `- ${a.name} (genres: ${a.genres.slice(0, 3).join(', ') || 'unknown'})`)
    .join('\n');
}

/**
 * Parses Claude's final text into an array of artist names. Tolerates markdown
 * fences and surrounding explanation text; returns null if no valid JSON array
 * of strings can be extracted.
 */
function parseArtistList(text: string): string[] | null {
  const clean = text.replace(/```(?:json)?|```/g, '').trim();

  for (const candidate of [clean, clean.match(/\[[\s\S]*\]/)?.[0]]) {
    if (!candidate) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.every((a) => typeof a === 'string')) {
        return parsed;
      }
    } catch {
      // fall through to the next candidate
    }
  }
  return null;
}

// ─── Concert discovery via Anthropic ─────────────────────────────────────────

async function discoverConcertArtists(
  anthropic: Anthropic,
  tasteProfile: string,
): Promise<string[]> {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const systemPrompt = `You are a concert discovery agent for a music fan in Chicago, IL.

Today is ${today}. Your job is to find upcoming live shows in Chicago over the next 4 weeks and identify artists that match the user's taste.

## User's Spotify taste profile
${tasteProfile}

## Target venues
${CHICAGO_VENUES.map((v) => `- ${v.name}${v.site ? ` (${v.site})` : ''}`).join('\n')}

## Instructions
1. Search each venue's website or listings for upcoming shows. Prefer the venue's
   official site listed above. Good search queries: "[Venue Name] Chicago upcoming
   shows 2026", "[Venue] schedule June July 2026", "[venue site] calendar"
2. For each show, note the performing artist(s).
3. Evaluate each artist against the taste profile. Include if they share genre DNA
   (indie rock, emo, folk-punk, alt-country, dream pop, slowcore, etc.) — be generous.
4. Deduplicate — return each artist once even if they appear at multiple venues.

## Output format
Return ONLY a valid JSON array of matched artist name strings. No markdown fences, no explanation.
Example: ["Slaughter Beach Dog", "Soccer Mommy", "Ratboys", "Wednesday"]

If no matches are found, return an empty array: []`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Search Chicago venue listings for the next 4 weeks and return a JSON array of artist names that match my taste profile.`,
    },
  ];

  console.log('🤖 Starting Anthropic agentic loop...');

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      // web_search is a server-side tool — Anthropic executes searches on its
      // infrastructure; no client-side tool execution needed. The _20260209
      // version filters results server-side before they reach the context.
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
        },
      ],
      messages,
    });

    console.log(`  iteration ${i + 1}: stop_reason=${response.stop_reason}, blocks=${response.content.length}`);

    // Add assistant turn to history
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      const artists = parseArtistList(text);
      if (artists === null) {
        console.error('  ❌ Failed to parse artist list from Claude response:');
        console.error('  Raw text:', text);
        return [];
      }
      console.log(`  ✅ Claude returned ${artists.length} matched artists`);
      return artists;
    }

    if (response.stop_reason === 'pause_turn') {
      // The server-side web_search loop hit its iteration cap mid-turn.
      // Re-sending with the assistant content appended (done above) resumes it.
      continue;
    }

    if (response.stop_reason === 'max_tokens') {
      console.warn('  ⚠️ Hit max_tokens mid-response — consider raising max_tokens');
      break;
    }

    console.warn(`  ⚠️ Unexpected stop_reason: ${response.stop_reason}`);
    break;
  }

  console.warn('⚠️ Agent loop exhausted without end_turn');
  return [];
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Validate env
  const required = [
    'ANTHROPIC_API_KEY',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'SPOTIFY_REFRESH_TOKEN',
  ] as const;

  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing env var: ${key}`);
  }

  const spotify = new SpotifyClient({
    clientId: process.env.SPOTIFY_CLIENT_ID!,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
    refreshToken: process.env.SPOTIFY_REFRESH_TOKEN!,
  });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  // ── Step 1: Build taste profile ──────────────────────────────────────────
  console.log('\n🎵 Fetching Spotify taste profile...');

  const [shortTerm, mediumTerm] = await Promise.all([
    spotify.getTopArtists('short_term'),
    spotify.getTopArtists('medium_term'),
  ]);

  const tasteProfile = buildTasteProfile(shortTerm, mediumTerm);
  console.log(`   Built from ${shortTerm.length} short-term + ${mediumTerm.length} medium-term artists`);

  // ── Step 2: Discover matching concert artists ────────────────────────────
  console.log('\n🔍 Discovering upcoming Chicago concerts...');
  const matchedArtists = await discoverConcertArtists(anthropic, tasteProfile);

  if (matchedArtists.length === 0) {
    console.log('\n⚠️  No matching artists found this week. Playlist unchanged.');
    return;
  }

  console.log(`\n🎤 Matched artists: ${matchedArtists.join(', ')}`);

  // ── Step 3: Fetch top tracks for each matched artist ─────────────────────
  console.log('\n🎵 Fetching tracks from Spotify...');
  const trackUris: string[] = [];

  for (const artistName of matchedArtists) {
    if (trackUris.length >= MAX_PLAYLIST_TRACKS) break;

    const artist = await spotify.searchArtist(artistName);
    if (!artist) {
      console.log(`   ⚠️  Not found on Spotify: "${artistName}"`);
      continue;
    }

    const tracks = await spotify.getArtistTopTracks(artist.id);
    const selected = tracks.slice(0, TRACKS_PER_ARTIST).map((t) => t.uri);
    trackUris.push(...selected);

    console.log(`   ✓ ${artist.name}: ${selected.length} track(s)`);
  }

  if (trackUris.length === 0) {
    console.log('\n⚠️  No matched artists resolved to Spotify tracks. Playlist unchanged.');
    return;
  }

  // ── Step 4: Update playlist ──────────────────────────────────────────────
  console.log(`\n📝 Updating "${PLAYLIST_NAME}"...`);
  const playlistId = await spotify.getOrCreatePlaylist(PLAYLIST_NAME);
  const finalUris = trackUris.slice(0, MAX_PLAYLIST_TRACKS);
  await spotify.replacePlaylistTracks(playlistId, finalUris);

  console.log(`\n✅ Done! ${finalUris.length} tracks from ${matchedArtists.length} artists`);
  console.log(`   https://open.spotify.com/playlist/${playlistId}`);
}

main().catch((err: unknown) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
