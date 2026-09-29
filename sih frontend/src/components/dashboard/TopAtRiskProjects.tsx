import { ArrowRight, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { RiskBadge } from '@/components/ui/risk-badge';
import type { ExecHighRiskProject } from '@/utils/executive-helpers';

interface TopAtRiskProjectsProps {
  projects: ExecHighRiskProject[];
  onViewAll?: () => void;
  onSelect?: (id: string) => void;
}

export function TopAtRiskProjects({ projects, onViewAll, onSelect }: TopAtRiskProjectsProps) {
  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <TriangleAlert className="h-4 w-4 shrink-0 text-brand-accent" />
          <h2 className="truncate text-base font-semibold text-gray-900">Top at-risk projects</h2>
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <p className="flex-1 px-5 py-8 text-center text-sm text-gray-500">
          No projects are currently at elevated risk.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                <th scope="col" className="w-8 py-2.5 pl-5 pr-1 font-bold">#</th>
                <th scope="col" className="py-2.5 pr-3 font-bold">Project / Village</th>
                <th scope="col" className="py-2.5 pr-3 font-bold">Region</th>
                <th scope="col" className="py-2.5 pr-5 text-right font-bold">Risk</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project, index) => {
                const Row = onSelect ? 'button' : 'div';
                return (
                  <tr key={project.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/70">
                    <td className="py-2.5 pl-5 pr-1 align-middle text-xs font-semibold text-gray-400 tabular-nums">
                      {index + 1}
                    </td>
                    <td className="py-2.5 pr-3 align-middle">
                      <Row
                        {...(onSelect
                          ? { type: 'button' as const, onClick: () => onSelect(project.id) }
                          : {})}
                        className="block max-w-[13rem] truncate text-left text-[13px] font-semibold text-gray-900 hover:text-brand-primary"
                      >
                        {project.name}
                      </Row>
                      <span className="mt-0.5 block text-[11px] text-gray-400">
                        {project.delay > 0 ? `${project.delay} days predicted delay` : project.topIssue}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 align-middle">
                      <span className="block text-[13px] text-gray-700">{project.district}</span>
                      <span className="block text-[11px] text-gray-400">{project.state}</span>
                    </td>
                    <td className="py-2.5 pr-5 text-right align-middle">
                      <RiskBadge risk={project.risk} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
