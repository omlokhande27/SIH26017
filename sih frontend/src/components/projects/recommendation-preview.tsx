import { useNavigate } from 'react-router';
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import type { Project, Recommendation } from '@/types';
import { RiskLevel, ActionStatus } from '@/types';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { recommendationsApi } from '@/api/recommendations.api';
import { formatShortDate, getRiskColor } from '@/utils/formatting';
import { cn } from '@/lib/utils';

interface RecommendationPreviewProps {
  project: Project;
}

const STATUS_CONFIG: Record<ActionStatus, { label: string; badgeClass: string }> = {
  [ActionStatus.PENDING]: { label: 'Pending', badgeClass: 'bg-[var(--color-risk-medium)]/10 text-[var(--color-risk-medium)]' },
  [ActionStatus.IN_PROGRESS]: { label: 'In Progress', badgeClass: 'bg-blue-100 text-blue-800' },
  [ActionStatus.COMPLETED]: { label: 'Completed', badgeClass: 'bg-[var(--color-risk-low)]/10 text-[var(--color-risk-low)]' },
  [ActionStatus.OVERDUE]: { label: 'Overdue', badgeClass: 'bg-[var(--color-risk-high)]/10 text-[var(--color-risk-high)]' },
  [ActionStatus.BLOCKED]: { label: 'Blocked', badgeClass: 'bg-gray-100 text-gray-500 border border-gray-200' },
};

const IMPACT_BY_SEVERITY: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'Reduces predicted delay by ~10 days',
  [RiskLevel.MEDIUM]: 'Reduces predicted delay by ~25 days',
  [RiskLevel.HIGH]: 'Reduces predicted delay by ~45 days',
  [RiskLevel.CRITICAL]: 'Prevents further escalation of delay',
};

function deriveRecommendations(project: Project): Recommendation[] {
  const issues = project.issues ?? [];
  return issues.slice(0, 3).map((issue, idx) => ({
    id: `derived_${issue.id}`,
    projectId: project.id,
    projectName: project.name,
    title: `Resolve ${issue.title.toLowerCase()}`,
    description: issue.description,
    priority: issue.severity,
    category: issue.category,
    estimatedImpact: IMPACT_BY_SEVERITY[issue.severity],
    deadline: new Date(Date.now() + 30 * (1 + idx) * 86400000).toISOString(),
    actionStatus: ActionStatus.PENDING,
    createdAt: project.updatedAt,
    priorityRank: idx + 1,
    riskFactor: issue.title,
    recommendedAction: issue.description,
    impact: issue.severity,
    owner: project.projectManager,
    riskLevel: project.riskLevel,
    predictedDelayAtRecommendation: project.predictedDelay ?? 0,
  }));
}

export function RecommendationPreview({ project }: RecommendationPreviewProps) {
  const navigate = useNavigate();
  const { data: official = [] } = useQuery({
    queryKey: ['recommendations', project.id],
    queryFn: () => recommendationsApi.getRecommendationsByProjectId(project.id),
  });
  const recommendations: Recommendation[] = official.length > 0 ? official.slice(0, 3) : deriveRecommendations(project);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Recommended Actions
            <span className="ml-2 text-xs font-medium text-gray-400">
              {official.length > 0 ? 'AI generated suggestions' : 'Derived from project issues'}
            </span>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {recommendations.map((rec) => {
          const statusConfig = STATUS_CONFIG[rec.actionStatus];
          return (
            <div
              key={rec.id}
              className="flex items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-gray-200 p-4 transition-colors hover:border-gray-300"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: getRiskColor(rec.priority) }} />
                  {rec.title}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-gray-600">{rec.description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <Badge variant="outline">{rec.category}</Badge>
                  <span className="text-xs font-medium text-[var(--color-brand-primary)]">{rec.estimatedImpact}</span>
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3 w-3" />
                    {formatShortDate(rec.deadline)}
                  </span>
                </div>
              </div>
              <Badge className={cn('flex-shrink-0', statusConfig.badgeClass)}>
                {rec.actionStatus === ActionStatus.COMPLETED && <CheckCircle2 className="mr-1 h-3 w-3" />}
                {statusConfig.label}
              </Badge>
            </div>
          );
        })}
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full" onClick={() => navigate('/recommendations')}>
          View Action Plan
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}