import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}

const DIGITS = '0123456789';

/**
 * Segmented one-time-code input. Digits can be typed, pasted, or moved
 * between boxes with the arrow keys and Backspace.
 */
export function OtpInput({ value, onChange, length = 6, disabled = false, invalid = false, id }: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  const commit = (next: string[]) => {
    onChange(next.join('').replace(/\s/g, '').slice(0, length));
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    if (!digit) {
      next[index] = ' ';
      commit(next);
      return;
    }
    next[index] = DIGITS.includes(digit) ? digit : ' ';
    commit(next);
    const nextIndex = Math.min(index + 1, length - 1);
    inputsRef.current[nextIndex]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (digits[index] && digits[index] !== ' ') {
        const next = [...digits];
        next[index] = ' ';
        commit(next);
        return;
      }
      const previous = Math.max(index - 1, 0);
      const next = [...digits];
      next[previous] = ' ';
      commit(next);
      inputsRef.current[previous]?.focus();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      inputsRef.current[Math.max(index - 1, 0)]?.focus();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      inputsRef.current[Math.min(index + 1, length - 1)]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    commit(pasted.split(''));
    const focusIndex = Math.min(pasted.length, length - 1);
    inputsRef.current[focusIndex]?.focus();
  };

  return (
    <div>
      <div className="flex items-center gap-2" role="group" aria-label="One-time code">
        {digits.map((digit, index) => (
          <input
            key={index}
            id={id}
            ref={(element) => {
              inputsRef.current[index] = element;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            disabled={disabled}
            value={digit === ' ' ? '' : digit}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            onFocus={(event) => event.currentTarget.select()}
            aria-label={`Digit ${index + 1} of ${length}`}
            className={cn(
              'h-12 w-full min-w-0 rounded-lg border bg-white text-center text-lg font-bold text-slate-900 outline-none transition focus:ring-3',
              invalid
                ? 'border-red-300 focus:border-red-400 focus:ring-red-500/15'
                : 'border-slate-300 focus:border-brand-accent focus:ring-brand-accent/15',
              disabled && 'cursor-not-allowed bg-slate-50 text-slate-400',
            )}
          />
        ))}
      </div>
    </div>
  );
}
