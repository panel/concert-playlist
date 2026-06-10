// scripts/get-refresh-token.ts
// Run once locally to get a Spotify refresh token for the agent.
//
// Usage:
//   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=xxx npm run get-token
//
// This starts a local HTTP server on port 8888, opens the Spotify
// authorization URL in your browser, and captures the refresh token.

import http from 'node:http';
import { exec } from 'node:child_process';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;

// Scopes required by the agent
const SCOPES = [
  'user-top-read',        // read taste profile
  'playlist-read-private',
  'playlist-modify-private',
  'playlist-modify-public',
].join(' ');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET before running.');
  process.exit(1);
}

const authUrl =
  `https://accounts.spotify.com/authorize` +
  `?client_id=${CLIENT_ID}` +
  `&response_type=code` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=${encodeURIComponent(SCOPES)}`;

console.log('\nOpening Spotify auth page...');
console.log('If it does not open automatically, visit:\n', authUrl, '\n');

// Open the URL in the default browser
const opener =
  process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
exec(`${opener} "${authUrl}"`);

// Temporary HTTP server to capture the callback
const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/callback')) return;

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');

  if (!code) {
    res.end('No code received. Close this tab and try again.');
    server.close();
    return;
  }

  // Exchange code for tokens
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!tokenResp.ok) {
    const err = await tokenResp.text();
    res.end(`Token exchange failed: ${err}`);
    server.close();
    return;
  }

  const tokens = (await tokenResp.json()) as {
    access_token: string;
    refresh_token: string;
  };

  console.log('\n✅ Success! Add these to GitHub Actions secrets:\n');
  console.log(`SPOTIFY_CLIENT_ID=${CLIENT_ID}`);
  console.log(`SPOTIFY_CLIENT_SECRET=${CLIENT_SECRET}`);
  console.log(`SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log('');

  res.end('Got it — you can close this tab. Check your terminal for the refresh token.');
  server.close();
});

server.listen(PORT, () => {
  console.log(`Waiting for Spotify callback on http://localhost:${PORT}/callback`);
});
