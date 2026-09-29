import type { Project } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatTile } from './stat-tile';
import { formatINR, formatPercentage } from '@/utils/formatting';

interface CompensationSummaryProps {
  project: Project;
}

export function CompensationSummary({ project }: CompensationSummaryProps) {
  const paidPct = project.compensationRequired > 0
    ? (project.compensationPaid / project.compensationRequired) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatTile label="Compensation Required" value={formatINR(project.compensationRequired)} />
        <StatTile label="Compensation Paid" value={formatINR(project.compensationPaid)} sub="disbursed to landowners" />
        <StatTile label="Compensation Pending" value={formatINR(project.compensationPending)} sub="awaiting disbursal" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Disbursement Progress</CardTitle>
            <span className="text-sm font-semibold text-[var(--color-risk-low)]">
              {formatPercentage(paidPct)} Paid
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <ProgressBar
            value={paidPct}
            variant={paidPct >= 75 ? 'success' : paidPct >= 40 ? 'warning' : 'error'}
            size="lg"
            className="mt-4"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Compensation Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">Paid</span>
              <span className="text-gray-500">
                {formatINR(project.compensationPaid)} of {formatINR(project.compensationRequired)}
              </span>
            </div>
            <ProgressBar value={project.compensationPaid} max={project.compensationRequired} variant="success" size="md" />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">Pending</span>
              <span className="text-gray-500">{formatINR(project.compensationPending)}</span>
            </div>
            <ProgressBar value={project.compensationPending} max={project.compensationRequired} variant="error" size="md" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}