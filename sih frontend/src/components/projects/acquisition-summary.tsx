import type { Project } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatTile } from './stat-tile';
import { LandTimeline } from './land-timeline';
import { formatHectares, formatPercentage } from '@/utils/formatting';

interface AcquisitionSummaryProps {
  project: Project;
}

export function AcquisitionSummary({ project }: AcquisitionSummaryProps) {
  const acquiredPct = Math.min(100, project.acquisitionPercentage);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Land Required" value={formatHectares(project.landRequired)} />
        <StatTile label="Land Acquired" value={formatHectares(project.landAcquired)} />
        <StatTile label="Acquisition Progress" value={formatPercentage(acquiredPct)} sub="of total required" />
        <StatTile
          label="Affected"
          value={String(project.affectedFamilies ?? '—')}
          sub={`${project.affectedLandowners ?? '—'} landowners`}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Acquisition Progress</CardTitle>
            <span className="text-sm font-semibold text-[var(--color-brand-primary)]">
              {formatPercentage(acquiredPct)}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <ProgressBar
            value={acquiredPct}
            variant={acquiredPct >= 75 ? 'success' : acquiredPct >= 40 ? 'default' : 'warning'}
            size="lg"
            className="mt-4"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Acquisition Timeline</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <LandTimeline
            notificationDate={project.notificationDate}
            awardDate={project.awardDate}
            possessionDate={project.possessionDate}
          />
        </CardContent>
      </Card>
    </div>
  );
}