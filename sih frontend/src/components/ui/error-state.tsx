import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title = 'An error occurred', message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-[var(--radius-lg)] bg-red-50 p-8 text-center border border-red-100', className)}>
      <AlertCircle className="mb-4 h-10 w-10 text-red-500" />
      <h3 className="mb-2 text-lg font-semibold text-red-900">{title}</h3>
      <p className="mb-6 max-w-md text-sm text-red-700">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="bg-white border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      )}
    </div>
  );
}
