// src/site.ts
// Renders the static GitHub Pages site (docs/index.html) from the week's
// discovered shows. Pure string templating — no framework, no client JS.

export interface Show {
  artist: string;
  venue: string;
  date: string; // YYYY-MM-DD
  url?: string;
}

export interface ArtistEntry {
  name: string; // canonical Spotify artist name
  spotifyId: string | null; // null when the artist wasn't found on Spotify
  shows: Show[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function isSafeUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function renderShow(show: Show): string {
  const date = `<span class="date">${escapeHtml(formatDate(show.date))}</span>`;
  const venue =
    show.url && isSafeUrl(show.url)
      ? `<a href="${escapeHtml(show.url)}" target="_blank" rel="noopener">${escapeHtml(show.venue)}</a>`
      : escapeHtml(show.venue);
  return `<li>${date} · ${venue}</li>`;
}

function renderArtist(entry: ArtistEntry): string {
  const player = entry.spotifyId
    ? `<iframe src="https://open.spotify.com/embed/artist/${encodeURIComponent(entry.spotifyId)}?utm_source=generator&theme=0"
        width="100%" height="352" frameborder="0" loading="lazy" allowfullscreen
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        title="Spotify player: ${escapeHtml(entry.name)}"></iframe>`
    : `<p class="no-player">Not on Spotify</p>`;

  return `
    <section class="artist">
      <h2>${escapeHtml(entry.name)}</h2>
      <ul class="shows">
        ${entry.shows.map(renderShow).join('\n        ')}
      </ul>
      ${player}
    </section>`;
}

export function renderSite(artists: ArtistEntry[], generatedAt: Date): string {
  const updated = generatedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chicago Shows This Month</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2rem 1rem 4rem;
    background: #121212;
    color: #e8e8e8;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.5;
  }
  main { max-width: 640px; margin: 0 auto; }
  header { margin-bottom: 2.5rem; }
  h1 { font-size: 1.75rem; margin: 0 0 0.25rem; }
  .subtitle { color: #9a9a9a; margin: 0; font-size: 0.95rem; }
  .artist { margin-bottom: 3rem; }
  h2 { font-size: 1.2rem; margin: 0 0 0.5rem; }
  .shows { list-style: none; padding: 0; margin: 0 0 1rem; }
  .shows li { padding: 0.15rem 0; color: #c8c8c8; }
  .date { color: #1db954; font-variant-numeric: tabular-nums; }
  .shows a { color: #c8c8c8; }
  .no-player { color: #777; font-style: italic; }
  iframe { border-radius: 12px; border: 0; }
  footer { margin-top: 3rem; color: #777; font-size: 0.85rem; }
  footer a { color: #9a9a9a; }
</style>
</head>
<body>
<main>
  <header>
    <h1>🎸 Chicago Shows</h1>
    <p class="subtitle">Upcoming concerts matched to my taste · updated ${escapeHtml(updated)}</p>
  </header>
${artists.map(renderArtist).join('\n')}
  <footer>
    Generated weekly by Claude + web search · <a href="https://github.com/panel/concert-playlist">source</a>
  </footer>
</main>
</body>
</html>
`;
}
