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

    const resp = await fetch('https://accounts.spotify.com/api/token', {
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

    const resp = await fetch(`https://api.spotify.com/v1${path}`, {
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

  async searchArtist(name: string): Promise<Artist | null> {
    const q = encodeURIComponent(name);
    const data = await this.request<{ artists: { items: Artist[] } }>(
      `/search?q=${q}&type=artist&limit=1`,
    );
    return data.artists.items[0] ?? null;
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
   * or creates a new one. Only checks the first 50 playlists; safe for
   * personal accounts.
   */
  async getOrCreatePlaylist(name: string): Promise<string> {
    const userId = await this.getUserId();

    const data = await this.request<{
      items: { id: string; name: string; owner: { id: string } }[];
    }>('/me/playlists?limit=50');

    const existing = data.items.find(
      (p) => p.name === name && p.owner.id === userId,
    );
    if (existing) return existing.id;

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
