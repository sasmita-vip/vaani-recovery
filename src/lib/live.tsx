import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useAsync, type AsyncState } from '@/lib/useAsync';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

interface LiveContextValue {
  version: number;
  connection: ConnectionState;
  lastSynced: Date | null;
  markSynced: () => void;
  refresh: () => void;
}

const LiveContext = createContext<LiveContextValue>({
  version: 0,
  connection: 'connecting',
  lastSynced: null,
  markSynced: () => {},
  refresh: () => {},
});

const REALTIME_TABLES = ['calls', 'call_turns', 'escalations', 'promises_to_pay', 'outbound_messages'];
const POLL_INTERVAL_MS = 15_000;

export function LiveProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const subscribedOnce = useRef(false);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const markSynced = useCallback(() => setLastSynced(new Date()), []);

  useEffect(() => {
    const channel = supabase.channel('dashboard-live');

    for (const table of REALTIME_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        setVersion((v) => v + 1);
      });
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        subscribedOnce.current = true;
        setConnection('connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setConnection(subscribedOnce.current ? 'disconnected' : 'connecting');
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // While realtime is not healthy, keep the dashboard current by polling.
  useEffect(() => {
    if (connection === 'connected') return;
    const id = setInterval(() => setVersion((v) => v + 1), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [connection]);

  return (
    <LiveContext.Provider value={{ version, connection, lastSynced, markSynced, refresh }}>
      {children}
    </LiveContext.Provider>
  );
}

export function useLive() {
  return useContext(LiveContext);
}

/**
 * Loads data and reloads it whenever realtime reports a change.
 * A successful load updates the "Last synced" time in the top bar.
 */
export function useLiveData<T>(load: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const { version, markSynced } = useLive();
  const state = useAsync(load, [version, ...deps]);
  const { loading, error, data } = state;

  useEffect(() => {
    if (!loading && !error && data !== null) markSynced();
  }, [loading, error, data, markSynced]);

  return state;
}

/** Ticking clock used for live call timers. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
