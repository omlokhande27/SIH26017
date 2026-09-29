import { useState, useRef, useEffect } from 'react';
import { Bell, BellRing, BellOff, ShieldAlert, Brain, Clock, DollarSign, Info, Check } from 'lucide-react';
import { NotificationType, type Notification } from '@/types';
import { useViewerNotifications } from '@/hooks/useViewerNotifications';
import { cn } from '@/lib/utils';

const notificationsArray: Notification[] = []; // No backend endpoint yet
const projectNotifications = notificationsArray.filter((notification) => Boolean(notification.projectId));

// Simple relative time formatter
function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { enabled: updatesEnabled, enable: enableUpdates, disable: disableUpdates } = useViewerNotifications();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const visibleNotifications = updatesEnabled
    ? (notifications.length > 0 ? notifications : projectNotifications)
    : [];
  const unreadCount = visibleNotifications.filter((notification) => !notification.read).length;

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const markAllAsRead = () => {
    setNotifications(visibleNotifications.map((notification) => ({ ...notification, read: true })));
  };

  const markAsRead = (id: string) => {
    setNotifications(visibleNotifications.map((notification) => notification.id === id ? { ...notification, read: true } : notification));
  };

  const toggleUpdates = async () => {
    if (updatesEnabled) {
      disableUpdates();
    } else {
      await enableUpdates();
    }
  };

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case NotificationType.RISK_CHANGE: return <ShieldAlert className="w-4 h-4 text-risk-high" />;
      case NotificationType.PREDICTION_READY: return <Brain className="w-4 h-4 text-brand-accent" />;
      case NotificationType.ACTION_DEADLINE: return <Clock className="w-4 h-4 text-risk-medium" />;
      case NotificationType.COMPENSATION_UPDATE: return <DollarSign className="w-4 h-4 text-green-600" />;
      default: return <Info className="w-4 h-4 text-brand-secondary" />;
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        aria-label="Open notifications"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-500 hover:text-brand-navy hover:bg-gray-100 rounded-full transition-colors focus:outline-none"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-[60] mt-2 w-80 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-elevated sm:w-96">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                className="text-xs font-medium text-brand-accent hover:text-brand-primary flex items-center gap-1 transition-colors"
              >
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="border-b border-blue-100 bg-blue-50/70 px-4 py-3">
            <div className="flex items-start gap-2.5">
              {updatesEnabled ? <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /> : <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-blue-900">Project notifications</p>
                <p className="mt-0.5 text-[11px] leading-4 text-blue-700">
                  {updatesEnabled ? 'Project and risk updates are turned on for this portal.' : 'Notifications are off. Turn them on when you want project and risk updates.'}
                </p>
                <button type="button" onClick={toggleUpdates} className="mt-2 text-[11px] font-bold text-blue-800 underline underline-offset-2 hover:text-blue-950">
                  {updatesEnabled ? 'Turn off updates' : 'Turn on notifications'}
                </button>
              </div>
            </div>
          </div>
          
          <div className="max-h-80 overflow-y-auto">
            {visibleNotifications.length > 0 ? (
              <ul className="divide-y divide-gray-100">
                {visibleNotifications.slice(0, 6).map((notification) => (
                  <li 
                    key={notification.id}
                    className={cn(
                      "px-4 py-3 hover:bg-gray-50 transition-colors",
                      !notification.read ? "bg-blue-50/30" : ""
                    )}
                    onClick={() => markAsRead(notification.id)}
                  >
                    <div className="flex gap-3">
                      <div className="mt-0.5 shrink-0">
                        <div className="w-8 h-8 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center">
                          {getIcon(notification.type)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm text-gray-900", !notification.read && "font-semibold")}>
                          {notification.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {formatTimeAgo(notification.timestamp)}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="shrink-0 flex items-center">
                          <div className="w-2 h-2 rounded-full bg-brand-accent"></div>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-8 text-center">
                <BellOff className="mx-auto h-7 w-7 text-gray-300" />
                <p className="mt-2 text-sm font-semibold text-gray-700">Notifications are off</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">Turn on notifications above to see project and risk updates here.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
