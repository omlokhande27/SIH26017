import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  CalendarClock,
  ClipboardCheck,
  CheckCircle2,
  Eye,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatTile } from '@/components/projects/stat-tile';
import { ActionStatusBadge } from '@/components/actions/action-status-badge';
import { OutcomePanel } from '@/components/actions/outcome-panel';
import { recommendationsApi } from '@/api/recommendations.api';
import { useAuth } from '@/context/useAuth';
import type { Recommendation } from '@/types';
import { RiskLevel, ActionStatus } from '@/types';
import { formatShortDate, formatDateTime } from '@/utils/formatting';
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

interface TimelineEvent {
  key: string;
  title: string;
  at: string;
  active: boolean;
}

function buildTimeline(rec: Recommendation): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { key: 'created', title: 'Recommended', at: rec.createdAt, active: true },
  ];
  if (rec.startedAt) events.push({ key: 'started', title: 'Started', at: rec.startedAt, active: true });
  if (rec.completedAt) events.push({ key: 'completed', title: 'Completed', at: rec.completedAt, active: true });
  if (rec.blockedAt) events.push({ key: 'blocked', title: 'Blocked', at: rec.blockedAt, active: true });

  if (!rec.startedAt && !rec.completedAt && !rec.blockedAt) {
    events.push({ key: 'next', title: 'Awaiting start', at: '', active: false });
  } else if (rec.actionStatus === ActionStatus.IN_PROGRESS && !rec.completedAt) {
    events.push({ key: 'next', title: 'Pending completion', at: '', active: false });
  }

  return events;
}

export default function RecommendationDetail() {
  const navigate = useNavigate();
  const { canManage } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    recommendationsApi.getRecommendation(id ?? '').then((result) => {
      if (mounted) {
        setRec(result);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const run = async (task: () => Promise<Recommendation>) => {
    setBusy(true);
    try {
      setRec(await task());
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
      </div>
    );
  }

  if (!rec) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Action not found"
        description="This action may have been removed from the action plan."
        action={
          <Button onClick={() => navigate('/recommendations')}>Back to Action Plan</Button>
        }
      />
    );
  }

  const timeline = buildTimeline(rec);
  const completed = rec.actionStatus === ActionStatus.COMPLETED;

  return (
    <div className="animate-fade-in space-y-6">
      <button
        type="button"
        onClick={() => navigate('/recommendations')}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-brand-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Priority Action Plan
      </button>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              <span className="text-sm font-extrabold text-gray-900 tabular-nums">{rec.priorityRank}</span>
              Priority
            </span>
            <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', riskBadgeClass[rec.priority])}>
              {riskLabel[rec.priority]}
            </span>
            <ActionStatusBadge status={rec.actionStatus} />
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-400">
              <CalendarClock className="h-3 w-3" />
              Due {formatShortDate(rec.deadline)}
            </span>
          </div>
          <CardTitle className="mt-3 text-xl">{rec.title}</CardTitle>
          <p className="text-sm text-gray-500">{rec.projectName}</p>
        </CardHeader>
        <CardContent className="pb-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Priority" value={`P${rec.priorityRank}`} />
            <StatTile label="Impact" value={riskLabel[rec.impact]} />
            <StatTile label="Owner" value={rec.owner} />
            <StatTile label="Est. impact" value={rec.estimatedImpact} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {canManage && rec.actionStatus === ActionStatus.PENDING && (
              <Button isLoading={busy} onClick={() => run(() => recommendationsApi.startAction(rec.id))}>
                Start Action
              </Button>
            )}
            {canManage && rec.actionStatus === ActionStatus.IN_PROGRESS && (
              <>
                <Button
                  isLoading={busy}
                  onClick={() => run(() => recommendationsApi.completeAction(rec.id))}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  Mark Complete
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => navigate(`/recommendations?id=${rec.id}&block=1`)}
                  className="hidden"
                >
                  Mark Blocked
                </Button>
              </>
            )}
            {canManage && rec.actionStatus === ActionStatus.BLOCKED && (
              <Button variant="outline" disabled={busy} onClick={() => run(() => recommendationsApi.reopenAction(rec.id))}>
                Reopen Action
              </Button>
            )}
            {!canManage && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                <Eye className="h-3.5 w-3.5" /> Read-only viewer
              </span>
            )}
            <Button variant="outline" onClick={() => navigate(`/projects/${rec.projectId}`)}>
              View Project
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Action Detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Why this action was recommended</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-700">{rec.description}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Recommended Action</p>
                <p className="mt-1 rounded-lg border-l-2 border-brand-accent bg-[var(--color-bg-app)] px-3 py-2 text-[13px] italic leading-relaxed text-gray-600">
                  “{rec.recommendedAction}”
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Risk factor addressed</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">{rec.riskFactor}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Prediction at time of recommendation</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{rec.predictedDelayAtRecommendation} days</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4">
              <span className="text-xs text-gray-500">Status:</span>
              <ActionStatusBadge status={rec.actionStatus} />
              {rec.blockedReason && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-risk-high)]">
                  <ShieldAlert className="h-3 w-3" />
                  {rec.blockedReason}
                </span>
              )}
            </div>

            {completed && rec.outcome && (
              <div className="border-t border-gray-200 pt-4">
                <OutcomePanel outcome={rec.outcome} projectName={rec.projectName} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Status Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-0">
              {timeline.map((event, index) => (
                <li key={event.key} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < timeline.length - 1 && (
                    <span className="absolute left-[5px] top-3 h-full w-px bg-gray-200" />
                  )}
                  <span
                    className={cn(
                      'relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2',
                      event.active ? 'border-brand-accent bg-brand-accent' : 'border-gray-300 bg-white'
                    )}
                  />
                  <div>
                    <p className={cn('text-sm font-medium', event.active ? 'text-gray-900' : 'text-gray-400')}>
                      {event.title}
                    </p>
                    {event.at ? (
                      <p className="text-xs text-gray-500">{formatDateTime(event.at)}</p>
                    ) : (
                      <p className="text-xs text-gray-400">Pending</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}