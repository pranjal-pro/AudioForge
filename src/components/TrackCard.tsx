import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  Trash2,
  Music,
  GripVertical,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import { TrackData } from '../types';
import { formatTime } from '../audioEngine';
import { trackColor } from '../colors';
import TimeInput from './TimeInput';

interface TrackCardProps {
  track: TrackData;
  index: number;
  total: number;
  isActive?: boolean;
  onPlayStart?: () => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onUpdateTime: (id: string, startTime: number, endTime: number) => void;
  onUpdateFade: (id: string, fadeIn: number, fadeOut: number) => void;
  onDragReorder: (draggedId: string, targetId: string) => void;
}

export default function TrackCard({
  track,
  index,
  total,
  isActive,
  onPlayStart,
  onRemove,
  onMoveUp,
  onMoveDown,
  onUpdateTime,
  onUpdateFade,
  onDragReorder,
}: TrackCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveformWrapperRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [dragHandle, setDragHandle] = useState<'start' | 'end' | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const [startError, setStartError] = useState('');
  const [endError, setEndError] = useState('');

  const color = trackColor(index);
  const trimDuration = track.endTime - track.startTime;
  const maxFade = Math.max(0.1, trimDuration / 2);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#4a4560',
      progressColor: color,
      cursorColor: '#c084fc',
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 96,
      normalize: true,
      url: track.objectUrl,
    });

    wavesurferRef.current = ws;

    ws.on('ready', () => setCurrentTime(0));
    ws.on('audioprocess', (time) => setCurrentTime(time));
    ws.on('seeking', (time) => setCurrentTime(time));
    ws.on('interaction', () => {
      const time = ws.getCurrentTime();
      setCurrentTime(time);
    });
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => {
      setIsPlaying(false);
      setCurrentTime(0);
      ws.seekTo(0);
    });

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.objectUrl]);

  // Keep the waveform tinted with the track's colour when tracks are reordered.
  useEffect(() => {
    wavesurferRef.current?.setOptions({ progressColor: color });
  }, [color]);

  // Seek to trim start when not playing
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || track.duration === 0) return;
    if (!isPlaying) {
      ws.setTime(track.startTime);
    }
  }, [track.startTime, track.duration, isPlaying]);

  // Stop playback at end time
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    const onTimeUpdate = (time: number) => {
      if (time >= track.endTime && isPlaying) {
        ws.pause();
        ws.setTime(track.startTime);
        setIsPlaying(false);
      }
    };
    ws.on('audioprocess', onTimeUpdate);
    return () => {
      ws.un('audioprocess', onTimeUpdate);
    };
  }, [track.endTime, isPlaying]);

  const handlePlayPause = () => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    if (isPlaying) {
      ws.pause();
    } else {
      onPlayStart?.();
      const current = ws.getCurrentTime();
      if (current >= track.endTime || current < track.startTime) {
        ws.setTime(track.startTime);
      }
      ws.play(track.startTime, track.endTime);
    }
  };

  const handleStartTimeApply = (seconds: number) => {
    if (seconds >= track.endTime) {
      setStartError('Start must be before End');
      onUpdateTime(track.id, track.endTime - 0.1, track.endTime);
      return;
    }
    setStartError('');
    onUpdateTime(track.id, seconds, track.endTime);
    setCurrentTime(seconds);
  };

  const handleEndTimeApply = (seconds: number) => {
    if (seconds <= track.startTime) {
      setEndError('End must be after Start');
      onUpdateTime(track.id, track.startTime, track.startTime + 0.1);
      return;
    }
    setEndError('');
    onUpdateTime(track.id, track.startTime, seconds);
  };

  const handleFadeInApply = (seconds: number) => {
    const clamped = Math.min(seconds, maxFade);
    onUpdateFade(track.id, clamped, track.fadeOut);
  };

  const handleFadeOutApply = (seconds: number) => {
    const clamped = Math.min(seconds, maxFade);
    onUpdateFade(track.id, track.fadeIn, clamped);
  };

  const startPercent = track.duration > 0 ? (track.startTime / track.duration) * 100 : 0;
  const endPercent = track.duration > 0 ? (track.endTime / track.duration) * 100 : 100;

  // Fade lengths as a share of the full waveform (capped like the export does)
  const fadeInOnWave = track.duration > 0 ? (Math.min(track.fadeIn, trimDuration / 2) / track.duration) * 100 : 0;
  const fadeOutOnWave = track.duration > 0 ? (Math.min(track.fadeOut, trimDuration / 2) / track.duration) * 100 : 0;

  // Draggable trim handles on waveform
  const handleTrimDrag = useCallback(
    (clientX: number, handle: 'start' | 'end') => {
      const wrapper = waveformWrapperRef.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      const newTime = (pct / 100) * track.duration;

      if (handle === 'start') {
        const newStart = Math.min(newTime, track.endTime - 0.1);
        onUpdateTime(track.id, Math.max(0, newStart), track.endTime);
        setCurrentTime(Math.max(0, newStart));
        setStartError('');
      } else {
        const newEnd = Math.max(newTime, track.startTime + 0.1);
        onUpdateTime(track.id, track.startTime, Math.min(track.duration, newEnd));
        setEndError('');
      }
    },
    [track, onUpdateTime]
  );

  const startTrimDrag = (e: React.MouseEvent, handle: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    setDragHandle(handle);

    const onMove = (ev: MouseEvent) => handleTrimDrag(ev.clientX, handle);
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches[0]) handleTrimDrag(ev.touches[0].clientX, handle);
    };
    const cleanup = () => {
      setDragHandle(null);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', cleanup);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', cleanup);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', cleanup);
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', cleanup);
  };

  const startTrimDragTouch = (e: React.TouchEvent, handle: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    setDragHandle(handle);
    if (e.touches[0]) handleTrimDrag(e.touches[0].clientX, handle);

    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches[0]) handleTrimDrag(ev.touches[0].clientX, handle);
    };
    const cleanup = () => {
      setDragHandle(null);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', cleanup);
    };

    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', cleanup);
  };

  // Keyboard adjustment for trim handles
  const handleTrimKeyDown = (e: React.KeyboardEvent, handle: 'start' | 'end') => {
    const step = e.shiftKey ? 1 : 0.1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -step : step;
      if (handle === 'start') {
        const newStart = Math.max(0, Math.min(track.startTime + delta, track.endTime - 0.1));
        onUpdateTime(track.id, newStart, track.endTime);
        setCurrentTime(newStart);
      } else {
        const newEnd = Math.max(track.startTime + 0.1, Math.min(track.endTime + delta, track.duration));
        onUpdateTime(track.id, track.startTime, newEnd);
      }
    }
  };

  // Grip handle drag for reordering — ONLY this element initiates drag
  const handleGripDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', track.id);
    e.dataTransfer.effectAllowed = 'move';
    setIsBeingDragged(true);
  };

  const handleGripDragEnd = () => {
    setIsBeingDragged(false);
  };

  return (
    <div
      onDragOver={(e) => {
        // Only accept drag-over if the dragged item is a track id
        if (e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!isDragOver) setIsDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        // Only clear if we actually left the card (not entering a child)
        if (e.currentTarget === e.target) setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== track.id) {
          onDragReorder(draggedId, track.id);
        }
      }}
      className={`glass relative animate-fade-in-up overflow-hidden rounded-2xl py-4 pl-5 pr-4 transition-all duration-200 ${
        isDragOver ? '!border-forge-accent' : 'hover:!border-white/[0.14]'
      } ${isBeingDragged ? 'opacity-50' : ''} ${dragHandle ? 'select-none' : ''}`}
      style={{
        ['--track-color' as string]: color,
        animationDelay: `${index * 40}ms`,
        boxShadow: isActive ? `0 0 0 1px ${color}99, 0 0 32px -8px ${color}88` : undefined,
      }}
    >
      {/* Track color stripe (matches the mix timeline) */}
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />

      {/* Header row */}
      <div className="mb-3 flex items-center gap-2.5">
        {/* Drag handle — ONLY this initiates track reordering */}
        <div
          draggable
          onDragStart={handleGripDragStart}
          onDragEnd={handleGripDragEnd}
          className="flex cursor-grab items-center text-forge-text-dim hover:text-forge-text-muted active:cursor-grabbing touch-none"
          title="Drag to reorder"
          role="button"
          aria-label="Drag handle to reorder track"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Track number + keyboard reorder */}
        <div className="flex flex-col items-center">
          <span className="text-xs font-semibold text-forge-text-dim tabular-nums leading-none">
            {index + 1}
          </span>
          <div className="flex">
            <button
              onClick={() => onMoveUp(track.id)}
              disabled={index === 0}
              className="text-forge-text-dim hover:text-forge-accent-light disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Move up"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              onClick={() => onMoveDown(track.id)}
              disabled={index === total - 1}
              className="text-forge-text-dim hover:text-forge-accent-light disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Move down"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* File icon + name */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${color}26`, color }}
          >
            <Music className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-forge-text" title={track.fileName}>
              {track.fileName}
            </p>
            <p className="text-xs text-forge-text-muted tabular-nums">
              {formatTime(trimDuration)} <span className="text-forge-text-dim">of {formatTime(track.duration)}</span>
            </p>
          </div>
        </div>

        {/* Play button */}
        <button
          onClick={handlePlayPause}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-forge-text transition-all hover:scale-105 hover:bg-white/[0.12] active:scale-95"
          aria-label={isPlaying ? 'Pause track' : 'Play track'}
          title="Preview this track"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>

        {/* Remove */}
        <button
          onClick={() => onRemove(track.id)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-forge-text-muted transition-colors hover:bg-forge-error/10 hover:text-forge-error"
          aria-label="Remove track"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Waveform with trim handles and fade envelope */}
      <div className="relative select-none rounded-lg bg-black/25" ref={waveformWrapperRef}>
        <div ref={containerRef} className="overflow-hidden rounded-lg" />
        {/* Dim everything outside the trim range */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-[5] rounded-l-lg bg-[#0a0a0f]/80"
          style={{ width: `${startPercent}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-[5] rounded-r-lg bg-[#0a0a0f]/80"
          style={{ width: `${100 - endPercent}%` }}
        />
        {/* Volume envelope: shade the faded corners and draw the fade curve */}
        {(fadeInOnWave > 0 || fadeOutOnWave > 0) && (
          <svg
            className="pointer-events-none absolute inset-0 z-[6] h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {fadeInOnWave > 0 && (
              <polygon
                points={`${startPercent},0 ${startPercent + fadeInOnWave},0 ${startPercent},100`}
                fill="rgba(10,10,15,0.65)"
              />
            )}
            {fadeOutOnWave > 0 && (
              <polygon
                points={`${endPercent - fadeOutOnWave},0 ${endPercent},0 ${endPercent},100`}
                fill="rgba(10,10,15,0.65)"
              />
            )}
            <polyline
              points={`${startPercent},100 ${startPercent + fadeInOnWave},4 ${endPercent - fadeOutOnWave},4 ${endPercent},100`}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {/* Start handle */}
        <div
          className={`trim-handle ${dragHandle === 'start' ? 'dragging' : ''}`}
          style={{ left: `calc(${startPercent}% - 5px)` }}
          onMouseDown={(e) => startTrimDrag(e, 'start')}
          onTouchStart={(e) => startTrimDragTouch(e, 'start')}
          onKeyDown={(e) => handleTrimKeyDown(e, 'start')}
          tabIndex={0}
          role="slider"
          aria-label="Start trim handle"
          aria-valuenow={track.startTime}
          aria-valuemin={0}
          aria-valuemax={track.duration}
          title="Drag to set start"
        />
        {/* End handle */}
        <div
          className={`trim-handle ${dragHandle === 'end' ? 'dragging' : ''}`}
          style={{ left: `calc(${endPercent}% - 5px)` }}
          onMouseDown={(e) => startTrimDrag(e, 'end')}
          onTouchStart={(e) => startTrimDragTouch(e, 'end')}
          onKeyDown={(e) => handleTrimKeyDown(e, 'end')}
          tabIndex={0}
          role="slider"
          aria-label="End trim handle"
          aria-valuenow={track.endTime}
          aria-valuemin={0}
          aria-valuemax={track.duration}
          title="Drag to set end"
        />
      </div>

      <div className="mb-4 mt-1.5 flex select-none items-center justify-between text-xs tabular-nums">
        <span className="text-forge-text-muted">{formatTime(currentTime)}</span>
        <span className="text-forge-text-dim">clip {formatTime(trimDuration)}</span>
      </div>

      {/* Trim (drag the handles above, or type exact times) */}
      <div className="grid grid-cols-2 gap-4">
        <TimeInput
          value={track.startTime}
          max={track.duration}
          label="Start"
          onApply={handleStartTimeApply}
          error={startError}
        />
        <TimeInput
          value={track.endTime}
          max={track.duration}
          label="End"
          onApply={handleEndTimeApply}
          error={endError}
        />
      </div>

      {/* Fades */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FadeControl label="Fade in" value={track.fadeIn} max={maxFade} color={color} onChange={handleFadeInApply} />
        <FadeControl label="Fade out" value={track.fadeOut} max={maxFade} color={color} onChange={handleFadeOutApply} />
      </div>
    </div>
  );
}

