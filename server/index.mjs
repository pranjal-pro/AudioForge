import express from 'express';
import youtubedl from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';
import { timingSafeEqual } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 4000;
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

// yt-dlp needs a JS runtime to solve YouTube's player challenges. Without one it
// falls back to a single client, which datacenter IPs (e.g. Render) get blocked on
// ("Failed to extract any player response"). Reuse the Node running this server.
// Optional: YTDLP_COOKIES=/path/to/cookies.txt for IPs that hit YouTube's bot check,
// and YTDLP_PROXY=http://user:pass@host:port when the host's IP is blocked outright.
// yt-dlp writes the cookie jar back on exit, and secret files (e.g. Render's
// /etc/secrets) are read-only, so work from a writable copy.
function writableCookies(file) {
  if (!file) return undefined;
  const copy = path.join(tmpdir(), 'yt-cookies.txt');
  rmSync(copy, { force: true });
  writeFileSync(copy, readFileSync(file), { mode: 0o600 });
  return copy;
}
const cookiesFile = writableCookies(process.env.YTDLP_COOKIES);

const YTDLP_FLAGS = {
  jsRuntimes: `node:${process.execPath}`,
  ...(cookiesFile && { cookies: cookiesFile }),
  ...(process.env.YTDLP_PROXY && { proxy: process.env.YTDLP_PROXY }),
  ...(process.env.YTDLP_DEBUG && { verbose: true }),
};

// HTTP Basic Auth: set AUTH_USER and AUTH_PASS to lock the whole app (pages and
// every /api route) behind a browser login prompt, e.g. on a public deploy that
// uses your YouTube cookies. Leave them unset to disable auth (local dev).
const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_PASS = process.env.AUTH_PASS || '';
const AUTH_ON = !!(AUTH_USER && AUTH_PASS);

const safeEqual = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const app = express();

if (AUTH_ON) {
  app.use((req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString();
      const sep = decoded.indexOf(':');
      const userOk = sep >= 0 && safeEqual(decoded.slice(0, sep), AUTH_USER);
      const passOk = sep >= 0 && safeEqual(decoded.slice(sep + 1), AUTH_PASS);
      if (userOk && passOk) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="AudioForge", charset="UTF-8"');
    res.status(401).send('Authentication required');
  });
}

// Quick deploy check: is yt-dlp runnable, which version, which JS runtime?
app.get('/api/health', async (_req, res) => {
  try {
    const version = String(await youtubedl('', { version: true })).trim();
    res.json({ ok: true, ytDlp: version, node: process.version, jsRuntime: YTDLP_FLAGS.jsRuntimes, cookies: !!YTDLP_FLAGS.cookies, proxy: !!YTDLP_FLAGS.proxy, auth: AUTH_ON });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.stderr || err.message).slice(0, 500) });
  }
});

// Fetch YouTube audio as m4a. Which formats YouTube offers depends on the client
// and IP (cloud hosts with cookies may get only combined/HLS streams), so take any
// stream with audio and let the bundled ffmpeg extract it to m4a (AAC), which
// every browser can decode. Audio-only m4a is preferred and is only remuxed.
const AUDIO_FORMAT = 'bestaudio[ext=m4a]/bestaudio/best[acodec!=none][height<=480]/best[acodec!=none]';

app.get('/api/youtube', (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!/^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//.test(url)) {
    return res.status(400).json({ error: 'That does not look like a YouTube link.' });
  }

  const workDir = mkdtempSync(path.join(tmpdir(), 'audioforge-'));
  const cleanup = () => rmSync(workDir, { recursive: true, force: true });

  const subprocess = youtubedl.exec(
    url,
    {
      ...YTDLP_FLAGS,
      format: AUDIO_FORMAT,
      extractAudio: true,
      audioFormat: 'm4a',
      ffmpegLocation: ffmpegPath,
      output: path.join(workDir, 'audio.%(ext)s'),
      noPlaylist: true,
      quiet: !YTDLP_FLAGS.verbose,
    },
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );

  let stderr = '';
  subprocess.stderr.on('data', (chunk) => (stderr += chunk));

  // Stop yt-dlp if the browser cancels the import.
  res.on('close', () => {
    subprocess.kill();
    cleanup();
  });

  subprocess
    .then(() => {
      const file = readdirSync(workDir).find((f) => f.endsWith('.m4a'));
      if (!file) throw new Error('yt-dlp finished but produced no m4a file');
      res.type('audio/mp4').sendFile(path.join(workDir, file), (err) => {
        if (err && !res.headersSent) res.status(500).json({ error: 'Could not send the audio file.' });
        cleanup();
      });
    })
    .catch((err) => {
      if (res.destroyed) return; // cancelled by the browser
      // Full yt-dlp output goes to the server log (Render → Logs) for diagnosis.
      console.error(`[youtube] yt-dlp failed for ${url}:\n${stderr.trim() || err.message}`);
      const message = stderr.split('\n').find((l) => l.startsWith('ERROR:')) || 'Could not fetch audio from YouTube.';
      res.status(502).json({ error: message.replace(/^ERROR:\s*(\[\w+\]\s*[\w-]+:\s*)?/, '') });
      cleanup();
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
  console.log(`AudioForge server on http://localhost:${PORT}${AUTH_ON ? ' (basic auth on)' : ''}`);
  youtubedl('', { version: true })
    .then((v) => console.log(`yt-dlp ${String(v).trim()} · JS runtime ${YTDLP_FLAGS.jsRuntimes}`))
    .catch((e) => console.error('yt-dlp is not runnable:', String(e.stderr || e.message).trim()));
});
