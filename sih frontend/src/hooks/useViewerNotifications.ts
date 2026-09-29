import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'landguard-viewer-updates-enabled';
const EVENT_NAME = 'landguard-viewer-updates-changed';

type NotificationPermissionState = NotificationPermission | 'unsupported';

function readEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function getPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function useViewerNotifications() {
  const [enabled, setEnabled] = useState(readEnabled);
  const [permission, setPermission] = useState<NotificationPermissionState>(getPermission);

  useEffect(() => {
    const handleChange = () => {
      setEnabled(readEnabled());
      setPermission(getPermission());
    };

    window.addEventListener(EVENT_NAME, handleChange);
    window.addEventListener('storage', handleChange);
    return () => {
      window.removeEventListener(EVENT_NAME, handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, []);

  const enable = useCallback(async () => {
    let nextPermission = getPermission();
    if (nextPermission === 'default') {
      try {
        nextPermission = await Notification.requestPermission();
      } catch {
        nextPermission = 'denied';
      }
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // In-app updates still work when storage is unavailable.
    }
    setPermission(nextPermission);
    setEnabled(true);
    window.dispatchEvent(new Event(EVENT_NAME));
    return nextPermission;
  }, []);

  const disable = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'false');
    } catch {
      // The in-memory state still updates for this page.
    }
    setEnabled(false);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  return { enabled, permission, enable, disable };
}
