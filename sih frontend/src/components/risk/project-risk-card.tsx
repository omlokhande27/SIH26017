import { useNavigate } from 'react-router';
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Building2, CalendarClock, ChevronRight, MapPin, Minus } from 'lucide-react';
import type { Project } from '@/types';
import { StatusBadge } from '@/components/ui/status-badge';
import { RiskBadge } from '@/components/ui/risk-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { buildFactorsForProject } from '@/utils/prediction-helpers';
import { getRiskMovement, type RiskMovement } from '@/utils/risk';
import { formatPercentage, formatShortDate, getSectorLabel } from '@/utils/formatting';
import { cn } from '@/lib/utils';

const movementConfig: Record<RiskMovement, { Icon: typeof ArrowUpRight; className: string; label: string }> = {
  up: { Icon: ArrowUpRight, className: 'bg-[var(--color-risk-high)]/10 text-[var(--color-risk-high)]', label: 'Moved up' },
  down: { Icon: ArrowDownRight, className: 'bg-[var(--color-risk-low)]/10 text-[var(--color-risk-low)]', label: 'Moved down' },
  flat: { Icon: Minus, className: 'bg-gray-100 text-gray-500', label: 'Unchanged' },
};

function MovementChip({ project }: { project: Project }) {
  const movement = getRiskMovement(project);
  const { Icon, className, label } = movementConfig[movement];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        className
      )}
      title={label}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

export function ProjectRiskCard({ project }: { project: Project }) {
  const navigate = useNavigate();
  const topFactor = buildFactorsForProject(project)[0];
  const acqPct = project.acquisitionPercentage ?? 0;
  const delay = project.predictedDelay;
  const delayColor =
    delay !== null && delay >= 150
      ? 'text-[var(--color-risk-critical)]'
      : delay !== null && delay >= 75
        ? 'text-[var(--color-risk-medium)]'
        : 'text-[var(--color-risk-low)]';

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-gray-900">{project.name}</h4>
            <span className="text-xs text-gray-400">{project.code}</span>
            <MovementChip project={project} />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              {project.district}, {project.state}
            </span>
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-gray-400" />
              {getSectorLabel(project.sector)}
            </span>
            <span className="inline-flex items-center gap-1 text-gray-400">
              <CalendarClock className="h-3.5 w-3.5" />
              Updated {formatShortDate(project.updatedAt)}
            </span>
            <StatusBadge status={project.status} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-4">
            <Readout label="Risk">
              <RiskBadge risk={project.riskLevel} />
            </Readout>
            <Readout label="Predicted Delay">
              <span className={cn('text-sm font-semibold tabular-nums', delayColor)}>
                {delay !== null ? `${delay} days` : 'N/A'}
              </span>
            </Readout>
            <Readout label="Acquisition">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums text-gray-900">{formatPercentage(acqPct)}</span>
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      acqPct >= 75
                        ? 'bg-[var(--color-risk-low)]'
                        : acqPct >= 50
                          ? 'bg-[var(--color-risk-medium)]'
                          : 'bg-[var(--color-risk-high)]'
                    )}
                    style={{ width: `${Math.min(acqPct, 100)}%` }}
                  />
                </div>
              </div>
            </Readout>
            <Readout label="Top Factor">
              <span className="text-sm font-medium text-gray-700">{topFactor ? topFactor.name : '—'}</span>
            </Readout>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 lg:flex-col lg:items-end">
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${project.id}`)}>
            View Project
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}