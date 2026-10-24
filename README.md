# AudioForge

Trim, fade, reorder and merge audio tracks into a single MP3, right in the browser. Add tracks from local MP3/M4A files or straight from a YouTube link.

## Quick start

Requires **Node 20+** (`nvm use` picks up `.nvmrc`).

```bash
npm install     # also downloads the yt-dlp binary
npm run dev     # front end on http://localhost:5173, API on :4000
```

### Production

```bash
npm run build
npm start       # serves the app and the API on http://localhost:4000 (override with PORT=...)
```

## How it works

- **Audio editing** happens entirely in the browser: files are decoded with the Web Audio API, trimmed and faded, merged into one buffer, and encoded to a 128 kbps MP3 with lamejs.
- **YouTube import**: `server/index.mjs` is a small Express server with one endpoint, `GET /api/youtube?url=...`. It runs `yt-dlp` (via `youtube-dl-exec`) and streams the best m4a audio track back. ffmpeg isn't needed. In dev, Vite proxies `/api` to this server.

## Features

- Add tracks by dropping MP3/M4A files or pasting a YouTube link
- **Live mix preview**: play all tracks back to back with your trims and fades while you edit. Click the timeline to jump anywhere
- Waveform per track with draggable trim handles and precise timestamp inputs
- Fade in/out per track
- Reorder by dragging or with the arrow buttons
- Merge to MP3, play the merged file in the app, then download it

## Project structure

```
server/index.mjs            — Express server: YouTube import API + serves dist/ in production
src/
  App.tsx                   — App state and layout
  audioEngine.ts            — Decode, trim, fade, merge, MP3 encode, time helpers
  components/
    UploadZone.tsx          — Add audio card: file drop + YouTube link
    YouTubeImporter.tsx     — YouTube link import with progress and errors
    TrackCard.tsx           — Per-track waveform, trim and fade controls
    TimeInput.tsx           — Editable timestamp input
    PlayerBar.tsx           — Floating mix player and timeline
    MixPanel.tsx            — Sidebar mix overview, merge and merged-MP3 player
  useMixPreview.ts          — Live playback of the whole mix (Web Audio scheduling)
```

## Notes

- Only import content you have the rights to use; downloading may violate YouTube's Terms of Service.
- If YouTube imports start failing, fetch the latest yt-dlp with `npm rebuild youtube-dl-exec`.
- All decoded audio is held in memory, so very long or very many tracks can hit browser memory limits.
