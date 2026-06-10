// src/spotify.ts
// Thin Spotify REST client using the refresh token OAuth pattern.
// No SDK dependency — just native fetch (Node 18+).

export interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface Artist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
}

export interface Track {
  id: string;
  name: string;
  uri: string;
  artists: { name: string }[];
  album: { name: string };
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

const MAX_RETRIES = 3;

/**
 * Fetch with retry on 429 (honoring Retry-After) and 5xx responses.
 * Network-level errors (fetch rejections) are also retried.
 */
async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, options);
      if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(resp.headers.get('retry-after'));
        const delayMs = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
        console.warn(`   Spotify ${resp.status}, retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return resp;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
    }
  }
  throw lastError;
}

export class SpotifyClient {
  private config: SpotifyConfig;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(config: SpotifyConfig) {
    this.config = config;
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiry - 60_000) {
      return this.accessToken;
    }

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    const resp = await fetchWithRetry('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.config.refreshToken,
      }),
    });

    if (!resp.ok) {
      throw new Error(`Spotify token refresh failed: ${resp.status} — ${await resp.text()}`);
    }

    const data = (await resp.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();

    const resp = await fetchWithRetry(`https://api.spotify.com/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });

    if (resp.status === 204) return undefined as unknown as T;

    if (!resp.ok) {
      throw new Error(
        `Spotify API error: ${resp.status} ${path}\n${await resp.text()}`,
      );
    }

    return resp.json() as Promise<T>;
  }

  // ─── Taste profile ────────────────────────────────────────────────────────

  async getTopArtists(
    timeRange: 'short_term' | 'medium_term' | 'long_term',
    limit = 20,
  ): Promise<Artist[]> {
    const data = await this.request<{ items: Artist[] }>(
      `/me/top/artists?time_range=${timeRange}&limit=${limit}`,
    );
    return data.items;
  }

  // ─── Artist & track lookup ────────────────────────────────────────────────

  /**
   * Searches for an artist and verifies the top result's name actually matches
   * the query (case/diacritic-insensitive). Spotify's top hit for an unknown
   * name can be a different popular artist or a tribute act.
   */
  async searchArtist(name: string): Promise<Artist | null> {
    const q = encodeURIComponent(name);
    const data = await this.request<{ artists: { items: Artist[] } }>(
      `/search?q=${q}&type=artist&limit=5`,
    );

    const normalize = (s: string) =>
      s
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase();

    const target = normalize(name);
    return data.artists.items.find((a) => normalize(a.name) === target) ?? null;
  }

  async getArtistTopTracks(artistId: string, market = 'US'): Promise<Track[]> {
    const data = await this.request<{ tracks: Track[] }>(
      `/artists/${artistId}/top-tracks?market=${market}`,
    );
    return data.tracks;
  }

  // ─── Playlist management ──────────────────────────────────────────────────

  async getUserId(): Promise<string> {
    const data = await this.request<{ id: string }>('/me');
    return data.id;
  }

  /**
   * Returns the playlist ID for an existing playlist with the given name,
   * or creates a new one. Pages through all of the user's playlists so a
   * match beyond the first 50 doesn't cause a duplicate.
   */
  async getOrCreatePlaylist(name: string): Promise<string> {
    const userId = await this.getUserId();

    let next: string | null = '/me/playlists?limit=50';
    while (next) {
      const data: {
        items: { id: string; name: string; owner: { id: string } }[];
        next: string | null;
      } = await this.request(next);

      const existing = data.items.find(
        (p) => p.name === name && p.owner.id === userId,
      );
      if (existing) return existing.id;

      next = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
    }

    const created = await this.request<{ id: string }>(
      `/users/${userId}/playlists`,
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          description:
            'Weekly update: Chicago concerts that match your taste. Curated by Claude + Anthropic web search.',
          public: false,
        }),
      },
    );

    return created.id;
  }

  /**
   * Replaces all tracks in the playlist with the provided URIs.
   * Spotify's PUT endpoint accepts max 100 URIs; we stay well under.
   */
  async replacePlaylistTracks(playlistId: string, uris: string[]): Promise<void> {
    await this.request(`/playlists/${playlistId}/tracks`, {
      method: 'PUT',
      body: JSON.stringify({ uris }),
    });
  }
}
