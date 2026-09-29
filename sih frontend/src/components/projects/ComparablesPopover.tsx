import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects.api';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, IndianRupee, Timer, TrendingDown, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { RiskBadge } from '@/components/ui/risk-badge';
import { formatINR } from '@/utils/formatting';
import { buildComparableProjects } from '@/utils/project-insights';
import type { ComparableProject } from '@/utils/project-insights';
import type { Project } from '@/types';
import { cn } from '@/lib/utils';

interface ComparablesPopoverProps {
  project: Project;
  trigger: React.ReactElement;
  align?: 'left' | 'right';
}

export function ComparablesPopover({ project, trigger, align = 'right' }: ComparablesPopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const navigate = useNavigate();

  const { data: allProjects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsApi.getProjects, enabled: open });
  const comparables: ComparableProject[] = open ? buildComparableProjects(project, allProjects) : [];

  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    setPosition(panelPosition(anchor, align));

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setPosition(panelPosition(anchorRef.current, align));
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, align]);

  if (typeof document === 'undefined') return trigger;

  return (
    <>
      {/* Trigger stays in place so the table layout is unaffected. */}
      <span
        ref={anchorRef}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="inline-flex"
      >
        {trigger}
      </span>

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-label={`Comparable projects for ${project.name}`}
            className="fixed z-[1200] w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
            style={{ top: position.top, left: position.left }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  <History className="h-3 w-3" />
                  Previous similar data
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-gray-900">{project.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close comparable projects"
                className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {comparables.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-500">
                No comparable projects are recorded yet.
              </p>
            ) : (
              <ul className="max-h-[320px] divide-y divide-gray-50 overflow-y-auto">
                {comparables.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        navigate(`/projects/${item.id}`);
                      }}
                      className="block w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-accent"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-gray-900">
                            {item.name}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-gray-400">
                            {item.code} · {item.state}
                          </span>
                        </span>
                        <RiskBadge risk={item.riskLevel} />
                      </div>

                      <div className="mt-2.5 grid grid-cols-3 gap-2">
                        <Metric
                          icon={<IndianRupee className="h-3 w-3" />}
                          label="Paid out"
                          value={formatINR(item.amountCr)}
                        />
                        <Metric
                          icon={<TrendingDown className="h-3 w-3" />}
                          label="Delay"
                          value={item.delayDays !== null ? `${item.delayDays} days` : 'N/A'}
                          tone={item.delayDays !== null && item.delayDays >= 150 ? 'bad' : 'neutral'}
                        />
                        <Metric
                          icon={<Timer className="h-3 w-3" />}
                          label="Planned"
                          value={`${item.plannedDays} days`}
                        />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="border-t border-gray-100 px-4 py-2.5 text-[10px] leading-4 text-gray-400">
              Drawn from recorded projects with the same sector and risk level. Amounts are compensation
              actually disbursed; planned days run from start to expected end.
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}

function Metric({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'neutral' | 'bad';
}) {
  return (
    <span className="rounded-md bg-gray-50 px-2 py-1.5">
      <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-gray-400">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          'mt-0.5 block text-[11px] font-bold tabular-nums',
          tone === 'bad' ? 'text-red-600' : 'text-gray-800',
        )}
      >
        {value}
      </span>
    </span>
  );
}

function panelPosition(anchor: HTMLElement | null, align: 'left' | 'right') {
  if (!anchor || typeof window === 'undefined') return { top: 0, left: 0 };

  const rect = anchor.getBoundingClientRect();
  const width = 340;
  const margin = 12;
  const estimatedHeight = 420;

  let left = align === 'right' ? rect.right - width : rect.left;
  left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);

  const spaceBelow = window.innerHeight - rect.bottom;
  const top =
    spaceBelow >= estimatedHeight + margin
      ? rect.bottom + 6
      : Math.max(margin, rect.top - estimatedHeight - 6);

  return { top, left };
}
