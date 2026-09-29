import { AlertTriangle } from 'lucide-react';
import type { Project, ProjectIssue } from '@/types';
import { RiskLevel } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RiskBadge } from '@/components/ui/risk-badge';
import { getRiskColor } from '@/utils/formatting';
import { cn } from '@/lib/utils';

interface IssuesPanelProps {
  project: Project;
}

const ISSUE_STATUS_CONFIG: Record<ProjectIssue['status'], { label: string; badgeClass: string }> = {
  OPEN: { label: 'Open', badgeClass: 'bg-[var(--color-risk-high)]/10 text-[var(--color-risk-high)]' },
  IN_PROGRESS: { label: 'In Progress', badgeClass: 'bg-[var(--color-risk-medium)]/10 text-[var(--color-risk-medium)]' },
  MONITORING: { label: 'Monitoring', badgeClass: 'bg-blue-100 text-blue-800' },
  RESOLVED: { label: 'Resolved', badgeClass: 'bg-[var(--color-risk-low)]/10 text-[var(--color-risk-low)]' },
};

function IssueCard({ issue }: { issue: ProjectIssue }) {
  const statusConfig = ISSUE_STATUS_CONFIG[issue.status];

  return (
    <Card className="transition-colors hover:border-gray-300">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <span
                className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: getRiskColor(issue.severity) }}
              />
              {issue.title}
            </p>
            <p className="mt-1 text-xs font-medium text-gray-400">{issue.category}</p>
          </div>
          <RiskBadge risk={issue.severity} className="flex-shrink-0" />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{issue.description}</p>
        <div className="mt-4 flex items-center justify-between">
          <Badge className={cn(statusConfig.badgeClass)}>{statusConfig.label}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function IssuesPanel({ project }: IssuesPanelProps) {
  const issues = project.issues ?? [];
  const openCount = issues.filter((i) => i.status !== 'RESOLVED').length;

  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-gray-300 bg-[var(--color-bg-surface)] p-12 text-center">
        <AlertTriangle className="h-8 w-8 text-gray-400" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">No Active Issues</h3>
        <p className="mt-1 text-sm text-gray-500">
          No land acquisition issues have been reported for this project.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-2xl font-bold text-gray-900">{issues.length}</p>
              <p className="text-xs font-medium text-gray-500">Total Issues</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-gray-400" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-2xl font-bold text-gray-900">{openCount}</p>
              <p className="text-xs font-medium text-gray-500">Open / Active</p>
            </div>
            <RiskBadge risk={RiskLevel.HIGH} showIcon={false} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {issues.filter((i) => i.severity === RiskLevel.HIGH || i.severity === RiskLevel.CRITICAL).length}
              </p>
              <p className="text-xs font-medium text-gray-500">High / Critical</p>
            </div>
            <RiskBadge risk={RiskLevel.HIGH} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {issues.filter((i) => i.status === 'RESOLVED').length}
              </p>
              <p className="text-xs font-medium text-gray-500">Resolved</p>
            </div>
            <Badge variant="success">Resolved</Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} />
        ))}
      </div>
    </div>
  );
}