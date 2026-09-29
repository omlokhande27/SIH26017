import { Bell, Award, Hand } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatShortDate } from '@/utils/formatting';

interface TimelineStep {
  icon: React.ReactNode;
  label: string;
  date: string;
  completed: boolean;
}

interface LandTimelineProps {
  notificationDate?: string;
  awardDate?: string;
  possessionDate?: string;
  className?: string;
}

export function LandTimeline({ notificationDate, awardDate, possessionDate, className }: LandTimelineProps) {
  const now = new Date();

  const steps: TimelineStep[] = [
    {
      icon: <Bell className="h-4 w-4" />,
      label: 'Notification',
      date: notificationDate ?? '',
      completed: notificationDate ? new Date(notificationDate) <= now : false,
    },
    {
      icon: <Award className="h-4 w-4" />,
      label: 'Award',
      date: awardDate ?? '',
      completed: awardDate ? new Date(awardDate) <= now : false,
    },
    {
      icon: <Hand className="h-4 w-4" />,
      label: 'Possession',
      date: possessionDate ?? '',
      completed: possessionDate ? new Date(possessionDate) <= now : false,
    },
  ];

  return (
    <div className={cn('flex flex-col gap-0 sm:flex-row sm:items-start sm:gap-0', className)}>
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        return (
          <div key={step.label} className={cn('relative flex flex-1 flex-col items-center', !isLast && 'sm:border-b-0')}>
            {/* Connector line */}
            {!isLast && (
              <div className="absolute top-4 hidden h-px w-full bg-gray-200 sm:block" />
            )}

            {/* Dot / Icon */}
            <div
              className={cn(
                'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm',
                step.completed
                  ? 'border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)]/10 text-[var(--color-brand-primary)]'
                  : 'border-gray-300 bg-white text-gray-400'
              )}
            >
              {step.icon}
            </div>

            {/* Label & date */}
            <div className="mt-3 text-center">
              <p className={cn('text-xs font-semibold', step.completed ? 'text-gray-900' : 'text-gray-400')}>
                {step.label}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {step.date ? formatShortDate(step.date) : '—'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}