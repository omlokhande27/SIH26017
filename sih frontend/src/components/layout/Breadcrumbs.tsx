import { useLocation, Link } from 'react-router';
import { Home, ChevronRight } from 'lucide-react';

export function Breadcrumbs() {
  const location = useLocation();
  const paths = location.pathname.split('/').filter((p) => p);

  // If we are at home
  if (paths.length === 0) {
    return (
      <div className="flex items-center text-sm text-gray-500">
        <Home className="w-4 h-4 mr-2" />
        <span className="font-medium text-gray-900">Dashboard</span>
      </div>
    );
  }

  return (
    <div className="flex items-center text-sm text-gray-500 space-x-1 sm:space-x-2">
      <Link
        to="/dashboard"
        className="flex items-center hover:text-brand-accent transition-colors"
        title="Dashboard"
      >
        <Home className="w-4 h-4" />
      </Link>
      
      {paths.map((path, index) => {
        const isLast = index === paths.length - 1;
        const to = `/${paths.slice(0, index + 1).join('/')}`;
        
        // Capitalize and clean up path segment
        let label = path.replace(/-/g, ' ');
        label = label.charAt(0).toUpperCase() + label.slice(1);
        
        // Handle IDs (very simple heuristic)
        if (path.length > 15 && path.includes('-')) {
          label = 'Details';
        }

        return (
          <div key={to} className="flex items-center space-x-1 sm:space-x-2">
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
            {isLast ? (
              <span className="font-medium text-gray-900 truncate max-w-[120px] sm:max-w-[200px]" title={label}>
                {label}
              </span>
            ) : (
              <Link
                to={to}
                className="hover:text-brand-accent transition-colors truncate max-w-[100px] sm:max-w-[150px]"
                title={label}
              >
                {label}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
