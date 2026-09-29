import { Outlet } from 'react-router';
import { SidebarProvider } from '@/context/SidebarContext';
import { useSidebar } from '@/context/useSidebar';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { useAuth } from '@/context/useAuth';
import { cn } from '@/lib/utils';

function AppLayoutInner() {
  const { isMobileOpen, closeMobile } = useSidebar();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Outlet />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg-app">
      {/* Mobile overlay */}
      <div 
        className={cn(
          "fixed inset-0 bg-gray-900/50 z-10 lg:hidden transition-opacity",
          isMobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={closeMobile}
      />

      {/* Sidebar - fixed on mobile, static on desktop */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-20 lg:static transition-transform duration-250 ease-in-out",
        isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <Sidebar />
      </div>

      {/* Main Content */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden transition-all duration-250">
        <TopNav />
        <main className="isolate flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <SidebarProvider>
      <AppLayoutInner />
    </SidebarProvider>
  );
}
