import { useNavigate } from 'react-router';
import { CalendarClock, ChevronRight, CircleDollarSign, Eye, ShieldAlert, UserRound, Waves } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ActionStatusBadge } from '@/components/actions/action-status-badge';
import { OutcomePanel } from '@/components/actions/outcome-panel';
import type { Recommendation } from '@/types';
import { RiskLevel, ActionStatus } from '@/types';
import { formatShortDate } from '@/utils/formatting';
import { cn } from '@/lib/utils';

const riskBadgeClass: Record<RiskLevel, string> = {
  [RiskLevel.CRITICAL]: 'bg-[var(--color-risk-critical)]/10 text-[var(--color-risk-critical)] border-[var(--color-risk-critical)]/40',
  [RiskLevel.HIGH]: 'bg-[var(--color-risk-high)]/10 text-[var(--color-risk-high)] border-[var(--color-risk-high)]/40',
  [RiskLevel.MEDIUM]: 'bg-[var(--color-risk-medium)]/10 text-[var(--color-risk-medium)] border-[var(--color-risk-medium)]/40',
  [RiskLevel.LOW]: 'bg-[var(--color-risk-low)]/10 text-[var(--color-risk-low)] border-[var(--color-risk-low)]/40',
};

const riskLabel: Record<RiskLevel, string> = {
  [RiskLevel.CRITICAL]: 'HIGH',
  [RiskLevel.HIGH]: 'HIGH',
  [RiskLevel.MEDIUM]: 'MEDIUM',
  [RiskLevel.LOW]: 'LOW',
};

interface ActionCardProps {
  rec: Recommendation;
  busyId: string | null;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
  onBlock: (id: string) => void;
  onReopen: (id: string) => void;
  readOnly?: boolean;
}

export function ActionCard({ rec, busyId, onStart, onComplete, onBlock, onReopen, readOnly = false }: ActionCardProps) {
  const navigate = useNavigate();
  const status = rec.actionStatus;
  const isBusy = busyId === rec.id;
  const completed = status === ActionStatus.COMPLETED;

  return (
    <Card
      className={cn(
        'flex flex-col overflow-hidden transition-shadow hover:shadow-md',
        completed && 'opacity-95'
      )}
    >
      <div className="flex-1 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            <span className="text-sm font-extrabold text-gray-900 tabular-nums">{rec.priorityRank}</span>
            Priority
          </span>
          <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', riskBadgeClass[rec.priority])}>
            {riskLabel[rec.priority]}
          </span>
          <ActionStatusBadge status={status} />
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-400">
            <CalendarClock className="h-3 w-3" />
            Due {formatShortDate(rec.deadline)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => navigate(`/recommendations/${rec.id}`)}
          className="group mt-3 flex w-full items-start justify-between gap-3 text-left"
        >
          <p className="text-[15px] font-bold text-gray-900 transition-colors group-hover:text-brand-primary">{rec.title}</p>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-brand-accent" />
        </button>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>
            Project: <span className="font-medium text-gray-700">{rec.projectName}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            Impact: <span className="font-semibold text-gray-700">{riskLabel[rec.impact]}</span>
          </span>
        </div>

        <p className="mt-3 rounded-lg border-l-2 border-brand-accent bg-[var(--color-bg-app)] px-3 py-2 text-[13px] italic leading-relaxed text-gray-600">
          “{rec.recommendedAction}”
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <CircleDollarSign className="h-3 w-3 text-gray-400" />
            Risk factor: <span className="font-medium text-gray-700">{rec.riskFactor}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3 w-3 text-gray-400" />
            Owner: <span className="font-medium text-gray-700">{rec.owner}</span>
          </span>
        </div>
      </div>

      {completed && rec.outcome && (
        <div className="border-t border-gray-200 bg-white px-5 py-4">
          <OutcomePanel outcome={rec.outcome} projectName={rec.projectName} compact />
        </div>
      )}
      {status === ActionStatus.BLOCKED && (
        <div className="border-t border-gray-200 bg-[var(--color-bg-app)] px-5 py-3">
          <p className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
            <ShieldAlert className="h-3.5 w-3.5 text-[var(--color-risk-high)]" />
            Blocked: {rec.blockedReason ?? 'Blocked pending resolution'}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 px-5 py-3">
        {!readOnly && status === ActionStatus.PENDING && (
          <Button size="sm" isLoading={isBusy} onClick={() => onStart(rec.id)}>
            Start Action
          </Button>
        )}
        {!readOnly && status === ActionStatus.IN_PROGRESS && (
          <>
            <Button size="sm" isLoading={isBusy} onClick={() => onComplete(rec.id)}>
              Mark Complete
            </Button>
            <Button size="sm" variant="outline" disabled={isBusy} onClick={() => onBlock(rec.id)}>
              Mark Blocked
            </Button>
          </>
        )}
        {!readOnly && status === ActionStatus.BLOCKED && (
          <Button size="sm" variant="outline" disabled={isBusy} onClick={() => onReopen(rec.id)}>
            Reopen
          </Button>
        )}
        {readOnly && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
            <Eye className="h-3.5 w-3.5" /> Read only
          </span>
        )}
        {completed && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-risk-low)]">
            <Waves className="h-3.5 w-3.5" />
            Outcome recorded
          </span>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => navigate(`/recommendations/${rec.id}`)}>
          View Details
          <ChevronRight className="ml-1 h-3 w-3" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${rec.projectId}`)}>
          View Project
        </Button>
      </div>
    </Card>
  );
}