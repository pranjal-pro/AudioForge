import { useCallback, useRef, useState } from 'react';
import { Youtube, AlertCircle, Loader2, X, CheckCircle2 } from 'lucide-react';
import { extractYouTubeId } from '../audioEngine';
import { YouTubeImportState } from '../types';

interface YouTubeImporterProps {
  onImported: (file: File, title: string) => Promise<void> | void;
  disabled?: boolean;
  /** Bigger field for the start screen */
  large?: boolean;
}

const ENDPOINT = '/api/youtube';

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const json = JSON.parse(text);
    if (json.error) return json.error;
  } catch {
    // not JSON
  }
  if (response.status === 404 || response.status === 502 || response.status === 504) {
    if (!text || text.length > 300) return 'The import server is not reachable. Make sure it is running (npm run dev).';
  }
  return text && text.length < 300 ? text : `Import server returned ${response.status}`;
}

export default function YouTubeImporter({ onImported, disabled, large }: YouTubeImporterProps) {
  const h = large ? 'h-14 text-base' : 'h-10 text-sm';
  const [url, setUrl] = useState('');
  const [state, setState] = useState<YouTubeImportState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleImport = useCallback(async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    const videoId = extractYouTubeId(trimmedUrl);
    if (!videoId) {
      setState({
        status: 'error',
        url: trimmedUrl,
        videoId: '',
        progress: 0,
        message: '',
        error: 'That does not look like a YouTube video link.',
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    setState({
      status: 'fetching-info',
      url: trimmedUrl,
      videoId,
      thumbnail,
      progress: 5,
      message: 'Looking up video…',
    });

    try {
      let response: Response;
      try {
        response = await fetch(`${ENDPOINT}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`, {
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        throw new Error('The import server is not reachable. Make sure it is running (npm run dev).');
      }

      if (!response.ok) throw new Error(await readErrorMessage(response));

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('audio/') && !contentType.includes('octet-stream')) {
        throw new Error(await readErrorMessage(response));
      }

      const title = `YouTube · ${videoId}`;
      setState((s) => (s ? { ...s, status: 'downloading', message: 'Downloading audio…', progress: 10 } : s));

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to read the audio stream.');

      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        // Size isn't known up front, so ease toward 85% as bytes arrive.
        const pct = 10 + Math.round(75 * (1 - Math.exp(-received / 4_000_000)));
        setState((s) => (s ? { ...s, progress: pct } : s));
      }

      if (received < 1024) throw new Error('The downloaded audio was empty. Try again.');

      setState((s) => (s ? { ...s, status: 'decoding', message: 'Decoding audio…', progress: 90 } : s));

      const file = new File(chunks as BlobPart[], `youtube-${videoId}.m4a`, { type: contentType.split(';')[0] });
      await onImported(file, title);

      setState((s) => (s ? { ...s, status: 'done', message: 'Added', progress: 100 } : s));
      setUrl('');
      setTimeout(() => setState((s) => (s?.status === 'done' ? null : s)), 2000);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setState({
        status: 'error',
        url: trimmedUrl,
        videoId,
        progress: 0,
        message: '',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [url, onImported]);

  const handleCancel = () => {
    abortRef.current?.abort();
    setState(null);
  };

  const isBusy = !!state && (state.status === 'fetching-info' || state.status === 'downloading' || state.status === 'decoding');
  const isError = state?.status === 'error';

  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled && !isBusy) handleImport();
        }}
      >
        <div className="relative flex-1">
          <Youtube className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-red-400 ${large ? 'left-4 h-5 w-5' : 'left-3 h-4 w-4'}`} />
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (isError) setState(null);
            }}
            placeholder="Paste a YouTube link…"
            disabled={disabled || isBusy}
            className={`${h} ${large ? 'rounded-xl pl-12' : 'rounded-lg pl-9'} w-full border border-white/10 bg-black/30 pr-3 text-forge-text placeholder-forge-text-dim transition-colors focus:border-forge-accent focus:outline-none disabled:opacity-50`}
            spellCheck={false}
            aria-label="YouTube URL"
          />
        </div>
        {isBusy ? (
          <button
            type="button"
            onClick={handleCancel}
            className={`${h} ${large ? 'rounded-xl px-6' : 'rounded-lg px-3.5'} flex items-center gap-1.5 border border-forge-border font-medium text-forge-text-muted transition-colors hover:border-forge-error/50 hover:text-forge-error`}
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || !url.trim()}
            className={`${h} ${large ? 'rounded-xl px-8' : 'rounded-lg px-5'} bg-gradient-to-r from-violet-600 to-fuchsia-500 font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {isError ? 'Retry' : 'Add'}
          </button>
        )}
      </form>

      {state && isError && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-forge-error animate-fade-in-up">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {state.error}
        </p>
      )}

      {state && !isError && (
        <div className="flex items-center gap-2.5 rounded-lg bg-black/30 p-1.5 animate-fade-in-up">
          {state.thumbnail && (
            <img
              src={state.thumbnail}
              alt=""
              className="h-9 w-16 shrink-0 rounded bg-forge-surface object-cover"
            />
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs">
              {state.status === 'done' ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-forge-success" />
              ) : (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-forge-accent-light" />
              )}
              <span className="truncate font-medium text-forge-text">{state.message}</span>
              <span className="ml-auto shrink-0 tabular-nums text-forge-text-muted">
                {state.status === 'done' ? '' : `${state.progress}%`}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-forge-surface">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  state.status === 'done' ? 'bg-forge-success' : 'bg-forge-accent'
                }`}
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
