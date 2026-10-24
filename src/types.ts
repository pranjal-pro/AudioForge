export interface TrackData {
  id: string;
  fileName: string;
  file: File;
  audioBuffer: AudioBuffer;
  duration: number;
  startTime: number;
  endTime: number;
  fadeIn: number;
  fadeOut: number;
  objectUrl: string;
}



export interface YouTubeImportState {
  status: 'idle' | 'fetching-info' | 'downloading' | 'decoding' | 'done' | 'error';
  url: string;
  videoId: string;
  title?: string;
  thumbnail?: string;
  progress: number;
  message: string;
  error?: string;
}
