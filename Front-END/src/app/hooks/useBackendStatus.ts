import { useEffect, useState } from 'react';

type BackendStatus = 'checking' | 'online' | 'offline';

export function useBackendStatus() {
  const [status, setStatus] = useState<BackendStatus>('checking');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8080/api/status', {
          cache: 'no-store',
        });
        if (!cancelled) {
          setStatus(response.ok ? 'online' : 'offline');
          setLastChecked(new Date());
        }
      } catch {
        if (!cancelled) {
          setStatus('offline');
          setLastChecked(new Date());
        }
      }
    };

    check();
    const interval = window.setInterval(check, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return { status, lastChecked };
}
