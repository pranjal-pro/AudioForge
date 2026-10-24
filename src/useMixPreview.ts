import { useCallback, useEffect, useRef, useState } from 'react';
import { TrackData } from './types';

interface Scheduled {
  nodes: { source: AudioBufferSourceNode; gain: GainNode }[];
  ctxStart: number;
  mixStart: number;
  mixEnd: number;
}

export function mixDuration(tracks: TrackData[]): number {
  return tracks.reduce((sum, t) => sum + Math.max(0, t.endTime - t.startTime), 0);
}

/**
 * Automate a clip's gain so live playback matches trimAndFade() in the export:
 * linear fades, each capped at half the clip length.
 */
function scheduleFades(
  param: AudioParam,
  when: number,
  offset: number,
  len: number,
  fadeIn: number,
  fadeOut: number
) {
  const fi = Math.min(fadeIn, len / 2);
  const fo = Math.min(fadeOut, len / 2);
  const gainAt = (x: number) => Math.min(1, fi > 0 ? x / fi : 1, fo > 0 ? (len - x) / fo : 1);
  const at = (x: number) => when + (x - offset);

  param.setValueAtTime(gainAt(offset), when);
  if (fi > 0 && offset < fi) param.linearRampToValueAtTime(1, at(fi));
  if (fo > 0) {
    const fadeOutStart = len - fo;
    if (offset < fadeOutStart) param.setValueAtTime(1, at(fadeOutStart));
    param.linearRampToValueAtTime(0, at(len));
  }
}

/**
 * Plays every track back-to-back with its current trim and fades, without
 * rendering the mix. Edits made while playing are picked up on the fly.
 */
export function useMixPreview(tracks: TrackData[], getAudioContext: () => AudioContext) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const scheduledRef = useRef<Scheduled | null>(null);
  const positionRef = useRef(0);
  const rafRef = useRef(0);

  const stopSources = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    scheduledRef.current?.nodes.forEach(({ source, gain }) => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      source.disconnect();
      gain.disconnect();
    });
    scheduledRef.current = null;
  }, []);

  const livePosition = useCallback(() => {
    const s = scheduledRef.current;
    if (!s) return positionRef.current;
    return s.mixStart + Math.max(0, getAudioContext().currentTime - s.ctxStart);
  }, [getAudioContext]);

  const playFrom = useCallback(
    (from: number) => {
      stopSources();
      const list = tracksRef.current;
      const mixEnd = mixDuration(list);
      if (mixEnd <= 0) return;
      if (from >= mixEnd - 0.05) from = 0;

      const ctx = getAudioContext();
      const ctxStart = ctx.currentTime + 0.05;
      const nodes: Scheduled['nodes'] = [];

      let segStart = 0;
      for (const track of list) {
        const len = track.endTime - track.startTime;
        const segEnd = segStart + len;
        if (len > 0 && from < segEnd) {
          const offset = Math.max(0, from - segStart);
          const when = ctxStart + Math.max(0, segStart - from);
          const source = ctx.createBufferSource();
          source.buffer = track.audioBuffer;
          const gain = ctx.createGain();
          scheduleFades(gain.gain, when, offset, len, track.fadeIn, track.fadeOut);
          source.connect(gain).connect(ctx.destination);
          source.start(when, track.startTime + offset, len - offset);
          nodes.push({ source, gain });
        }
        segStart = segEnd;
      }

      scheduledRef.current = { nodes, ctxStart, mixStart: from, mixEnd };
      positionRef.current = from;
      setPosition(from);
      setIsPlaying(true);

      const tick = () => {
        const pos = livePosition();
        if (pos >= mixEnd) {
          stopSources();
          positionRef.current = 0;
          setPosition(0);
          setIsPlaying(false);
          return;
        }
        positionRef.current = pos;
        setPosition(pos);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [getAudioContext, livePosition, stopSources]
  );

  const pause = useCallback(() => {
    const pos = livePosition();
    stopSources();
    positionRef.current = pos;
    setPosition(pos);
    setIsPlaying(false);
  }, [livePosition, stopSources]);

  const toggle = useCallback(() => {
    if (scheduledRef.current) pause();
    else playFrom(positionRef.current);
  }, [pause, playFrom]);

  const seek = useCallback(
    (to: number) => {
      const clamped = Math.max(0, Math.min(to, mixDuration(tracksRef.current)));
      if (scheduledRef.current) {
        playFrom(clamped);
      } else {
        positionRef.current = clamped;
        setPosition(clamped);
      }
    },
    [playFrom]
  );

  // Re-schedule when trims, fades or order change mid-playback (debounced so
  // dragging a trim handle doesn't restart audio on every frame).
  useEffect(() => {
    if (tracks.length === 0) {
      stopSources();
      positionRef.current = 0;
      setPosition(0);
      setIsPlaying(false);
      return;
    }
    if (!scheduledRef.current) {
      const total = mixDuration(tracks);
      if (positionRef.current > total) {
        positionRef.current = total;
        setPosition(total);
      }
      return;
    }
    const timer = setTimeout(() => {
      if (scheduledRef.current) playFrom(livePosition());
    }, 120);
    return () => clearTimeout(timer);
  }, [tracks, playFrom, livePosition, stopSources]);

  useEffect(() => stopSources, [stopSources]);

  return { isPlaying, position, toggle, pause, seek };
}
