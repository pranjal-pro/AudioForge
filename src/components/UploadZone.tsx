import { useCallback, useRef, useState } from 'react';
import { Upload, Plus } from 'lucide-react';
import YouTubeImporter from './YouTubeImporter';

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  onYouTubeImport: (file: File, title: string) => Promise<void> | void;
  disabled?: boolean;
  compact?: boolean;
}

const isAudioFile = (f: File) =>
  /\.(mp3|m4a)$/i.test(f.name) || f.type === 'audio/mpeg' || f.type === 'audio/mp4';

export default function UploadZone({ onFiles, onYouTubeImport, disabled, compact }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const dropped = Array.from(e.dataTransfer.files).filter(isAudioFile);
      if (dropped.length > 0) onFiles(dropped);
    },
    [onFiles, disabled]
  );

  const browse = () => !disabled && fileInputRef.current?.click();

  return (
    <div
      onDragOver={(e) => {
        // Ignore track-reorder drags; only react to files from the OS.
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
      }}
      onDrop={handleDrop}
      className={`glass rounded-2xl transition-all ${
        isDragging ? 'ring-2 ring-forge-accent ring-offset-2 ring-offset-forge-bg' : ''
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,audio/mp4,.mp3,.m4a"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) onFiles(files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {compact ? (
        <div className="space-y-2.5 p-4">
          <p className="text-xs font-medium uppercase tracking-widest text-forge-text-dim">Add audio</p>
          <button
            onClick={browse}
            disabled={disabled}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3.5 text-sm font-medium text-forge-text transition-colors hover:border-forge-accent/60 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add files <span className="font-normal text-forge-text-dim">or drop them here</span>
          </button>
          <YouTubeImporter onImported={onYouTubeImport} disabled={disabled} />
        </div>
      ) : (
        <>
          <button
            onClick={browse}
            disabled={disabled}
            className="group m-3 flex w-[calc(100%-1.5rem)] flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/10 px-6 py-[clamp(3.5rem,10vh,9rem)] text-center transition-colors hover:border-forge-accent/50 hover:bg-white/[0.02] disabled:opacity-50"
          >
            <div
              className={`mb-5 flex h-[clamp(4rem,4.5vw,5.5rem)] w-[clamp(4rem,4.5vw,5.5rem)] items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600/30 to-fuchsia-500/20 ring-1 ring-white/10 transition-transform group-hover:scale-105 ${
                isDragging ? 'scale-110 text-white' : 'text-forge-accent-light'
              }`}
            >
              <Upload className="h-[45%] w-[45%]" />
            </div>
            <p className="text-[clamp(1.2rem,1.5vw,1.75rem)] font-semibold text-forge-text">Drop audio files here</p>
            <p className="mt-2 text-[clamp(0.875rem,0.95vw,1.05rem)] text-forge-text-dim">
              or <span className="text-forge-accent-light underline-offset-2 group-hover:underline">browse your computer</span> · MP3 or M4A
            </p>
          </button>
          <div className="flex items-center gap-3 px-6 text-xs font-medium uppercase tracking-widest text-forge-text-dim">
            <span className="h-px flex-1 bg-white/[0.07]" />
            or
            <span className="h-px flex-1 bg-white/[0.07]" />
          </div>
          <div className="p-5 pt-4">
            <YouTubeImporter onImported={onYouTubeImport} disabled={disabled} large />
          </div>
        </>
      )}
    </div>
  );
}
