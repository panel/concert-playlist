// src/site.ts
// Renders the static GitHub Pages site (docs/index.html) from the week's
// discovered shows. Pure string templating — no framework, no client JS.
//
// Look: black & white punk zine — Raymond Pettibon / Goo-era Sonic Youth.
// Xeroxed cut-and-paste clippings, marker lettering, typewriter body text.

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
  const date = `<span class="date">${escapeHtml(formatDate(show.date)).toUpperCase()}</span>`;
  const venue =
    show.url && isSafeUrl(show.url)
      ? `<a href="${escapeHtml(show.url)}" target="_blank" rel="noopener">${escapeHtml(show.venue.toUpperCase())}</a>`
      : escapeHtml(show.venue.toUpperCase());
  return `<li>${date} ${venue}</li>`;
}

function renderArtist(entry: ArtistEntry, index: number): string {
  const player = entry.spotifyId
    ? `<iframe src="https://open.spotify.com/embed/artist/${encodeURIComponent(entry.spotifyId)}?utm_source=generator&theme=0"
        width="100%" height="352" frameborder="0" loading="lazy" allowfullscreen
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        title="Spotify player: ${escapeHtml(entry.name)}"></iframe>`
    : `<p class="no-player">NOT ON SPOTIFY. TOO PUNK. SEE THEM LIVE.</p>`;

  return `
    <section class="clipping" data-no="${String(index + 1).padStart(2, '0')}">
      <h2>${escapeHtml(entry.name)}</h2>
      <ul class="shows">
        ${entry.shows.map(renderShow).join('\n        ')}
      </ul>
      ${player}
    </section>`;
}

export function renderSite(artists: ArtistEntry[], generatedAt: Date): string {
  const updated = generatedAt
    .toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Chicago',
    })
    .toUpperCase();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CHICAGO SHOWS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Permanent+Marker&family=Special+Elite&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2.5rem 1rem 5rem;
    background: #f4f1ea;
    /* xerox halftone grain */
    background-image: radial-gradient(#00000014 1px, transparent 1.5px);
    background-size: 5px 5px;
    color: #0a0a0a;
    font-family: "Special Elite", "Courier New", monospace;
    line-height: 1.5;
  }
  main { max-width: 640px; margin: 0 auto; }

  header {
    margin-bottom: 3.5rem;
    border: 4px solid #0a0a0a;
    background: #0a0a0a;
    color: #f4f1ea;
    padding: 1.5rem 1.25rem 1.25rem;
    transform: rotate(-1deg);
    box-shadow: 10px 10px 0 #0a0a0a33;
  }
  h1 {
    font-family: "Permanent Marker", cursive;
    font-size: clamp(2.6rem, 11vw, 4.5rem);
    line-height: 0.95;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .scrawl {
    font-family: "Permanent Marker", cursive;
    font-size: 1.05rem;
    margin: 1rem 0 0;
    transform: rotate(0.5deg);
  }
  .stamp {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.1rem 0.5rem;
    border: 2px solid #f4f1ea;
    font-size: 0.8rem;
    letter-spacing: 0.2em;
  }

  .clipping {
    position: relative;
    background: #fffdf7;
    border: 3px solid #0a0a0a;
    box-shadow: 7px 7px 0 #0a0a0a;
    padding: 1.5rem 1.25rem 1.25rem;
    margin-bottom: 3rem;
  }
  /* cut-and-paste: every clipping pasted at a slightly different angle */
  .clipping:nth-child(4n+1) { transform: rotate(-1.1deg); }
  .clipping:nth-child(4n+2) { transform: rotate(0.9deg); }
  .clipping:nth-child(4n+3) { transform: rotate(-0.5deg); }
  .clipping:nth-child(4n+4) { transform: rotate(1.2deg); }
  /* torn-tape number tab */
  .clipping::before {
    content: "NO. " attr(data-no);
    position: absolute;
    top: -1rem;
    right: 1rem;
    background: #0a0a0a;
    color: #f4f1ea;
    font-size: 0.75rem;
    letter-spacing: 0.25em;
    padding: 0.15rem 0.6rem;
    transform: rotate(2deg);
  }
  h2 {
    font-family: "Permanent Marker", cursive;
    font-size: 1.9rem;
    line-height: 1;
    margin: 0 0 0.75rem;
    text-transform: uppercase;
  }
  .shows { list-style: none; padding: 0; margin: 0 0 1.1rem; }
  .shows li { padding: 0.2rem 0; font-size: 0.95rem; }
  .date {
    background: #0a0a0a;
    color: #f4f1ea;
    padding: 0.05rem 0.45rem;
    margin-right: 0.5rem;
    white-space: nowrap;
  }
  .shows a {
    color: #0a0a0a;
    text-decoration-thickness: 3px;
    text-underline-offset: 3px;
  }
  .shows a:hover { background: #0a0a0a; color: #f4f1ea; }
  .no-player {
    font-family: "Permanent Marker", cursive;
    border: 2px dashed #0a0a0a;
    padding: 0.75rem;
    margin: 0;
  }
  /* xerox the players: ink only */
  iframe { border: 3px solid #0a0a0a; filter: grayscale(1) contrast(1.15); display: block; }

  footer {
    margin-top: 4rem;
    text-align: center;
    font-size: 0.85rem;
    letter-spacing: 0.1em;
    transform: rotate(-0.6deg);
  }
  footer a { color: #0a0a0a; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Chicago<br>Shows</h1>
    <p class="scrawl">we checked every calendar in town. we matched every band to the records you actually play. now get to the show.</p>
    <span class="stamp">ISSUE OF ${escapeHtml(updated)}</span>
  </header>
${artists.map(renderArtist).join('\n')}
  <footer>
    XEROXED WEEKLY BY A ROBOT · <a href="https://github.com/panel/concert-playlist">SOURCE</a>
  </footer>
</main>
</body>
</html>
`;
}
