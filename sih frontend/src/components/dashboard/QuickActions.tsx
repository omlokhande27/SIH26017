import { useNavigate } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import type { QuickActionDef } from '@/mock/executive';

interface QuickActionsProps {
  visibleActions: QuickActionDef[];
}

export function QuickActions({ visibleActions }: QuickActionsProps) {
  const navigate = useNavigate();

  return (
    <Card>
      <div className="border-b border-gray-100 px-6 py-4">
        <h3 className="text-base font-semibold text-gray-900">Quick Actions</h3>
      </div>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {visibleActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              onClick={() => navigate(action.path)}
              className="group flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3.5 text-left transition-all hover:border-brand-accent/50 hover:bg-brand-subtle/40"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-subtle">
                <Icon className="h-4.5 w-4.5 text-brand-primary" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{action.label}</p>
                <p className="truncate text-[11px] text-gray-500">{action.description}</p>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}