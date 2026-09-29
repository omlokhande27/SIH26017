import { useMemo, useState, useEffect } from 'react';
import { ClipboardCheck, Eye, ListChecks } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { ActionCard } from '@/components/actions/action-card';
import { ActionFiltersBar } from '@/components/actions/action-filters';
import {
  DEFAULT_ACTION_FILTERS,
  matchesActionFilters,
} from '@/components/actions/action-filter-utils';
import { recommendationsApi } from '@/api/recommendations.api';
import { useAuth } from '@/context/useAuth';
import type { Recommendation } from '@/types';
import { ActionStatus } from '@/types';
import { cn } from '@/lib/utils';

export default function Recommendations() {
  const { canManage } = useAuth();
  
  const { data: recommendations = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['recommendations'],
    queryFn: recommendationsApi.getRecommendations,
  });

  const [items, setItems] = useState<Recommendation[]>([]);

  useEffect(() => {
    if (recommendations) {
      setItems(recommendations);
    }
  }, [recommendations]);
  const [filters, setFilters] = useState(DEFAULT_ACTION_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmComplete, setConfirmComplete] = useState<Recommendation | null>(null);
  const [blockTarget, setBlockTarget] = useState<Recommendation | null>(null);
  const [blockReason, setBlockReason] = useState('');

  const applyUpdate = (updated: Recommendation) => {
    setItems((prev) => prev.map((rec) => (rec.id === updated.id ? updated : rec)));
  };

  const handleStart = async (id: string) => {
    setBusyId(id);
    try {
      applyUpdate(await recommendationsApi.startAction(id));
    } finally {
      setBusyId(null);
    }
  };

  const handleComplete = async () => {
    if (!confirmComplete) return;
    const id = confirmComplete.id;
    setConfirmComplete(null);
    setBusyId(id);
    try {
      applyUpdate(await recommendationsApi.completeAction(id));
    } finally {
      setBusyId(null);
    }
  };

  const handleBlock = async () => {
    if (!blockTarget || !blockReason.trim()) return;
    const id = blockTarget.id;
    setBlockTarget(null);
    setBlockReason('');
    setBusyId(id);
    try {
      applyUpdate(await recommendationsApi.blockAction(id, blockReason.trim()));
    } finally {
      setBusyId(null);
    }
  };

  const handleReopen = async (id: string) => {
    setBusyId(id);
    try {
      applyUpdate(await recommendationsApi.reopenAction(id));
    } finally {
      setBusyId(null);
    }
  };

  const priorityOptions = useMemo(
    () => [...new Set(items.map((r) => r.priorityRank))].sort((a, b) => a - b),
    [items]
  );
  const projectOptions = useMemo(() => [...new Set(items.map((r) => r.projectName))].sort(), [items]);

  const countByStatus = useMemo(() => {
    const counts = { [ActionStatus.PENDING]: 0, [ActionStatus.IN_PROGRESS]: 0, [ActionStatus.COMPLETED]: 0, [ActionStatus.OVERDUE]: 0, [ActionStatus.BLOCKED]: 0 };
    for (const rec of items) counts[rec.actionStatus] += 1;
    return counts;
  }, [items]);

  const filtered = useMemo(
    () =>
      items
        .filter((rec) => matchesActionFilters(rec, filters))
        .sort((a, b) => a.priorityRank - b.priorityRank),
    [items, filters]
  );

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading recommendations...</div>;
  }

  if (isError) {
    return <div className="p-8 text-center text-red-500">Failed to load recommendations.</div>;
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader
          title="Priority Action Plan"
          description="Recommended interventions for projects requiring attention."
        />
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!canManage && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              <Eye className="h-3.5 w-3.5" /> Viewer mode
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600">
            <ClipboardCheck className="h-3.5 w-3.5 text-brand-accent" />
            {countByStatus[ActionStatus.PENDING]} pending · {countByStatus[ActionStatus.IN_PROGRESS]} in progress
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600">
            <ListChecks className="h-3.5 w-3.5 text-brand-accent" />
            {countByStatus[ActionStatus.COMPLETED]} completed · {countByStatus[ActionStatus.BLOCKED]} blocked
          </span>
        </div>
      </div>

      <ActionFiltersBar
        filters={filters}
        onChange={setFilters}
        priorityOptions={priorityOptions}
        projectOptions={projectOptions}
        countByStatus={countByStatus}
        totalCount={items.length}
        shownCount={filtered.length}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No actions match these filters"
          description="Adjust the priority, project, risk level or status to see more actions."
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((rec) => (
            <ActionCard
              key={rec.id}
              rec={rec}
              busyId={busyId}
              onStart={handleStart}
              onComplete={(id) => {
                const recToConfirm = items.find((r) => r.id === id);
                if (recToConfirm) setConfirmComplete(recToConfirm);
              }}
              onBlock={(id) => {
                const recToBlock = items.find((r) => r.id === id);
                if (recToBlock) setBlockTarget(recToBlock);
              }}
              onReopen={handleReopen}
              readOnly={!canManage}
            />
          ))}
        </div>
      )}

      {/* Completion confirmation */}
      <Modal
        isOpen={confirmComplete !== null}
        onClose={() => setConfirmComplete(null)}
        title="Complete this action?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmComplete(null)}>
              Cancel
            </Button>
            <Button onClick={handleComplete}>Confirm Complete</Button>
          </>
        }
      >
        {confirmComplete && (
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--color-bg-muted)] p-3">
              <p className="text-sm font-semibold text-gray-900">{confirmComplete.title}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {confirmComplete.projectName} · {confirmComplete.owner}
              </p>
            </div>
            <p className="text-xs leading-relaxed text-gray-600">
              On completion, a fresh prediction run is triggered to measure the outcome. The delta shown is a{' '}
              <span className="font-semibold">mock figure</span> until the backend analytics service supplies verified
              prediction updates.
            </p>
          </div>
        )}
      </Modal>

      {/* Block confirmation */}
      <Modal
        isOpen={blockTarget !== null}
        onClose={() => {
          setBlockTarget(null);
          setBlockReason('');
        }}
        title="Mark action as blocked?"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setBlockTarget(null);
                setBlockReason('');
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" disabled={!blockReason.trim()} onClick={handleBlock}>
              Block Action
            </Button>
          </>
        }
      >
        {blockTarget && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-gray-600">
              Blocking <span className="font-semibold text-gray-900">{blockTarget.title}</span> pauses the action until
              the blocker is resolved.
            </p>
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">Blocking reason</span>
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                rows={3}
                placeholder="Describe what is preventing progress…"
                className={cn(
                  'mt-1.5 w-full resize-none rounded-[var(--radius-md)] border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors',
                  'placeholder:text-gray-400 focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/30'
                )}
              />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}