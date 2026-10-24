import { useEffect, useRef, useState } from 'react';
import { parseTimeInput, formatTimeForInput } from '../audioEngine';

interface TimeInputProps {
  value: number;
  max: number;
  label: string;
  onApply: (seconds: number) => void;
  error?: string;
}

export default function TimeInput({ value, max, label, onApply, error }: TimeInputProps) {
  const [text, setText] = useState(formatTimeForInput(value));
  const [localError, setLocalError] = useState('');
  const isEditingRef = useRef(false);

  // Sync external value -> text only when not actively editing
  useEffect(() => {
    if (!isEditingRef.current) {
      setText(formatTimeForInput(value));
      setLocalError('');
    }
  }, [value]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isEditingRef.current = true;
    e.target.select();
  };

  const handleBlur = () => {
    isEditingRef.current = false;
    applyValue();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyValue();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setText(formatTimeForInput(value));
      setLocalError('');
      isEditingRef.current = false;
      (e.target as HTMLInputElement).blur();
    }
  };

  const applyValue = () => {
    const parsed = parseTimeInput(text);
    if (parsed === null) {
      setLocalError('Invalid format');
      setText(formatTimeForInput(value));
      return;
    }
    if (parsed < 0) {
      setLocalError('Must be ≥ 0');
      setText(formatTimeForInput(value));
      return;
    }
    if (parsed > max) {
      setLocalError(`Max ${formatTimeForInput(max)}`);
      onApply(max);
      setText(formatTimeForInput(max));
      setLocalError('');
      return;
    }
    onApply(parsed);
    setText(formatTimeForInput(parsed));
    setLocalError('');
  };

  const displayError = error || localError;

  return (
    <div className="flex-1">
      <label className="mb-1 block text-xs font-medium text-forge-text-muted">
        {label}
      </label>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`w-full rounded-md border bg-black/30 px-2 py-1.5 text-xs tabular-nums text-forge-text transition-colors focus:outline-none ${
          displayError
            ? 'border-forge-error/50 focus:border-forge-error'
            : 'border-white/10 focus:border-forge-accent'
        }`}
        spellCheck={false}
        inputMode="numeric"
      />
      {displayError && (
        <p className="mt-0.5 text-[10px] leading-tight text-forge-error">{displayError}</p>
      )}
    </div>
  );
}
