import lamejs from '@breezystack/lamejs';
import { TrackData } from './types';

/**
 * Decode an audio file (MP3, M4A, …) into an AudioBuffer using the Web Audio API.
 */
export async function decodeAudioFile(
  file: File,
  audioCtx: AudioContext
): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  return decoded;
}

/**
 * Extract a segment of an AudioBuffer with fade in/out applied.
 * Returns a new AudioBuffer with only the trimmed + faded portion.
 */
export function trimAndFade(
  buffer: AudioBuffer,
  audioCtx: AudioContext,
  startTime: number,
  endTime: number,
  fadeIn: number,
  fadeOut: number
): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const length = endSample - startSample;

  if (length <= 0) {
    throw new Error('Invalid trim range: end must be after start');
  }

  const numChannels = buffer.numberOfChannels;
  const result = audioCtx.createBuffer(numChannels, length, sampleRate);

  const fadeInSamples = Math.min(Math.floor(fadeIn * sampleRate), Math.floor(length / 2));
  const fadeOutSamples = Math.min(Math.floor(fadeOut * sampleRate), Math.floor(length / 2));

  for (let ch = 0; ch < numChannels; ch++) {
    const srcData = buffer.getChannelData(ch);
    const destData = result.getChannelData(ch);

    for (let i = 0; i < length; i++) {
      let sample = srcData[startSample + i] || 0;

      // Fade in
      if (fadeInSamples > 0 && i < fadeInSamples) {
        sample *= i / fadeInSamples;
      }

      // Fade out
      if (fadeOutSamples > 0 && i >= length - fadeOutSamples) {
        sample *= (length - i) / fadeOutSamples;
      }

      destData[i] = sample;
    }
  }

  return result;
}

/**
 * Merge multiple trimmed/faded AudioBuffers sequentially into a single buffer.
 * Uses the max number of channels and highest sample rate across all buffers.
 */
export function mergeBuffers(
  buffers: AudioBuffer[],
  audioCtx: AudioContext
): AudioBuffer {
  if (buffers.length === 0) {
    throw new Error('No buffers to merge');
  }

  const sampleRate = Math.max(...buffers.map((b) => b.sampleRate));
  const numChannels = Math.max(...buffers.map((b) => b.numberOfChannels));
  const totalLength = buffers.reduce((sum, b) => {
    // Resample length if sample rates differ
    const scaled = Math.round((b.length / b.sampleRate) * sampleRate);
    return sum + scaled;
  }, 0);

  const result = audioCtx.createBuffer(numChannels, totalLength, sampleRate);

  let offset = 0;
  for (const buffer of buffers) {
    const scaledLength = Math.round((buffer.length / buffer.sampleRate) * sampleRate);
    const scale = buffer.length / scaledLength;

    for (let ch = 0; ch < numChannels; ch++) {
      const srcChannel = ch < buffer.numberOfChannels ? ch : 0;
      const srcData = buffer.getChannelData(srcChannel);
      const destData = result.getChannelData(ch);

      for (let i = 0; i < scaledLength; i++) {
        const srcIdx = Math.floor(i * scale);
        destData[offset + i] += srcData[srcIdx] || 0;
      }
    }

    offset += scaledLength;
  }

  return result;
}

/**
 * Convert an AudioBuffer to 16-bit PCM WAV.
 */
export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const dataSize = numFrames * numChannels * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write interleaved PCM samples
  let offset = 44;
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Convert an AudioBuffer to MP3 using lamejs.
 * Reports progress via callback.
 */
export async function audioBufferToMp3(
  buffer: AudioBuffer,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const Mp3Encoder = new lamejs.Mp3Encoder(buffer.numberOfChannels, buffer.sampleRate, 128);
  const numChannels = buffer.numberOfChannels;
  const sampleBlocks = 1152;
  const mp3Data: Uint8Array[] = [];

  const channels: Int16Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const floatData = buffer.getChannelData(ch);
    const int16Data = new Int16Array(floatData.length);
    for (let i = 0; i < floatData.length; i++) {
      const sample = Math.max(-1, Math.min(1, floatData[i]));
      int16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    channels.push(int16Data);
  }

  const totalLength = buffer.length;
  let encoded = 0;
  const yieldEvery = sampleBlocks * 64;

  for (let i = 0; i < totalLength; i += sampleBlocks) {
    const left = channels[0].subarray(i, i + sampleBlocks);
    let right: Int16Array | undefined;
    if (numChannels > 1) {
      right = channels[1].subarray(i, i + sampleBlocks);
    }

    const mp3buf = right
      ? Mp3Encoder.encodeBuffer(left, right)
      : Mp3Encoder.encodeBuffer(left);

    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }

    encoded += sampleBlocks;
    if (encoded % yieldEvery === 0) {
      const pct = Math.min(99, Math.round((encoded / totalLength) * 100));
      if (onProgress) onProgress(pct);
      // Yield to UI thread to keep the interface responsive
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const flush = Mp3Encoder.flush();
  if (flush.length > 0) {
    mp3Data.push(new Uint8Array(flush));
  }

  if (onProgress) onProgress(100);

  return new Blob(mp3Data as BlobPart[], { type: 'audio/mpeg' });
}

/**
 * Process all tracks: trim, apply fades, then merge.
 * Returns the merged AudioBuffer.
 */
export async function processAndMergeTracks(
  tracks: TrackData[],
  audioCtx: AudioContext,
  onProgress?: (phase: string, percent: number) => void
): Promise<AudioBuffer> {
  const processed: AudioBuffer[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    onProgress?.('merging', Math.round((i / tracks.length) * 50));
    const trimmed = trimAndFade(
      track.audioBuffer,
      audioCtx,
      track.startTime,
      track.endTime,
      track.fadeIn,
      track.fadeOut
    );
    processed.push(trimmed);
  }

  onProgress?.('merging', 50);
  const merged = mergeBuffers(processed, audioCtx);
  onProgress?.('merging', 60);

  return merged;
}

/**
 * Format seconds to mm:ss
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format seconds to mm:ss.s (one decimal)
 */
export function formatTimePrecise(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
}

/**
 * Extract YouTube video ID from a URL
 */
export function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

/**
 * Parse a time string like "1:23.5", "0:45", "1:02:30" into seconds.
 * Returns null if the input is invalid.
 */
export function parseTimeInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try plain number (seconds)
  const asNum = parseFloat(trimmed);
  if (!isNaN(asNum) && isFinite(asNum) && asNum >= 0 && /^[\d.]+$/.test(trimmed)) {
    return asNum;
  }

  // Try MM:SS.s or HH:MM:SS.s
  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3) return null;

  const partsAsNums = parts.map((p) => parseFloat(p));
  if (partsAsNums.some((n) => isNaN(n) || n < 0)) return null;

  let seconds: number;
  if (parts.length === 2) {
    // MM:SS.s
    seconds = partsAsNums[0] * 60 + partsAsNums[1];
  } else {
    // HH:MM:SS.s
    seconds = partsAsNums[0] * 3600 + partsAsNums[1] * 60 + partsAsNums[2];
  }

  return isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/**
 * Format seconds to a display string for time input fields.
 * Uses MM:SS.s for tracks under 1 hour, HH:MM:SS.s otherwise.
 */
export function formatTimeForInput(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00.0';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
}
