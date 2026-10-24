import { useRef, useState } from 'react';
import { Play, Pause, Download, Loader2 } from 'lucide-react';
import { TrackData } from '../types';
import { formatTime } from '../audioEngine';
import { trackColor } from '../colors';

interface PlayerBarProps {
  tracks: TrackData[];
  totalDuration: number;
  position: number;
  isPlaying: boolean;
  activeIndex: number;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onExport: () => void;
  exportProgress: number | null;
}

export default function PlayerBar({
  tracks,
  totalDuration,
  position,
  isPlaying,
  activeIndex,
  onToggle,
  onSeek,
  onExport,
  exportProgress,
}: PlayerBarProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragPos, setDragPos] = useState<number | null>(null);

  const isExporting = exportProgress !== null;
  const shownPos = dragPos ?? position;
  const playheadPct = totalDuration > 0 ? (shownPos / totalDuration) * 100 : 0;

  const timeAt = (clientX: number) => {
    const rect = timelineRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * totalDuration;
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3 sm:px-5 sm:pb-5 lg:px-10">
      <div className="glass mx-auto flex max-w-[1920px] items-center gap-3 rounded-2xl px-3 py-3 sm:gap-4 sm:px-4 animate-fade-in-up">
        <button
          onClick={onToggle}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/30 transition-transform hover:scale-105 active:scale-95"
          aria-label={isPlaying ? 'Pause mix' : 'Play mix'}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between text-xs tabular-nums text-forge-text-muted">
            <span>
              <span className="text-forge-text">{formatTime(shownPos)}</span> / {formatTime(totalDuration)}
            </span>
            <span className="truncate pl-3 text-forge-text-dim">
              {activeIndex >= 0 && tracks[activeIndex] ? tracks[activeIndex].fileName : 'Full mix'}
            </span>
          </div>

          {/* Timeline: one segment per trimmed track, click or drag to seek */}
          <div
            ref={timelineRef}
            className="relative flex h-9 cursor-pointer touch-none select-none gap-0.5 overflow-hidden rounded-lg bg-black/30"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragPos(timeAt(e.clientX));
            }}
            onPointerMove={(e) => {
              if (dragPos !== null) setDragPos(timeAt(e.clientX));
            }}
            onPointerUp={(e) => {
              if (dragPos === null) return;
              onSeek(timeAt(e.clientX));
              setDragPos(null);
            }}
            onPointerCancel={() => setDragPos(null)}
            role="slider"
            aria-label="Mix position"
            aria-valuemin={0}
            aria-valuemax={totalDuration}
            aria-valuenow={shownPos}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') onSeek(position - 5);
              if (e.key === 'ArrowRight') onSeek(position + 5);
              if (e.key === ' ') {
                e.preventDefault();
                onToggle();
              }
            }}
          >
            {tracks.map((track, i) => {
              const len = track.endTime - track.startTime;
              const color = trackColor(i);
              const fadeInPct = len > 0 ? (Math.min(track.fadeIn, len / 2) / len) * 100 : 0;
              const fadeOutPct = len > 0 ? (Math.min(track.fadeOut, len / 2) / len) * 100 : 0;
              return (
                <div
                  key={track.id}
                  className="relative h-full min-w-[2px] transition-opacity"
                  style={{
                    flexGrow: Math.max(len, 0.001),
                    flexBasis: 0,
                    background: `linear-gradient(to right, ${color}26 0%, ${color}66 ${fadeInPct}%, ${color}66 ${100 - fadeOutPct}%, ${color}26 100%)`,
                    borderLeft: `3px solid ${color}`,
                    opacity: activeIndex === -1 || activeIndex === i ? 1 : 0.6,
                  }}
                  title={`${i + 1}. ${track.fileName}`}
                >
                  <span className="pointer-events-none absolute inset-0 truncate px-2 text-[11px] font-medium leading-9 text-white/85">
                    {i + 1}. {track.fileName}
                  </span>
                </div>
              );
            })}
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)]"
              style={{ left: `${playheadPct}%` }}
            />
          </div>
        </div>

        <button
          onClick={onExport}
          disabled={isExporting || tracks.length === 0}
          className="flex h-12 shrink-0 items-center gap-2 rounded-xl border border-white/10 lg:hidden bg-white/[0.06] px-3 text-sm font-semibold text-forge-text transition-colors hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
          aria-label="Export MP3"
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-forge-accent-light" />
              <span className="tabular-nums">{exportProgress}%</span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Merge</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
