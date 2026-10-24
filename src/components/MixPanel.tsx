import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, AudioLines, Play, Pause, CheckCircle2, RefreshCw } from 'lucide-react';
import { TrackData } from '../types';
import { formatTime } from '../audioEngine';
import { trackColor } from '../colors';

interface MixPanelProps {
  tracks: TrackData[];
  totalDuration: number;
  activeIndex: number;
  onSeek: (seconds: number) => void;
  onExport: () => void;
  exportProgress: number | null;
  mergedUrl: string | null;
  mergedStale: boolean;
  mixPlaying: boolean;
  onMergedPlay: () => void;
}

export default function MixPanel({
  tracks,
  totalDuration,
  activeIndex,
  onSeek,
  onExport,
  exportProgress,
  mergedUrl,
  mergedStale,
  mixPlaying,
  onMergedPlay,
}: MixPanelProps) {
  const isExporting = exportProgress !== null;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [mergedPlaying, setMergedPlaying] = useState(false);
  const [mergedTime, setMergedTime] = useState(0);
  const [mergedDuration, setMergedDuration] = useState(0);

  // Only one thing plays at a time: starting the live mix pauses the merged file.
  useEffect(() => {
    if (mixPlaying) audioRef.current?.pause();
  }, [mixPlaying]);

  useEffect(() => {
    setMergedTime(0);
    setMergedPlaying(false);
  }, [mergedUrl]);

  const toggleMerged = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      onMergedPlay();
      audio.play();
    } else {
      audio.pause();
    }
  };

  let offset = 0;

  return (
    <section className="glass relative overflow-hidden rounded-2xl p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/60 to-transparent" />

      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/40 to-fuchsia-500/30 text-fuchsia-200 ring-1 ring-white/10">
          <AudioLines className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold leading-tight">Your mix</h2>
          <p className="text-xs text-forge-text-dim">Plays top to bottom</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-black/25 px-3 py-2.5 ring-1 ring-white/[0.06]">
          <p className="text-[11px] uppercase tracking-wider text-forge-text-dim">Total length</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight">{formatTime(totalDuration)}</p>
        </div>
        <div className="rounded-xl bg-black/25 px-3 py-2.5 ring-1 ring-white/[0.06]">
          <p className="text-[11px] uppercase tracking-wider text-forge-text-dim">Tracks</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight">{tracks.length}</p>
        </div>
      </div>

      {/* How much of the mix each track takes up */}
      <div className="mt-4 flex h-3 gap-1 overflow-hidden rounded-full">
        {tracks.map((t, i) => (
          <div
            key={t.id}
            className="rounded-full transition-opacity"
            style={{
              flexGrow: Math.max(t.endTime - t.startTime, 0.001),
              flexBasis: 0,
              background: `linear-gradient(to right, ${trackColor(i)}, ${trackColor(i)}aa)`,
              opacity: activeIndex === -1 || activeIndex === i ? 1 : 0.45,
            }}
          />
        ))}
      </div>

      <ol className="mt-4 space-y-1.5">
        {tracks.map((t, i) => {
          const start = offset;
          offset += t.endTime - t.startTime;
          const active = i === activeIndex;
          const color = trackColor(i);
          return (
            <li key={t.id}>
              <button
                onClick={() => onSeek(start)}
                className={`group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm ring-1 transition-colors ${
                  active ? 'bg-white/[0.07] ring-white/10' : 'ring-transparent hover:bg-white/[0.04]'
                }`}
                title="Play the mix from this track"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                  style={{ background: `${color}2e`, color }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-forge-text">{t.fileName}</span>
                {active && mixPlaying ? (
                  <span className="eq flex h-4 shrink-0 items-end gap-[3px]" aria-label="Playing">
                    {[0, 0.3, 0.15].map((d) => (
                      <span key={d} style={{ width: 3, height: 16, background: color, animationDelay: `-${d}s` }} />
                    ))}
                  </span>
                ) : (
                  <Play className="h-3.5 w-3.5 shrink-0 text-forge-text-dim opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="my-5 h-px bg-white/[0.07]" />

      <p className="mb-3 text-xs leading-relaxed text-forge-text-dim">
        Combine every track, with your trims and fades, into a single MP3.
      </p>

      <button
        onClick={onExport}
        disabled={isExporting || tracks.length === 0}
        className="relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/25 transition-opacity hover:opacity-90 disabled:cursor-not-allowed"
      >
        {isExporting && (
          <span
            className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-300"
            style={{ width: `${exportProgress}%` }}
          />
        )}
        <span className="relative flex items-center gap-2">
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Exporting… {exportProgress}%
            </>
          ) : mergedUrl && mergedStale ? (
            <>
              <RefreshCw className="h-4 w-4" />
              Update merged MP3
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Merge to MP3
            </>
          )}
        </span>
      </button>

      {mergedUrl && (
        <div
          className={`mt-4 rounded-xl border p-3 animate-fade-in-up ${
            mergedStale ? 'border-amber-400/25 bg-amber-400/[0.06]' : 'border-emerald-400/25 bg-emerald-400/[0.06]'
          }`}
        >
          <audio
            ref={audioRef}
            src={mergedUrl}
            preload="metadata"
            onPlay={() => setMergedPlaying(true)}
            onPause={() => setMergedPlaying(false)}
            onEnded={() => setMergedPlaying(false)}
            onTimeUpdate={(e) => setMergedTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setMergedDuration(e.currentTarget.duration)}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMerged}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition-transform hover:scale-105 active:scale-95"
              aria-label={mergedPlaying ? 'Pause merged MP3' : 'Play merged MP3'}
            >
              {mergedPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-forge-text">
                {!mergedStale && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                Merged MP3
              </p>
              <p className="text-xs tabular-nums text-forge-text-muted">
                {formatTime(mergedTime)} / {formatTime(mergedDuration)}
                {mergedStale && <span className="text-amber-300"> · tracks changed since</span>}
              </p>
            </div>
            <a
              href={mergedUrl}
              download={`audioforge-mix-${new Date().toISOString().slice(0, 10)}.mp3`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-forge-text transition-colors hover:bg-white/[0.12]"
              aria-label="Download merged MP3"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
          <input
            type="range"
            min={0}
            max={mergedDuration || 0}
            step={0.1}
            value={mergedTime}
            onChange={(e) => {
              const t = parseFloat(e.target.value);
              if (audioRef.current) audioRef.current.currentTime = t;
              setMergedTime(t);
            }}
            className="mt-3 w-full"
            style={{
              ['--track-color' as string]: '#10b981',
              background: `linear-gradient(to right, #10b981 ${mergedDuration ? (mergedTime / mergedDuration) * 100 : 0}%, rgba(255,255,255,0.1) 0)`,
              borderRadius: '3px',
              height: '6px',
            }}
            aria-label="Merged MP3 position"
          />
        </div>
      )}
    </section>
  );
}
