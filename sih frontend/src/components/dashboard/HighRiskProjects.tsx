import { useNavigate } from 'react-router';
import { AlertTriangle, ArrowRight, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { RiskBadge } from '@/components/ui/risk-badge';
import { EmptyState } from '@/components/ui/empty-state';
import type { ExecHighRiskProject } from '@/mock/executive';

interface HighRiskProjectsProps {
  projects: ExecHighRiskProject[];
  onViewAll: () => void;
}

export function HighRiskProjects({ projects, onViewAll }: HighRiskProjectsProps) {
  const navigate = useNavigate();

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900">Projects Needing Attention</h3>
          <span className="flex items-center gap-1 rounded-full bg-risk-high-bg px-2.5 py-0.5 text-[10px] font-semibold text-risk-high">
            <AlertTriangle className="h-3 w-3" />
            HIGH
          </span>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-semibold text-brand-primary transition-colors hover:text-brand-accent"
        >
          View All
        </button>
      </div>

      {projects.length === 0 ? (
        <CardContent className="p-6">
          <EmptyState
            icon={AlertTriangle}
            title="No high-risk projects"
            description="No projects are currently flagged as high risk. Keep monitoring emerging risks."
          />
        </CardContent>
      ) : (
        <CardContent className="divide-y divide-gray-100 p-0">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => navigate(`/projects/${project.id}`)}
              className="group flex w-full flex-col gap-2 px-6 py-4 text-left transition-colors hover:bg-bg-muted/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-primary">
                    {project.name}
                  </p>
                  <RiskBadge risk={project.risk} className="rounded-md px-2 py-0.5" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-risk-medium tabular-nums">{project.delay} days</span>
                  <ArrowRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-accent" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-gray-400" />
                  {project.state} • {project.district} • {project.sector}
                </span>
                <span className="flex items-center gap-1 text-gray-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-risk-high" />
                  Top issue: {project.topIssue}
                </span>
              </div>
            </button>
          ))}
        </CardContent>
      )}
    </Card>
  );
}