interface FadeControlProps {
  label: string;
  value: number;
  max: number;
  color: string;
  onChange: (seconds: number) => void;
}

function FadeControl({ label, value, max, color, onChange }: FadeControlProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const apply = (raw: string) => onChange(Math.max(0, parseFloat(raw) || 0));

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-forge-text-muted">{label}</label>
      <div className="flex items-center gap-3 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 transition-colors focus-within:border-forge-accent">
        <input
          type="range"
          min={0}
          max={max}
          step={0.1}
          value={Math.min(value, max)}
          onChange={(e) => apply(e.target.value)}
          className="min-w-0 flex-1"
          style={{
            background: `linear-gradient(to right, ${color} ${pct}%, rgba(255,255,255,0.08) ${pct}%)`,
            borderRadius: '3px',
            height: '6px',
          }}
          aria-label={`${label} slider`}
        />
        <div className="flex shrink-0 items-center gap-1">
          <input
            type="number"
            min={0}
            max={max}
            step={0.1}
            value={value}
            onChange={(e) => apply(e.target.value)}
            className="w-12 bg-transparent text-right text-xs tabular-nums text-forge-text focus:outline-none"
            aria-label={`${label} seconds`}
          />
          <span className="text-[11px] text-forge-text-dim">sec</span>
        </div>
      </div>
    </div>
  );
}
