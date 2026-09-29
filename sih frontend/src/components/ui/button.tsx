import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, children, disabled, ...props }, ref) => {
    const variants = {
      primary: 'bg-[var(--color-brand-primary)] text-white hover:bg-[var(--color-brand-secondary)] border border-transparent shadow-sm',
      secondary: 'bg-[var(--color-brand-secondary)] text-white hover:bg-[var(--color-brand-accent)] border border-transparent shadow-sm',
      outline: 'bg-transparent text-[var(--color-brand-primary)] border border-[var(--color-brand-primary)] hover:bg-[var(--color-bg-muted)]',
      ghost: 'bg-transparent text-gray-700 hover:bg-[var(--color-bg-muted)] hover:text-gray-900',
      danger: 'bg-[var(--color-risk-high)] text-white hover:bg-[var(--color-risk-critical)] border border-transparent shadow-sm',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-10 px-4 py-2 text-sm',
      lg: 'h-12 px-8 text-base',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
