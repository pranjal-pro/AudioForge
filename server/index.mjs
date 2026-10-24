import express from 'express';
import youtubedl from 'youtube-dl-exec';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 4000;
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

// yt-dlp needs a JS runtime to solve YouTube's player challenges. Without one it
// falls back to a single client, which datacenter IPs (e.g. Render) get blocked on
// ("Failed to extract any player response"). Reuse the Node running this server.
// Optional: YTDLP_COOKIES=/path/to/cookies.txt for IPs that hit YouTube's bot check.
const YTDLP_FLAGS = {
  jsRuntimes: `node:${process.execPath}`,
  ...(process.env.YTDLP_COOKIES && { cookies: process.env.YTDLP_COOKIES }),
  ...(process.env.YTDLP_DEBUG && { verbose: true }),
};

const app = express();

// Quick deploy check: is yt-dlp runnable, which version, which JS runtime?
app.get('/api/health', async (_req, res) => {
  try {
    const version = String(await youtubedl('', { version: true })).trim();
    res.json({ ok: true, ytDlp: version, node: process.version, jsRuntime: YTDLP_FLAGS.jsRuntimes, cookies: !!YTDLP_FLAGS.cookies });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.stderr || err.message).slice(0, 500) });
  }
});

// Stream YouTube audio straight from yt-dlp. m4a (AAC) needs no ffmpeg and
// decodes in every browser.
app.get('/api/youtube', (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!/^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//.test(url)) {
    return res.status(400).json({ error: 'That does not look like a YouTube link.' });
  }

  const subprocess = youtubedl.exec(
    url,
    { ...YTDLP_FLAGS, format: 'bestaudio[ext=m4a]/bestaudio', output: '-', noPlaylist: true, quiet: !YTDLP_FLAGS.verbose },
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let stderr = '';
  subprocess.stderr.on('data', (chunk) => (stderr += chunk));
  subprocess.stdout.once('data', () => res.type('audio/mp4'));
  // Don't let pipe end the response: on failure we still need to send the error.
  subprocess.stdout.pipe(res, { end: false });

  // Stop yt-dlp if the browser cancels the import.
  res.on('close', () => subprocess.kill());

  subprocess.then(() => res.end()).catch(() => {
    // Full yt-dlp output goes to the server log (Render → Logs) for diagnosis.
    if (!res.destroyed) console.error(`[youtube] yt-dlp failed for ${url}:\n${stderr.trim()}`);
    if (res.headersSent) return res.destroy();
    const message = stderr.split('\n').find((l) => l.startsWith('ERROR:')) || 'Could not fetch audio from YouTube.';
    res.status(502).json({ error: message.replace(/^ERROR:\s*(\[\w+\]\s*[\w-]+:\s*)?/, '') });
  });
});

// In production, serve the built front end from the same server.
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
}

app.listen(PORT, (err) => {
  if (err) {
    console.error(`Port ${PORT} is busy (is another server running?). Set PORT=... to use a different one.`);
    process.exit(1);
  }
  console.log(`AudioForge server on http://localhost:${PORT}`);
  youtubedl('', { version: true })
    .then((v) => console.log(`yt-dlp ${String(v).trim()} · JS runtime ${YTDLP_FLAGS.jsRuntimes}`))
    .catch((e) => console.error('yt-dlp is not runnable:', String(e.stderr || e.message).trim()));
});
