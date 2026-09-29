import { NavLink } from 'react-router';
import { useSidebar } from '@/context/useSidebar';
import { useAuth } from '@/context/useAuth';
import { UserRole } from '@/types';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FolderKanban,
  PlusCircle,
  ShieldAlert,
  Brain,
  Map,
  BarChart3,
  ClipboardCheck,
  FileText,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: [UserRole.GOVERNMENT_OFFICER, UserRole.PROJECT_MANAGER, UserRole.WORKER, UserRole.VIEWER] },
  { label: 'Projects', path: '/projects', icon: FolderKanban, roles: [UserRole.GOVERNMENT_OFFICER, UserRole.PROJECT_MANAGER, UserRole.WORKER, UserRole.VIEWER] },
  { label: 'Add Project', path: '/projects/new', icon: PlusCircle, roles: [UserRole.GOVERNMENT_OFFICER, UserRole.PROJECT_MANAGER] },
  { label: 'Risk Monitor', path: '/risk-monitor', icon: ShieldAlert, roles: [UserRole.GOVERNMENT_OFFICER, UserRole.PROJECT_MANAGER, UserRole.VIEWER] },
  { label: 'AI Prediction', path: '/prediction', icon: Brain, roles: [UserRole.GOVERNMENT_OFFICER, UserRole.PROJECT_MANAGER] },
  { label: 'Risk Map', path: '/risk-map', icon: Map, roles: [UserRole.GOVERNMENT_OFFICER, UserRole.PROJECT_MANAGER, UserRole.WORKER, UserRole.VIEWER] },
  { label: 'Action Plan', path: '/recommendations', icon: ClipboardCheck, roles: [UserRole.GOVERNMENT_OFFICER, UserRole.PROJECT_MANAGER, UserRole.VIEWER] },
  { label: 'Analytics', path: '/analytics', icon: BarChart3, roles: [UserRole.GOVERNMENT_OFFICER, UserRole.PROJECT_MANAGER, UserRole.VIEWER] },
  { label: 'Reports', path: '/reports', icon: FileText, roles: [UserRole.GOVERNMENT_OFFICER, UserRole.PROJECT_MANAGER] },
];

export function Sidebar() {
  const { isCollapsed, toggle, closeMobile } = useSidebar();
  const { currentUser, accessRole } = useAuth();

  if (!currentUser) return null;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const filteredNavItems = NAV_ITEMS.filter((item) => accessRole && item.roles.includes(accessRole));

  return (
    <aside
      className={cn(
        "flex flex-col bg-brand-navy text-white transition-all duration-250 ease-in-out h-screen border-r border-brand-primary/50 relative group z-20",
        isCollapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Top Branding */}
      <div className="flex items-center h-14 px-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 w-full">
          {/* Simple geometric shield with grid lines SVG */}
          <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-brand-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-brand-accent">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M2 12h20" />
            </svg>
          </div>
          
          <div className={cn("flex flex-col overflow-hidden whitespace-nowrap transition-all duration-250", isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>
            <span className="font-bold text-sm tracking-wide">LANDGUARD AI</span>
            <span className="text-[10px] text-white/50 tracking-wider">PREDICTIVE ANALYTICS</span>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-none">
        {filteredNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={closeMobile}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors relative group/nav",
                  isActive
                    ? "bg-brand-accent text-white"
                    : "text-white/70 hover:bg-brand-secondary hover:text-white"
                )
              }
              title={isCollapsed ? item.label : undefined}
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r-full" />}
                  <Icon className="w-5 h-5 shrink-0" />
                  <span
                    className={cn(
                      "text-sm font-medium whitespace-nowrap transition-all duration-250",
                      isCollapsed ? "w-0 opacity-0 hidden" : "w-auto opacity-100"
                    )}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Bottom Section */}
      <div className="mt-auto border-t border-white/10 p-3 space-y-1">
        {accessRole === UserRole.GOVERNMENT_OFFICER && (
          <NavLink
            to="/administration"
            onClick={closeMobile}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors group/nav",
                isActive
                  ? "bg-brand-accent text-white"
                  : "text-white/70 hover:bg-brand-secondary hover:text-white"
              )
            }
            title={isCollapsed ? "Administration" : undefined}
          >
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span className={cn("text-sm font-medium whitespace-nowrap transition-all duration-250", isCollapsed ? "w-0 opacity-0 hidden" : "w-auto opacity-100")}>
              Administration
            </span>
          </NavLink>
        )}
        {/* User Mini-Card */}
        <div className={cn("flex items-center gap-3 mt-4 mb-2 px-2 transition-all duration-250", isCollapsed ? "justify-center" : "justify-start")}>
          <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center shrink-0 border border-white/20">
            <span className="text-xs font-bold text-white">{getInitials(currentUser.name)}</span>
          </div>
          <div className={cn("flex flex-col overflow-hidden whitespace-nowrap", isCollapsed ? "w-0 opacity-0 hidden" : "w-auto opacity-100")}>
            <span className="text-sm font-medium text-white truncate max-w-[160px]">{currentUser.name}</span>
            <span className="text-[10px] text-white/50 truncate max-w-[160px]">{accessRole?.replace('_', ' ')}</span>
          </div>
        </div>
      </div>

      {/* Collapse Toggle */}
      <button
        type="button"
        aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        onClick={toggle}
        className="absolute -right-3.5 top-16 hidden bg-brand-navy border border-white/10 text-white rounded-full p-1 hover:bg-brand-secondary transition-colors z-30 items-center justify-center lg:flex"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}
