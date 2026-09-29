import { Menu } from 'lucide-react';
import { useSidebar } from '@/context/useSidebar';
import { useAuth } from '@/context/useAuth';
import { Breadcrumbs } from './Breadcrumbs';
import { GlobalSearch } from './GlobalSearch';
import { NotificationDropdown } from './NotificationDropdown';
import { UserMenu } from './UserMenu';

export function TopNav() {
  const { isMobileOpen, toggleMobile } = useSidebar();
  const { currentUser, accessRole } = useAuth();

  if (!currentUser) return null;

  const formatRole = (role: string) => {
    return role.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  };

  return (
    <header className="z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 shadow-sm lg:z-30 lg:px-4">
      {/* Left section */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={toggleMobile}
          aria-label={isMobileOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={isMobileOpen}
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 focus:outline-none lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden min-w-0 sm:block">
          <Breadcrumbs />
        </div>
      </div>

      {/* Center section */}
      <div className="hidden min-w-0 flex-1 justify-center px-4 md:flex">
        <GlobalSearch />
      </div>

      {/* Right section */}
      <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
        <div className="hidden md:block">
          <span className="rounded-md border border-gray-200 bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500">
            {formatRole(accessRole ?? currentUser.role)}
          </span>
        </div>

        <div className="mx-1 hidden h-6 w-px bg-gray-200 sm:block" />

        <NotificationDropdown />
        <UserMenu />
      </div>
    </header>
  );
}
