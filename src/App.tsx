import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Disc3, AlertCircle, X, GripVertical, Headphones, Scissors, Waves, Youtube } from 'lucide-react';
import UploadZone from './components/UploadZone';
import TrackCard from './components/TrackCard';
import PlayerBar from './components/PlayerBar';
import MixPanel from './components/MixPanel';
import { TrackData } from './types';
import {
  decodeAudioFile,
  processAndMergeTracks,
  audioBufferToMp3,
} from './audioEngine';
import { mixDuration, useMixPreview } from './useMixPreview';

export default function App() {
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [mergedUrl, setMergedUrl] = useState<string | null>(null);
  const [mergedStale, setMergedStale] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [isDecoding, setIsDecoding] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const totalDuration = useMemo(() => mixDuration(tracks), [tracks]);
  const mix = useMixPreview(tracks, getAudioContext);

  // Which track the mix playhead is currently inside (-1 when stopped at 0).
  const activeIndex = useMemo(() => {
    if (!mix.isPlaying && mix.position === 0) return -1;
    let end = 0;
    for (let i = 0; i < tracks.length; i++) {
      end += tracks[i].endTime - tracks[i].startTime;
      if (mix.position < end) return i;
    }
    return tracks.length - 1;
  }, [tracks, mix.position, mix.isPlaying]);

  const addError = useCallback((msg: string) => {
    setErrors((prev) => [...prev, msg]);
    setTimeout(() => {
      setErrors((prev) => prev.filter((e) => e !== msg));
    }, 6000);
  }, []);

  // Decode a file and append it as a track. Throws if the audio can't be decoded.
  const addFileAsTrack = useCallback(
    async (file: File, ctx: AudioContext, displayName = file.name) => {
      const audioBuffer = await decodeAudioFile(file, ctx);
      const objectUrl = URL.createObjectURL(file);
      const track: TrackData = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        fileName: displayName,
        file,
        audioBuffer,
        duration: audioBuffer.duration,
        startTime: 0,
        endTime: audioBuffer.duration,
        fadeIn: 0,
        fadeOut: 0,
        objectUrl,
      };
      setTracks((prev) => [...prev, track]);
    },
    []
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      setIsDecoding(true);
      const ctx = getAudioContext();
      for (const file of files) {
        const isAudio =
          file.name.toLowerCase().endsWith('.mp3') ||
          file.name.toLowerCase().endsWith('.m4a') ||
          file.type === 'audio/mpeg' ||
          file.type === 'audio/mp4' ||
          file.type === 'audio/m4a';
        if (!isAudio) {
          addError(`"${file.name}" is not a supported audio file. Only MP3 and M4A are supported.`);
          continue;
        }
        try {
          await addFileAsTrack(file, ctx);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          addError(`Couldn't decode "${file.name}": ${message}`);
        }
      }
      setIsDecoding(false);
    },
    [getAudioContext, addFileAsTrack, addError]
  );

  const handleYouTubeImport = useCallback(
    async (file: File, title: string) => {
      setIsDecoding(true);
      try {
        await addFileAsTrack(file, getAudioContext(), title);
      } catch {
        throw new Error('The downloaded audio could not be decoded by your browser.');
      } finally {
        setIsDecoding(false);
      }
    },
    [getAudioContext, addFileAsTrack]
  );

  const handleRemoveTrack = useCallback((id: string) => {
    setTracks((prev) => {
      const track = prev.find((t) => t.id === id);
      if (track) URL.revokeObjectURL(track.objectUrl);
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const handleMoveUp = useCallback((id: string) => {
    setTracks((prev) => {
      const index = prev.findIndex((t) => t.id === id);
      if (index <= 0) return prev;
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((id: string) => {
    setTracks((prev) => {
      const index = prev.findIndex((t) => t.id === id);
      if (index < 0 || index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  const handleDragReorder = useCallback((draggedId: string, targetId: string) => {
    setTracks((prev) => {
      const draggedIndex = prev.findIndex((t) => t.id === draggedId);
      const targetIndex = prev.findIndex((t) => t.id === targetId);
      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }, []);

  const handleUpdateTime = useCallback((id: string, startTime: number, endTime: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, startTime, endTime } : t))
    );
  }, []);

  const handleUpdateFade = useCallback((id: string, fadeIn: number, fadeOut: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, fadeIn, fadeOut } : t))
    );
  }, []);

  const handleExport = useCallback(async () => {
    if (tracks.length === 0) return;
    setExportProgress(0);
    try {
      const ctx = getAudioContext();
      const merged = await processAndMergeTracks(tracks, ctx, (_phase, percent) => setExportProgress(percent));
      const blob = await audioBufferToMp3(merged, (percent) => setExportProgress(60 + Math.round(percent * 0.4)));

      setMergedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setMergedStale(false);
    } catch (err) {
      addError(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setExportProgress(null);
    }
  }, [tracks, getAudioContext, addError]);

  // Any edit after a merge means the merged file no longer matches the tracks.
  const mergedUrlRef = useRef(mergedUrl);
  mergedUrlRef.current = mergedUrl;
  useEffect(() => {
    if (mergedUrlRef.current) setMergedStale(true);
  }, [tracks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      tracks.forEach((t) => URL.revokeObjectURL(t.objectUrl));
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasTracks = tracks.length > 0;
  const isBusy = isDecoding || exportProgress !== null;

  const uploadZone = (
    <UploadZone
      onFiles={handleFiles}
      onYouTubeImport={handleYouTubeImport}
      disabled={isBusy}
      compact={hasTracks}
    />
  );

  const notices = (
    <>
      {isDecoding && (
        <div className="flex items-center gap-2 px-1 text-sm text-forge-text-muted animate-fade-in-up">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-forge-accent border-t-transparent" />
          Decoding audio…
        </div>
      )}
      {errors.map((err) => (
        <div
          key={err}
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-forge-error/30 bg-forge-error/10 px-3 py-2.5 text-sm text-forge-error animate-fade-in-up"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{err}</span>
          <button
            onClick={() => setErrors((prev) => prev.filter((e) => e !== err))}
            className="shrink-0 text-forge-error/60 hover:text-forge-error"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </>
  );

  return (
    <div className="relative flex min-h-screen flex-col text-forge-text">
      <div className="app-bg" aria-hidden="true">
        <div className="glow glow-1" />
        <div className="glow glow-2" />
        <div className="glow glow-3" />
        <div className="lines" />
      </div>

      {!hasTracks ? (
        <main className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-1 flex-col justify-center px-5 py-[clamp(3rem,6vh,6rem)] sm:px-8">
          <div className="mb-[clamp(2.5rem,5vh,4.5rem)] text-center animate-fade-in-up">
            <div className="mb-[clamp(1.5rem,3vh,2.5rem)] inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-4 text-[clamp(0.875rem,0.9vw,1.05rem)] font-medium text-forge-text-muted backdrop-blur">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500">
                <Disc3 className="h-4 w-4 text-white" />
              </span>
              AudioForge
            </div>
            <div className="eq mx-auto mb-[clamp(1.5rem,3vh,2.5rem)] flex h-[clamp(4.5rem,6.5vw,8rem)] items-end justify-center gap-[clamp(6px,0.55vw,12px)]" aria-hidden="true">
              {[0.1, 0.5, 0.25, 0.7, 0.35, 0.9, 0.15, 0.6, 0.4, 0.8, 0.3, 0.55, 0.2].map((delay, i) => (
                <span key={i} style={{ width: 'clamp(7px, 0.6vw, 13px)', height: `${55 + (i % 3) * 22}%`, animationDelay: `-${delay}s` }} />
              ))}
            </div>
            <h1 className="text-[clamp(3.25rem,6.5vw,8.5rem)] font-bold leading-[1.02] tracking-tight">
              Mix your{' '}
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
                music
              </span>
            </h1>
            <p className="mx-auto mt-[clamp(1rem,2vh,1.75rem)] max-w-4xl text-balance text-[clamp(1.1rem,1.35vw,1.6rem)] leading-relaxed text-forge-text-muted">
              Trim, fade and merge tracks into one MP3 — right in your browser.
            </p>
          </div>

          <div className="mx-auto w-full max-w-[1100px]">
            {uploadZone}
            <div className="mt-3 space-y-2">{notices}</div>
          </div>

          <ul className="mx-auto mt-[clamp(1.75rem,4vh,3.5rem)] grid w-full max-w-[1100px] grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: Headphones, label: 'Live mix preview' },
              { icon: Scissors, label: 'Precise trimming' },
              { icon: Waves, label: 'Smooth fades' },
              { icon: Youtube, label: 'YouTube import' },
            ].map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-[clamp(0.75rem,1.6vh,1.25rem)] text-[clamp(0.875rem,0.95vw,1.05rem)] text-forge-text-muted backdrop-blur"
              >
                <Icon className="h-5 w-5 shrink-0 text-forge-accent-light" />
                {label}
              </li>
            ))}
          </ul>
        </main>
      ) : (
        <main className="relative z-10 mx-auto grid w-full max-w-[2000px] flex-1 items-start gap-6 px-5 pb-36 pt-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-10">
          <section className="order-2 min-w-0 lg:order-1">
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="text-lg font-semibold tracking-tight">Tracks</h2>
              <p className="flex items-center gap-1 text-xs text-forge-text-dim">
                <GripVertical className="h-3.5 w-3.5" />
                Drag to reorder
              </p>
            </div>
            <div className="space-y-4">
              {tracks.map((track, index) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  index={index}
                  total={tracks.length}
                  isActive={index === activeIndex && mix.isPlaying}
                  onPlayStart={mix.pause}
                  onRemove={handleRemoveTrack}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onUpdateTime={handleUpdateTime}
                  onUpdateFade={handleUpdateFade}
                  onDragReorder={handleDragReorder}
                />
              ))}
            </div>
          </section>

          <aside className="order-1 space-y-4 lg:sticky lg:top-6 lg:order-2">
            {uploadZone}
            {notices}
            <MixPanel
              tracks={tracks}
              totalDuration={totalDuration}
              activeIndex={activeIndex}
              onSeek={(seconds) => {
                mix.seek(seconds);
                if (!mix.isPlaying) mix.toggle();
              }}
              onExport={handleExport}
              exportProgress={exportProgress}
              mergedUrl={mergedUrl}
              mergedStale={mergedStale}
              mixPlaying={mix.isPlaying}
              onMergedPlay={mix.pause}
            />
          </aside>
        </main>
      )}

      {hasTracks && (
        <PlayerBar
          tracks={tracks}
          totalDuration={totalDuration}
          position={mix.position}
          isPlaying={mix.isPlaying}
          activeIndex={activeIndex}
          onToggle={mix.toggle}
          onSeek={mix.seek}
          onExport={handleExport}
          exportProgress={exportProgress}
        />
      )}
    </div>
  );
}
